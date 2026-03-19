import * as fs from 'fs';
import * as path from 'path';
import { Config, SourceFolderConfig, StreamingConfig, WorkerConfig, IncrementalConfig } from '../../infrastructure/config/Config';
import { LinkResolver, WikiLinkProcessor, CalloutConverter, FrontmatterProcessor } from '../../domain';
import { AttachmentHandler } from '../../infrastructure/attachment/AttachmentHandler';
import { StreamingConverter, StreamConversionOptions } from './StreamingConverter';
import { WorkerPool, WorkerTask, WorkerResult } from '../worker/WorkerPool';
import { IncrementalConverter, ConversionState, FileConversionState, IncrementalOptions } from './IncrementalConverter';

/**
 * Result of converting a single file
 */
export interface FileConversionResult {
  /** Source file path */
  sourcePath: string;
  /** Output file path */
  outputPath: string;
  /** Number of attachments processed */
  attachmentCount: number;
  /** Number of WikiLinks converted */
  wikiLinkCount: number;
  /** Number of callouts converted */
  calloutCount: number;
  /** Whether conversion succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Broken links found */
  brokenLinks: string[];
}

/**
 * Result of a full conversion run
 */
export interface ConversionResult {
  /** Total files processed */
  totalFiles: number;
  /** Successfully converted files */
  successCount: number;
  /** Failed conversions */
  failedCount: number;
  /** Total attachments processed */
  totalAttachments: number;
  /** Total WikiLinks converted */
  totalWikiLinks: number;
  /** Total callouts converted */
  totalCallouts: number;
  /** Individual file results */
  fileResults: FileConversionResult[];
  /** All broken links found */
  brokenLinks: string[];
}

/**
 * Options for the enhanced converter
 */
export interface EnhancedConverterOptions {
  /** Verbose logging */
  verbose?: boolean;
  /** Dry run - don't write files */
  dryRun?: boolean;
  /** Output format */
  outputFormat?: 'markdown' | 'mdx' | 'fumadocs';
  /** How to handle broken links */
  brokenLinkHandling?: 'keep' | 'remove' | 'placeholder';
  /** Warn on broken links */
  warnOnBroken?: boolean;
  /** Streaming configuration */
  streaming?: StreamingConfig;
  /** Worker configuration */
  worker?: WorkerConfig;
  /** Incremental configuration */
  incremental?: IncrementalConfig;
}

/**
 * Enhanced converter with streaming and worker thread support
 */
export class EnhancedConverter {
  private readonly attachmentHandler: AttachmentHandler;
  private readonly linkResolver: LinkResolver;
  private readonly wikiLinkProcessor: WikiLinkProcessor;
  private readonly calloutConverter: CalloutConverter;
  private readonly frontmatterProcessor: FrontmatterProcessor;
  private readonly streamingConverter: StreamingConverter;
  private readonly verbose: boolean;
  private readonly outputFormat: 'markdown' | 'mdx' | 'fumadocs';
  private readonly brokenLinks: string[] = [];
  private workerPool?: WorkerPool;
  private incrementalConverter?: IncrementalConverter;
  private readonly streamingConfig: StreamingConfig;
  private readonly workerConfig: WorkerConfig;
  private readonly incrementalConfig: IncrementalConfig;

  constructor(
    private readonly config: Config,
    private readonly options: EnhancedConverterOptions = {}
  ) {
    this.verbose = options.verbose ?? false;
    this.outputFormat = options.outputFormat ?? 'markdown';
    this.streamingConfig = options.streaming || config.streaming || { enabled: true };
    this.workerConfig = options.worker || config.worker || { workers: 0 };
    this.incrementalConfig = options.incremental || config.incremental || {};

    // Initialize attachment handler
    const attachmentDir = path.resolve(
      config.outputDir,
      config.attachmentDir || 'public/attachments'
    );
    this.attachmentHandler = new AttachmentHandler({
      attachmentDir,
      attachmentPath: '/attachments/',
    });

    // Initialize link resolver with config options
    const linkResolutionConfig = config.linkResolution || {};
    this.linkResolver = new LinkResolver({
      caseInsensitive: true,
      warnOnBroken: options.warnOnBroken ?? false,
      conflictStrategy: linkResolutionConfig.conflictStrategy,
      strictMode: linkResolutionConfig.strictMode,
      autoIndex: linkResolutionConfig.autoIndex,
      verbose: this.verbose,
    });

    // Initialize WikiLink processor
    this.wikiLinkProcessor = new WikiLinkProcessor(this.linkResolver, {
      brokenLinkHandling: options.brokenLinkHandling ?? 'keep',
      addMdExtension: true,
    });

    // Initialize callout converter
    this.calloutConverter = new CalloutConverter();

    // Initialize frontmatter processor
    this.frontmatterProcessor = new FrontmatterProcessor();

    // Initialize streaming converter
    this.streamingConverter = new StreamingConverter(
      this.linkResolver,
      attachmentDir
    );

    // Initialize worker pool if configured
    if (this.workerConfig.workers && this.workerConfig.workers > 0) {
      this.workerPool = new WorkerPool({
        workerCount: this.workerConfig.workers,
        taskTimeout: this.workerConfig.taskTimeout,
        enableRecovery: this.workerConfig.enableRecovery,
      });
    }

    // Initialize incremental converter if configured
    if (this.incrementalConfig.statePath) {
      this.incrementalConverter = new IncrementalConverter({
        statePath: this.incrementalConfig.statePath,
        watch: this.incrementalConfig.watch,
        watchDebounce: this.incrementalConfig.watchDebounce,
      });
    }
  }

