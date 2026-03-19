import * as fs from 'fs';
import * as path from 'path';
import { Config, SourceFolderConfig } from '../infrastructure/config/Config';
import { Converter, FileConversionResult as ConverterFileResult, ConversionResult as ConverterConversionResult } from '../application/convert/Converter';
import { EnhancedConverter } from '../application/convert/EnhancedConverter';
import { LinkVerificationService } from '../domain/link/LinkVerificationService';
import {
  ObsidianConvertOptions,
  SingleFileConvertOptions,
  DirectoryConvertOptions,
  ValidateOptions,
  FileConversionResult,
  ConversionResult,
  ValidationResult,
  ValidationIssue,
  ConversionEvent,
  ConversionProgress,
  EventCallback,
  InternalConverterOptions,
} from './types';

/**
 * Main entry point for programmatic use of obsidian-convert
 */
export class ObsidianConvert {
  private config: Config;
  private converter: Converter | EnhancedConverter;
  private eventListeners: Map<ConversionEvent, EventCallback[]>;
  private useEnhanced: boolean;
  private startTime: number = 0;

  constructor(options: ObsidianConvertOptions) {
    // Normalize and build internal config
    this.config = this.normalizeConfig(options);

    // Determine whether to use enhanced converter
    this.useEnhanced = !!(
      options.streaming?.enabled ||
      options.workers?.workers ||
      options.incremental?.statePath ||
      options.transformers
    );

    // Initialize event listeners
    this.eventListeners = new Map();

    // Create the appropriate converter
    const internalOptions: InternalConverterOptions = {
      verbose: options.verbose,
      dryRun: options.dryRun,
      outputFormat: options.format,
      brokenLinkHandling: options.brokenLinkHandling,
      warnOnBroken: options.warnOnBroken,
      streaming: options.streaming,
      worker: options.workers,
      incremental: options.incremental,
    };

    if (this.useEnhanced) {
      const enhancedConverter = new EnhancedConverter(this.config, internalOptions);
      // Apply transformer config if provided
      if (options.transformers && this.config.transformer) {
        const registry = enhancedConverter.getTransformerRegistry();
        if (this.config.transformer.errorIsolation !== undefined) {
          registry.setErrorIsolation(this.config.transformer.errorIsolation);
        }
      }
      this.converter = enhancedConverter;
    } else {
      this.converter = new Converter(this.config, internalOptions);
    }
  }

  /**
   * Normalize user options into internal Config format
   */
  private normalizeConfig(options: ObsidianConvertOptions): Config {
    // Normalize sourceFolders
    let sourceFolders: SourceFolderConfig[];
    if (!options.sourceFolders) {
      sourceFolders = [];
    } else if (typeof options.sourceFolders === 'string') {
      sourceFolders = [{ path: options.sourceFolders }];
    } else {
      sourceFolders = options.sourceFolders.map(p =>
        typeof p === 'string' ? { path: p } : p
      );
    }

    return {
      sourceFolders,
      outputDir: options.outputDir || './output',
      attachmentDir: options.attachmentDir,
      linkResolution: {},
      streaming: options.streaming,
      worker: options.workers,
      incremental: options.incremental,
      transformer: options.transformers,
    };
  }

