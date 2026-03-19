import * as fs from 'fs';
import * as path from 'path';
import { Config, SourceFolderConfig } from '../../infrastructure/config/Config';
import { AttachmentHandler } from '../../infrastructure/attachment/AttachmentHandler';
import { LinkResolver, WikiLinkProcessor, CalloutConverter, FrontmatterProcessor } from '../../domain';

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
 * Options for the converter
 */
export interface ConverterOptions {
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
}

/**
 * Main converter that orchestrates the conversion process
 */
export class Converter {
  private readonly attachmentHandler: AttachmentHandler;
  private readonly linkResolver: LinkResolver;
  private readonly wikiLinkProcessor: WikiLinkProcessor;
  private readonly calloutConverter: CalloutConverter;
  private readonly frontmatterProcessor: FrontmatterProcessor;
  private readonly verbose: boolean;
  private readonly outputFormat: 'markdown' | 'mdx' | 'fumadocs';
  private readonly brokenLinks: string[] = [];

  constructor(
    private readonly config: Config,
    private readonly options: ConverterOptions = {}
  ) {
    this.verbose = options.verbose ?? false;
    this.outputFormat = options.outputFormat ?? 'markdown';

    // Initialize attachment handler
    const attachmentDir = path.resolve(
      config.outputDir,
      config.attachmentDir || 'public/attachments'
    );
    this.attachmentHandler = new AttachmentHandler({
      attachmentDir,
      attachmentPath: '/attachments/',
    });

    // Initialize link resolver
    this.linkResolver = new LinkResolver({
      caseInsensitive: true,
      warnOnBroken: options.warnOnBroken ?? false,
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

    // Process each source folder
    for (const sourceFolder of this.config.sourceFolders) {
      const folderResults = await this.processSourceFolder(sourceFolder);
      fileResults.push(...folderResults);
    }

    // Calculate summary
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

    for (const mdFile of mdFiles) {
      const result = await this.convertFile(mdFile, sourcePath);
      results.push(result);
    }

    return results;
  }

  private async findMarkdownFiles(
    sourcePath: string,
    sourceFolder: SourceFolderConfig
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
          if (this.shouldIncludeFile(fullPath, sourceFolder)) {
            files.push(fullPath);
          }
        }
      }
    };

    await walk(sourcePath);
    return files;
  }

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

  private async convertFile(
    filePath: string,
    sourceRoot: string
  ): Promise<FileConversionResult> {
    try {
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
        format: this.outputFormat === 'mdx' ? 'mdx' : this.outputFormat === 'fumadocs' ? 'fumadocs' : 'markdown',
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

      const attachmentCount = this.attachmentHandler.getProcessedAttachments().length;

      this.log(`Converted: ${relativePath} (${wikiLinkResult.convertedCount} links, ${callouts.length} callouts)`);

      return {
        sourcePath: filePath,
        outputPath,
        attachmentCount,
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

  private log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }
}