  /**
   * Run the full conversion process
   */
  async convert(): Promise<ConversionResult> {
    const fileResults: FileConversionResult[] = [];
    this.brokenLinks.length = 0;

    // Ensure output directory exists
    if (!this.options.dryRun) {
      await fs.promises.mkdir(this.config.outputDir, { recursive: true });
    }

    // Collect all source directories
    const sourceDirs = this.config.sourceFolders.map(f => path.resolve(f.path));

    // Build link index
    this.log('Building file index...');
    await this.linkResolver.buildIndex(sourceDirs);
    this.log(`Indexed ${this.linkResolver.getIndexedFiles().length} files`);

    // Determine whether to use worker threads based on configuration
    if (this.workerPool && this.workerConfig.workerStrategy === 'auto') {
      return this.convertWithWorkers(sourceDirs);
    }

    // Standard conversion (single-threaded or manual worker distribution)
    // Process each source folder
    for (const sourceFolder of this.config.sourceFolders) {
      const folderResults = await this.processSourceFolder(sourceFolder);
      fileResults.push(...folderResults);
    }

    return this.buildConversionResult(fileResults);
  }

  /**
   * Convert directory using worker threads
   */
  private async convertWithWorkers(sourceDirs: string[]): Promise<ConversionResult> {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized');
    }

    const fileResults: FileConversionResult[] = [];
    const tasks: WorkerTask[] = [];

    // Collect all files
    for (const sourceDir of sourceDirs) {
      const files = await this.findMarkdownFiles(sourceDir);
      for (const file of files) {
        tasks.push({
          id: `convert-${file}`,
          type: 'convert',
          filePath: file,
          sourceRoot: sourceDir,
          outputDir: this.config.outputDir,
        });
      }
    }

    this.log(`Distributing ${tasks.length} files to ${this.workerPool.getWorkerCount()} workers...`);

    // Execute tasks in parallel
    const results = await this.workerPool.executeTasks(tasks);

    for (const result of results) {
      if (result.success && result.result) {
        const r = result.result as FileConversionResult;
        fileResults.push(r);
        this.brokenLinks.push(...(r.brokenLinks || []));
      } else {
        fileResults.push({
          sourcePath: result.id.replace('convert-', ''),
          outputPath: '',
          attachmentCount: 0,
          wikiLinkCount: 0,
          calloutCount: 0,
          success: false,
          error: result.error,
          brokenLinks: [],
        });
      }
    }

