import * as fs from 'fs';
import * as path from 'path';
import { Config, SourceFolderConfig } from '../../../infrastructure/config/Config';
import { YamlConfigLoader, ConfigError } from '../../../infrastructure/config';
import { Converter, FileConversionResult } from '../../../application/convert';
import { FileWatcher, FileChangeEvent } from '../../../application/watch/FileWatcher';
import { DependencyGraph } from '../../../application/watch/DependencyGraph';
import { EventLog, FileConversionRecord } from '../../../application/watch/EventLog';
import { InteractiveWatchHandler } from '../ProgressTracker';

/**
 * Options for the watch command
 */
export interface WatchCommandOptions {
  /** Path to config file */
  configPath: string;
  /** Override output directory */
  outputDir?: string;
  /** Dry run mode */
  dryRun: boolean;
  /** Verbose logging */
  verbose: boolean;
  /** Enable interactive mode */
  interactive: boolean;
  /** Output format */
  outputFormat?: 'markdown' | 'mdx' | 'fumadocs';
  /** How to handle broken links */
  brokenLinkHandling?: 'keep' | 'remove' | 'placeholder';
}

/**
 * Result of the watch command
 */
export interface WatchCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Type of error if failed */
  errorType?: 'config' | 'source' | 'watch';
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Watch command that monitors vault and performs incremental conversion
 */
export class WatchCommand {
  private configLoader = new YamlConfigLoader();
  private fileWatcher?: FileWatcher;
  private dependencyGraph?: DependencyGraph;
  private eventLog: EventLog;
  private converter?: Converter;
  private config?: Config;
  private isRunning: boolean = false;
  private pendingConversions: Set<string> = new Set();
  private conversionTimer?: NodeJS.Timeout;
  private interactiveHandler?: InteractiveWatchHandler;
  private totalConverted = 0;
  private totalErrors = 0;

  constructor(private readonly options: WatchCommandOptions) {
    this.eventLog = new EventLog();
  }