  /**
   * Convert a single file
   * @param inputPath - Path to the input file
   * @param outputPathOrOptions - Output path or options
   */
  async convertFile(
    inputPath: string,
    outputPathOrOptions?: string | SingleFileConvertOptions
  ): Promise<FileConversionResult> {
    const opts = typeof outputPathOrOptions === 'string'
      ? { outputPath: outputPathOrOptions }
      : outputPathOrOptions || {};

    this.emit('start', `Starting file conversion: ${inputPath}`);
    this.emit('file-start', inputPath);
    this.startTime = Date.now();

    try {
      // Resolve paths
      const inputAbsolute = path.resolve(inputPath);
      const sourceRoot = path.dirname(inputAbsolute);

      // Calculate output path
      let outputPath = opts.outputPath || path.join(this.config.outputDir, path.basename(inputAbsolute));
      outputPath = path.resolve(outputPath);

      // Read file content for processing
      const content = await fs.promises.readFile(inputAbsolute, 'utf-8');

      // Process the file content using domain classes directly
      const processed = await this.processFileContent(content, inputAbsolute, sourceRoot);

      // Write output if not dryRun
      if (!opts.dryRun) {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, processed.content, 'utf-8');
      }

      const fileResult: FileConversionResult = {
        sourcePath: inputAbsolute,
        outputPath,
        content: opts.dryRun ? processed.content : undefined,
        wikiLinkCount: processed.wikiLinkCount,
        calloutCount: processed.calloutCount,
        attachmentCount: processed.attachmentCount,
        success: true,
        brokenLinks: processed.brokenLinks,
      };

      this.emit('file-complete', fileResult);
      return fileResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const fileResult: FileConversionResult = {
        sourcePath: inputPath,
        outputPath: '',
        wikiLinkCount: 0,
        calloutCount: 0,
        attachmentCount: 0,
        success: false,
        error: errorMessage,
        brokenLinks: [],
      };

      this.emit('file-error', fileResult);
      this.emit('error', `Error converting ${inputPath}: ${errorMessage}`);
      return fileResult;
    }
  }

  /**
   * Process file content through the conversion pipeline
   */
  private async processFileContent(
    content: string,
    filePath: string,
    sourceRoot: string
  ): Promise<{
    content: string;
    wikiLinkCount: number;
    calloutCount: number;
    attachmentCount: number;
    brokenLinks: string[];
  }> {
    // Import domain classes here to avoid circular dependencies
    const { LinkResolver, WikiLinkProcessor, CalloutConverter, FrontmatterProcessor } = await import('../domain');
    const { AttachmentHandler } = await import('../infrastructure/attachment');

    // Build link index if not already built
    const linkResolver = new LinkResolver({
      caseInsensitive: true,
      warnOnBroken: false,
    });
    await linkResolver.buildIndex([sourceRoot]);

    const wikiLinkProcessor = new WikiLinkProcessor(linkResolver, {
      brokenLinkHandling: 'keep',
      addMdExtension: true,
    });

    const calloutConverter = new CalloutConverter();
    const frontmatterProcessor = new FrontmatterProcessor();

    const attachmentDir = path.resolve(this.config.outputDir, this.config.attachmentDir || 'public/attachments');
    const attachmentHandler = new AttachmentHandler({
      attachmentDir,
      attachmentPath: '/attachments/',
    });

    // 1. Process frontmatter
    let result = frontmatterProcessor.processContent(content, {
      convertWikiLinks: true,
    });

    // 2. Process WikiLinks
    const wikiLinkResult = wikiLinkProcessor.process(result, filePath, sourceRoot);
    result = wikiLinkResult.content;

    // 3. Process attachments
    result = await attachmentHandler.processContent(result, filePath, sourceRoot);

    // 4. Process callouts
    const callouts = calloutConverter.parseCallouts(result);
    result = calloutConverter.convert(result, {
      format: 'markdown',
    });

    return {
      content: result,
      wikiLinkCount: wikiLinkResult.convertedCount,
      calloutCount: callouts.length,
      attachmentCount: attachmentHandler.getProcessedAttachments().length,
      brokenLinks: wikiLinkResult.brokenLinks,
    };
  }

  /**
   * Convert a directory of files
   * @param inputPath - Path to the input directory
   * @param outputPathOrOptions - Output directory or options
   */
  async convertDirectory(
    inputPath: string,
    outputPathOrOptions?: string | DirectoryConvertOptions
  ): Promise<ConversionResult> {
    const opts = typeof outputPathOrOptions === 'string'
      ? { outputPath: outputPathOrOptions }
      : outputPathOrOptions || {};

    this.startTime = Date.now();
    this.emit('start', `Starting directory conversion: ${inputPath}`);

    try {
      // Create a temporary config for this directory
      const tempConfig: Config = {
        sourceFolders: [{ path: inputPath }],
        outputDir: opts.outputPath || this.config.outputDir,
        attachmentDir: this.config.attachmentDir,
        linkResolution: this.config.linkResolution,
        transformer: this.config.transformer,
      };

      // Create appropriate converter
      let tempConverter: Converter | EnhancedConverter;
      if (this.useEnhanced) {
        tempConverter = new EnhancedConverter(tempConfig, {
          verbose: this.config.transformer ? false : undefined,
          dryRun: opts.dryRun,
          outputFormat: opts.format,
          streaming: this.config.streaming,
          worker: this.config.worker,
          incremental: this.config.incremental,
        });
      } else {
        tempConverter = new Converter(tempConfig, {
          verbose: false,
          dryRun: opts.dryRun,
          outputFormat: opts.format,
        });
      }

      // Find all markdown files first to emit progress
      const files = await this.findMarkdownFiles(inputPath, opts);
      const total = files.length;

      this.emit('progress', {
        current: 0,
        total,
        currentFile: '',
        percentage: 0,
      });

      // Convert using the converter
      const result = await tempConverter.convert();

      // Map results and emit events
      const mappedResults: FileConversionResult[] = result.fileResults.map((r, index) => {
        this.emit('progress', {
          current: index + 1,
          total,
          currentFile: r.sourcePath,
          percentage: Math.round(((index + 1) / total) * 100),
        });
        this.emit('file-complete', r);
        return r;
      });

      const duration = Date.now() - this.startTime;

      const conversionResult: ConversionResult = {
        totalFiles: result.totalFiles,
        successCount: result.successCount,
        failedCount: result.failedCount,
        totalWikiLinks: result.totalWikiLinks,
        totalCallouts: result.totalCallouts,
        totalAttachments: result.totalAttachments,
        fileResults: mappedResults,
        brokenLinks: result.brokenLinks,
        duration,
      };

      this.emit('complete', conversionResult);
      return conversionResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', `Error converting directory: ${errorMessage}`);

      return {
        totalFiles: 0,
        successCount: 0,
        failedCount: 0,
        totalWikiLinks: 0,
        totalCallouts: 0,
        totalAttachments: 0,
        fileResults: [],
        brokenLinks: [],
        duration: Date.now() - this.startTime,
      };
    }
  }

  /**
   * Validate notes for broken links, embeds, and orphans
   * @param inputPath - Path to validate (file or directory)
   * @param options - Validation options
   */
  async validate(inputPath: string, options?: ValidateOptions): Promise<ValidationResult> {
    this.emit('start', `Starting validation: ${inputPath}`);

    const opts = {
      checkLinks: options?.checkLinks ?? true,
      checkEmbeds: options?.checkEmbeds ?? true,
      checkOrphans: options?.checkOrphans ?? false,
    };

    const issues: ValidationIssue[] = [];
    let fileCount = 0;
    let linkCount = 0;
    let orphanCount = 0;

    try {
      // Find all markdown files
      const files = await this.findMarkdownFiles(inputPath, {});
      fileCount = files.length;

      // Build file index for orphan detection
      const fileIndex = new Set(files.map(f => path.basename(f, '.md')));

      // Create verification service
      const verificationService = new LinkVerificationService({
        outputDir: this.config.outputDir,
        verbose: false,
      });

      // Check each file
      for (const file of files) {
        const result = await verificationService.verifyFile(file);
        linkCount += result.totalCount;

        for (const link of result.links) {
          if (!link.isValid) {
            issues.push({
              type: 'broken-link',
              file: link.sourceFile,
              target: link.filePath,
              message: `Broken link: ${link.linkText} -> ${link.filePath}`,
            });
          }
        }

        // Check for orphan files (files not linked from anywhere)
        const baseName = path.basename(file, '.md');
        if (opts.checkOrphans && !this.isLinkedFile(baseName, files)) {
          orphanCount++;
          issues.push({
            type: 'orphan',
            file: file,
            message: `Orphan file: ${baseName} is not linked from any other file`,
          });
        }
      }

      const valid = issues.length === 0;

      this.emit('complete', {
        valid,
        issues,
        fileCount,
        linkCount,
        orphanCount,
      });

      return {
        valid,
        issues,
        fileCount,
        linkCount,
        orphanCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', `Validation error: ${errorMessage}`);

      return {
        valid: false,
        issues: [{
          type: 'broken-link',
          file: inputPath,
          message: `Validation failed: ${errorMessage}`,
        }],
        fileCount,
        linkCount,
        orphanCount,
      };
    }
  }

  /**
   * Register an event listener
   * @param event - Event type
   * @param callback - Callback function
   */
  on(event: ConversionEvent, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove an event listener
   * @param event - Event type
   * @param callback - Callback function to remove
   */
  off(event: ConversionEvent, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Close the converter and release resources
   */
  async close(): Promise<void> {
    if (this.converter instanceof EnhancedConverter) {
      await this.converter.close();
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  private emit(event: ConversionEvent, data: ConversionProgress | FileConversionResult | ConversionResult | ValidationResult | string): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Check if a file is linked from any other file
   */
  private isLinkedFile(baseName: string, files: string[]): boolean {
    // Simplified check - in a real implementation, would parse all files for links
    return files.some(f => {
      const content = fs.readFileSync(f, 'utf-8');
      return content.includes(`[[${baseName}]]`) || content.includes(`(${baseName})`);
    });
  }

  /**
   * Find all markdown files in a directory
   */
  private async findMarkdownFiles(
    dirPath: string,
    options: DirectoryConvertOptions
  ): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') &&
              !['node_modules', '.obsidian'].includes(entry.name) &&
              (options.recursive ?? true)) {
            await walk(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check include/exclude patterns
          if (options.include?.length) {
            const shouldInclude = options.include.some(pattern =>
              this.matchPattern(fullPath, pattern)
            );
            if (!shouldInclude) continue;
          }

          if (options.exclude?.length) {
            const shouldExclude = options.exclude.some(pattern =>
              this.matchPattern(fullPath, pattern)
            );
            if (shouldExclude) continue;
          }

          files.push(fullPath);
        }
      }
    };

    await walk(dirPath);
    return files;
  }

  /**
   * Simple glob-like pattern matching
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(filePath);
  }
}