    return this.buildConversionResult(fileResults);
  }

  /**
   * Convert a single file using streaming
   */
  async convertFileStream(
    filePath: string,
    sourceRoot: string
  ): Promise<FileConversionResult> {
    try {
      const options: StreamConversionOptions = {
        sourcePath: filePath,
        sourceRoot,
        outputFormat: this.outputFormat,
        highWaterMark: this.streamingConfig.highWaterMark || 64 * 1024,
      };

      const result = await this.streamingConverter.convertFileStream(filePath, options);

      // Calculate output path
      const relativePath = path.relative(sourceRoot, filePath);
      let outputPath = path.resolve(this.config.outputDir, relativePath);

      // Change extension to .mdx if needed
      if (this.outputFormat === 'mdx' || this.outputFormat === 'fumadocs') {
        outputPath = outputPath.replace(/\.md$/, '.mdx');
      }

      // Write output
      if (!this.options.dryRun) {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, result.content, 'utf-8');
      }

      this.log(`Converted (stream): ${relativePath}`);

      return {
        sourcePath: filePath,
        outputPath,
        attachmentCount: 0,
        wikiLinkCount: result.wikiLinkCount,
        calloutCount: result.calloutCount,
        success: result.success,
        error: result.error,
        brokenLinks: result.brokenLinks,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error converting ${filePath}: ${errorMessage}`);

      return {
        sourcePath: filePath,
        outputPath: '',
        attachmentCount: 0,
        wikiLinkCount: 0,
        calloutCount: 0,
        success: false,
        error: errorMessage,
        brokenLinks: [],
      };
    }
  }

  /**
   * Load incremental conversion state
   */
  async loadState(): Promise<ConversionState | null> {
    if (!this.incrementalConverter) {
      return null;
    }
    return this.incrementalConverter.loadState();
  }

  /**
   * Perform incremental conversion - only convert modified files
   */
  async convertIncremental(sourceFolder: SourceFolderConfig): Promise<ConversionResult> {
    if (!this.incrementalConverter) {
      // Fall back to standard conversion
      return this.convert();
    }

    await this.incrementalConverter.loadState();
    const sourcePath = path.resolve(sourceFolder.path);

    // Find all files and determine which need conversion
    const allFiles = await this.findMarkdownFiles(sourcePath);
    const filesToConvert = this.incrementalConverter.getFilesToConvert(allFiles);

    this.log(`Incremental: ${filesToConvert.length} of ${allFiles.length} files need conversion`);

    const fileResults: FileConversionResult[] = [];

    for (const file of filesToConvert) {
      const result = await this.convertFileStream(file, sourcePath);
      fileResults.push(result);

      // Update incremental state
      const stats = await fs.promises.stat(file);
      const fileState: FileConversionState = {
        sourcePath: file,
        outputPath: result.outputPath,
        sourceModified: stats.mtimeMs,
        convertedAt: Date.now(),
        wikiLinkCount: result.wikiLinkCount,
        calloutCount: result.calloutCount,
        success: result.success,
      };
      this.incrementalConverter.updateFileState(fileState);
    }

    // Save state after conversion
    await this.incrementalConverter.saveState();

    return this.buildConversionResult(fileResults);
  }

  /**
   * Start watch mode for continuous conversion
   */
  async watch(
    sourceFolder: SourceFolderConfig,
    callback: (eventType: string, filename: string) => void
  ): Promise<void> {
    if (!this.incrementalConverter) {
      throw new Error('Incremental configuration required for watch mode');
    }

    await this.incrementalConverter.loadState();
    const sourcePath = path.resolve(sourceFolder.path);

    this.incrementalConverter.watchDirectory(sourcePath, (eventType, filename, filePath) => {
      this.handleFileChange(filePath, sourcePath);
      callback(eventType, filename);
    });
  }

  /**
   * Handle a file change event
   */
  private async handleFileChange(filePath: string, sourceRoot: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(filePath);

      if (this.incrementalConverter) {
        const existingState = this.incrementalConverter.getState().files[filePath];

        if (existingState && stats.mtimeMs <= existingState.sourceModified) {
          // File hasn't actually changed
          return;
        }
      }

      // Convert the file
      const result = await this.convertFileStream(filePath, sourceRoot);

      // Update state
      if (this.incrementalConverter) {
        const fileState: FileConversionState = {
          sourcePath: filePath,
          outputPath: result.outputPath,
          sourceModified: stats.mtimeMs,
          convertedAt: Date.now(),
          wikiLinkCount: result.wikiLinkCount,
          calloutCount: result.calloutCount,
          success: result.success,
        };
        this.incrementalConverter.updateFileState(fileState);
        await this.incrementalConverter.saveState();
      }

      this.log(`Watch: ${result.success ? 'Converted' : 'Failed'} ${path.basename(filePath)}`);
    } catch (error) {
      this.log(`Watch: Error handling file change: ${error}`);
    }
  }

  /**
   * Stop watching
   */
  stopWatching(): void {
    if (this.incrementalConverter) {
      this.incrementalConverter.unwatchAll();
    }
  }

  /**
   * Close the converter and release resources
   */
  async close(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.close();
      this.workerPool = undefined;
    }

    if (this.incrementalConverter) {
      this.incrementalConverter.unwatchAll();
    }
  }

  /**
   * Process a source folder
   */
  private async processSourceFolder(
    sourceFolder: SourceFolderConfig
  ): Promise<FileConversionResult[]> {
    const results: FileConversionResult[] = [];
    const sourcePath = path.resolve(sourceFolder.path);

    if (!fs.existsSync(sourcePath)) {
      this.log(`Source folder not found: ${sourcePath}`);
      return results;
    }

    // Find all markdown files
    const mdFiles = await this.findMarkdownFiles(sourcePath, sourceFolder);

    // Determine whether to use streaming based on file size
    for (const mdFile of mdFiles) {
      const result = await this.convertFile(mdFile, sourcePath);
      results.push(result);
    }

    return results;
  }

  /**
   * Find all markdown files in a directory
   */
  private async findMarkdownFiles(
    sourcePath: string,
    sourceFolder?: SourceFolderConfig
  ): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories and common non-content directories
          if (!entry.name.startsWith('.') &&
              !['node_modules', '.obsidian'].includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Check include/exclude patterns if specified
          if (!sourceFolder || this.shouldIncludeFile(fullPath, sourceFolder)) {
            files.push(fullPath);
          }
        }
      }
    };

    await walk(sourcePath);
    return files;
  }

  /**
   * Check if a file should be included based on patterns
   */
  private shouldIncludeFile(
    filePath: string,
    sourceFolder: SourceFolderConfig
  ): boolean {
    // Simple glob-like pattern matching
    if (sourceFolder.include) {
      const pattern = sourceFolder.include.replace(/\*/g, '.*');
      const regex = new RegExp(pattern);
      if (!regex.test(filePath)) return false;
    }

    if (sourceFolder.exclude) {
      const pattern = sourceFolder.exclude.replace(/\*/g, '.*');
      const regex = new RegExp(pattern);
      if (regex.test(filePath)) return false;
    }

    return true;
  }

  /**
   * Convert a single file (standard method)
   */
  private async convertFile(
    filePath: string,
    sourceRoot: string
  ): Promise<FileConversionResult> {
    try {
      // Use streaming for large files if enabled
      if (this.streamingConfig.enabled) {
        const stats = await fs.promises.stat(filePath);
        const maxBufferSize = (this.streamingConfig.maxBufferSize || 10 * 1024 * 1024);

        if (stats.size > maxBufferSize) {
          return this.convertFileStream(filePath, sourceRoot);
        }
      }

      // Read file content
      let content = await fs.promises.readFile(filePath, 'utf-8');

      // 1. Process frontmatter
      content = this.frontmatterProcessor.processContent(content, {
        convertWikiLinks: true,
      });

      // 2. Process WikiLinks (note-to-note links)
      const wikiLinkResult = this.wikiLinkProcessor.process(content, filePath, sourceRoot);
      content = wikiLinkResult.content;

      // Track broken links
      this.brokenLinks.push(...wikiLinkResult.brokenLinks);

      // 3. Process attachments
      content = await this.attachmentHandler.processContent(
        content,
        filePath,
        sourceRoot
      );

      // 4. Process callouts
      const callouts = this.calloutConverter.parseCallouts(content);
      content = this.calloutConverter.convert(content, {
        format: this.outputFormat === 'mdx' ? 'mdx' :
                this.outputFormat === 'fumadocs' ? 'fumadocs' : 'markdown',
      });

      // Calculate output path
      const relativePath = path.relative(sourceRoot, filePath);
      let outputPath = path.resolve(this.config.outputDir, relativePath);

      // Change extension to .mdx if needed
      if (this.outputFormat === 'mdx' || this.outputFormat === 'fumadocs') {
        outputPath = outputPath.replace(/\.md$/, '.mdx');
      }

      // Write output
      if (!this.options.dryRun) {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, content, 'utf-8');
      }

      this.log(`Converted: ${relativePath}`);

      return {
        sourcePath: filePath,
        outputPath,
        attachmentCount: this.attachmentHandler.getProcessedAttachments().length,
        wikiLinkCount: wikiLinkResult.convertedCount,
        calloutCount: callouts.length,
        success: true,
        brokenLinks: wikiLinkResult.brokenLinks,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Error converting ${filePath}: ${errorMessage}`);

      return {
        sourcePath: filePath,
        outputPath: '',
        attachmentCount: 0,
        wikiLinkCount: 0,
        calloutCount: 0,
        success: false,
        error: errorMessage,
        brokenLinks: [],
      };
    }
  }

  /**
   * Build conversion result summary
   */
  private buildConversionResult(fileResults: FileConversionResult[]): ConversionResult {
    const successCount = fileResults.filter(r => r.success).length;
    const failedCount = fileResults.filter(r => !r.success).length;
    const totalAttachments = this.attachmentHandler.getProcessedAttachments().length;
    const totalWikiLinks = fileResults.reduce((sum, r) => sum + r.wikiLinkCount, 0);
    const totalCallouts = fileResults.reduce((sum, r) => sum + r.calloutCount, 0);

    return {
      totalFiles: fileResults.length,
      successCount,
      failedCount,
      totalAttachments,
      totalWikiLinks,
      totalCallouts,
      fileResults,
      brokenLinks: [...this.brokenLinks],
    };
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }
}