  /**
   * Execute the watch command
   */
  async execute(): Promise<WatchCommandResult> {
    try {
      // Load configuration
      this.config = await this.loadConfig();

      // Validate source folders
      const sourceError = this.validateSourceFolders(this.config);
      if (sourceError) {
        console.error(sourceError);
        return {
          success: false,
          errorType: 'source',
          errorMessage: sourceError,
        };
      }

      // Setup signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Initialize interactive handler if in interactive mode
      if (this.options.interactive) {
        this.interactiveHandler = new InteractiveWatchHandler(true);
        console.log('Press p to pause/resume, s for status, Ctrl+C to exit\n');
      }

      // Initialize the converter
      this.converter = new Converter(this.config, {
        verbose: this.options.verbose,
        dryRun: this.options.dryRun,
        outputFormat: this.options.outputFormat,
        brokenLinkHandling: this.options.brokenLinkHandling,
        warnOnBroken: this.options.verbose,
      });

      // Build the dependency graph
      console.log('Building file index and dependency graph...');
      const sourcePath = path.resolve(this.config.sourceFolders[0].path);
      const files = await this.findMarkdownFiles(sourcePath);
      this.dependencyGraph = new DependencyGraph(sourcePath);
      await this.dependencyGraph.build(files);
      console.log(`Indexed ${files.length} files`);

      // Perform initial full conversion
      console.log('\nPerforming initial conversion...');
      const initialResult = await this.converter.convert();
      this.printSummary(initialResult);

      // Initialize file watcher
      this.fileWatcher = new FileWatcher({
        debounceMs: 300,
        recursive: true,
        extensions: ['.md'],
      });

      // Log watch start
      this.eventLog.logWatchStart(sourcePath, this.config.outputDir);

      // Start watching
      console.log(`\n👀 Watching for changes in ${sourcePath}...`);
      console.log('Press Ctrl+C to stop\n');

      this.isRunning = true;
      this.fileWatcher.watch(sourcePath, (eventType, filePath, relativePath) => {
        this.handleFileChange(eventType, filePath, relativePath, sourcePath);
      });

      return { success: true };
    } catch (error) {
      if (error instanceof ConfigError) {
        console.error(`Configuration error: ${error.message}`);
        return {
          success: false,
          errorType: 'config',
          errorMessage: error.message,
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Watch error: ${errorMessage}`);
      return {
        success: false,
        errorType: 'watch',
        errorMessage,
      };
    }
  }

  /**
   * Handle a file change event
   */
  private handleFileChange(
    eventType: FileChangeEvent,
    filePath: string,
    relativePath: string,
    sourceRoot: string
  ): void {
    if (!this.isRunning) return;

    // Log the file change
    this.eventLog.logFileChange(eventType, filePath);

    const timestamp = new Date().toLocaleTimeString();

    switch (eventType) {
      case 'add':
        console.log(`[${timestamp}] ✨ New file: ${relativePath}`);
        break;
      case 'change':
        console.log(`[${timestamp}] 📝 Changed: ${relativePath}`);
        break;
      case 'unlink':
        console.log(`[${timestamp}] 🗑️  Deleted: ${relativePath}`);
        this.handleFileDeletion(filePath, sourceRoot);
        return;
    }

    // Add to pending conversions
    this.pendingConversions.add(filePath);

    // Schedule conversion (debounced)
    if (this.conversionTimer) {
      clearTimeout(this.conversionTimer);
    }

    this.conversionTimer = setTimeout(() => {
      this.processPendingConversions(sourceRoot);
    }, 500);
  }

  /**
   * Handle file deletion - clean up output and dependency graph
   */
  private handleFileDeletion(filePath: string, sourceRoot: string): void {
    if (!this.dependencyGraph || !this.config) return;

    // Remove from dependency graph
    this.dependencyGraph.removeFile(filePath);

    // Calculate output path
    const relativePath = path.relative(sourceRoot, filePath);
    let outputPath = path.resolve(this.config.outputDir, relativePath);
    if (this.options.outputFormat === 'mdx' || this.options.outputFormat === 'fumadocs') {
      outputPath = outputPath.replace(/\.md$/, '.mdx');
    }

    // Delete output file if it exists
    if (fs.existsSync(outputPath) && !this.options.dryRun) {
      fs.unlinkSync(outputPath);
      console.log(`  🗑️  Cleaned up output: ${relativePath}`);
    }
  }

  /**
   * Process pending file conversions
   */
  private async processPendingConversions(sourceRoot: string): Promise<void> {
    if (this.pendingConversions.size === 0 || !this.converter || !this.dependencyGraph) {
      return;
    }

    // Check if paused
    if (this.interactiveHandler?.isWatchPaused()) {
      console.log('\n⏸️  Watch is paused, queuing changes for when resumed...');
      return;
    }

    const filesToConvert = new Set<string>();

    // For each pending file, get files that need reconversion
    for (const filePath of this.pendingConversions) {
      const dependents = this.dependencyGraph.getFilesToReconvert(filePath);
      for (const dep of dependents) {
        filesToConvert.add(dep);
      }
    }

    this.pendingConversions.clear();

    if (filesToConvert.size === 0) return;

    console.log(`\n🔄 Converting ${filesToConvert.size} file(s)...`);

    const startTime = Date.now();
    this.eventLog.logConversionStart(Array.from(filesToConvert));

    let successCount = 0;
    let failCount = 0;

    for (const filePath of filesToConvert) {
      const result = await this.convertSingleFile(filePath, sourceRoot);

      if (result.success) {
        successCount++;
        this.totalConverted++;
      } else {
        failCount++;
        this.totalErrors++;
      }
    }

    // Update interactive handler stats
    if (this.interactiveHandler) {
      this.interactiveHandler.updateStats(
        this.pendingConversions.size,
        this.totalConverted,
        this.totalErrors
      );
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Converted ${successCount} file(s)${failCount > 0 ? `, ${failCount} failed` : ''} in ${duration}ms`);

    // Update dependency graph with new references
    for (const filePath of filesToConvert) {
      await this.dependencyGraph.updateFile(filePath);
    }
  }

  /**
   * Convert a single file
   */
  private async convertSingleFile(filePath: string, sourceRoot: string): Promise<FileConversionResult> {
    const startTime = Date.now();

    try {
      // Check if file still exists
      if (!fs.existsSync(filePath)) {
        return {
          sourcePath: filePath,
          outputPath: '',
          attachmentCount: 0,
          wikiLinkCount: 0,
          calloutCount: 0,
          success: false,
          error: 'File no longer exists',
          brokenLinks: [],
        };
      }

      // Read file content
      let content = await fs.promises.readFile(filePath, 'utf-8');

      // Get frontmatter processor and process
      const { FrontmatterProcessor } = await import('../../../domain');
      const frontmatterProcessor = new FrontmatterProcessor();
      content = frontmatterProcessor.processContent(content, { convertWikiLinks: true });

      // Get link resolver and build index
      const { LinkResolver } = await import('../../../domain');
      const linkResolver = new LinkResolver({ caseInsensitive: true });
      await linkResolver.buildIndex([sourceRoot]);

      // Get WikiLink processor
      const { WikiLinkProcessor } = await import('../../../domain');
      const wikiLinkProcessor = new WikiLinkProcessor(linkResolver, {
        brokenLinkHandling: this.options.brokenLinkHandling ?? 'keep',
        addMdExtension: true,
      });
      const wikiLinkResult = wikiLinkProcessor.process(content, filePath, sourceRoot);
      content = wikiLinkResult.content;

      // Get attachment handler
      const { AttachmentHandler } = await import('../../../infrastructure/attachment/AttachmentHandler');
      const attachmentHandler = new AttachmentHandler({
        attachmentDir: path.resolve(this.config!.outputDir, this.config!.attachmentDir || 'public/attachments'),
        attachmentPath: '/attachments/',
      });
      content = await attachmentHandler.processContent(content, filePath, sourceRoot);

      // Get callout converter
      const { CalloutConverter } = await import('../../../domain');
      const calloutConverter = new CalloutConverter();
      const callouts = calloutConverter.parseCallouts(content);
      content = calloutConverter.convert(content, {
        format: this.options.outputFormat === 'mdx' ? 'mdx' :
               this.options.outputFormat === 'fumadocs' ? 'fumadocs' : 'markdown',
      });

      // Calculate output path
      const relativePath = path.relative(sourceRoot, filePath);
      let outputPath = path.resolve(this.config!.outputDir, relativePath);
      if (this.options.outputFormat === 'mdx' || this.options.outputFormat === 'fumadocs') {
        outputPath = outputPath.replace(/\.md$/, '.mdx');
      }

      // Write output
      if (!this.options.dryRun) {
        await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.promises.writeFile(outputPath, content, 'utf-8');
      }

      const result: FileConversionResult = {
        sourcePath: filePath,
        outputPath,
        attachmentCount: attachmentHandler.getProcessedAttachments().length,
        wikiLinkCount: wikiLinkResult.convertedCount,
        calloutCount: callouts.length,
        success: true,
        brokenLinks: wikiLinkResult.brokenLinks,
      };

      // Log conversion
      this.eventLog.logFileConversion({
        filePath: result.sourcePath,
        outputPath: result.outputPath,
        success: result.success,
        wikiLinkCount: result.wikiLinkCount,
        calloutCount: result.calloutCount,
        error: result.error,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: FileConversionResult = {
        sourcePath: filePath,
        outputPath: '',
        attachmentCount: 0,
        wikiLinkCount: 0,
        calloutCount: 0,
        success: false,
        error: errorMessage,
        brokenLinks: [],
      };

      // Log failed conversion
      this.eventLog.logFileConversion({
        filePath: result.sourcePath,
        outputPath: result.outputPath,
        success: result.success,
        wikiLinkCount: result.wikiLinkCount,
        calloutCount: result.calloutCount,
        error: result.error,
        durationMs: Date.now() - startTime,
      });

      return result;
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    let shutdownInProgress = false;

    const shutdown = () => {
      if (shutdownInProgress) return;
      shutdownInProgress = true;

      console.log('\n\n🛑 Stopping watch mode...');
      this.stop();

      // Print summary
      console.log(this.eventLog.formatSummary());

      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  /**
   * Stop watching and cleanup
   */
  stop(): void {
    this.isRunning = false;

    if (this.conversionTimer) {
      clearTimeout(this.conversionTimer);
    }

    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    if (this.interactiveHandler) {
      this.interactiveHandler.dispose();
    }

    this.eventLog.logWatchStop();
  }

  /**
   * Load configuration
   */
  private async loadConfig(): Promise<Config> {
    const { configPath, outputDir } = this.options;

    const absoluteConfigPath = path.resolve(configPath);
    if (!await this.configLoader.exists(absoluteConfigPath)) {
      throw new ConfigError(
        `Configuration file not found: ${absoluteConfigPath}`,
        absoluteConfigPath
      );
    }

    const config = await this.configLoader.load(absoluteConfigPath);

    if (outputDir) {
      return {
        ...config,
        outputDir: path.resolve(outputDir),
      };
    }

    return {
      ...config,
      outputDir: path.resolve(path.dirname(absoluteConfigPath), config.outputDir),
    };
  }

  /**
   * Validate source folders
   */
  private validateSourceFolders(config: Config): string | null {
    for (const folder of config.sourceFolders) {
      const absolutePath = path.resolve(folder.path);
      if (!fs.existsSync(absolutePath)) {
        return `Source folder not found: ${absolutePath}`;
      }
      if (!fs.statSync(absolutePath).isDirectory()) {
        return `Source path is not a directory: ${absolutePath}`;
      }
    }
    return null;
  }

  /**
   * Find all markdown files in a directory
   */
  private async findMarkdownFiles(sourcePath: string): Promise<string[]> {
    const files: string[] = [];

    const walk = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') &&
              !['node_modules', '.obsidian'].includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }
    };

    await walk(sourcePath);
    return files;
  }

  /**
   * Print conversion summary
   */
  private printSummary(result: {
    totalFiles: number;
    successCount: number;
    failedCount: number;
    totalWikiLinks: number;
    totalCallouts: number;
    brokenLinks: string[];
  }): void {
    console.log('\n=== Initial Conversion Summary ===');
    console.log(`Total files: ${result.totalFiles}`);
    console.log(`Successful: ${result.successCount}`);
    console.log(`Failed: ${result.failedCount}`);
    console.log(`WikiLinks converted: ${result.totalWikiLinks}`);
    console.log(`Callouts converted: ${result.totalCallouts}`);

    if (result.brokenLinks.length > 0) {
      console.log(`\nBroken links: ${result.brokenLinks.length}`);
    }
  }
}