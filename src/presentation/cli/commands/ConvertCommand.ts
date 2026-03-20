import * as path from 'path';
import * as fs from 'fs';
import { YamlConfigLoader, ConfigError, Config } from '../../../infrastructure/config';
import { Converter, ConversionResult, MemoryMonitor, getGlobalMemoryMonitor } from '../../../application/convert';
import { ReportGenerator } from '../../../infrastructure/report';
import { ReportOptions } from '../../../api/report-types';
import { ErrorReporter, ErrorLevel } from '../../../domain/error';

/**
 * Options for the convert command
 */
export interface ConvertCommandOptions {
  /** Path to config file */
  configPath: string;
  /** Override input/source directory (CLI-only mode) */
  input?: string;
  /** Override output directory */
  outputDir?: string;
  /** Dry run mode */
  dryRun: boolean;
  /** Verbose logging */
  verbose: boolean;
  /** Output format */
  outputFormat?: 'markdown' | 'mdx' | 'fumadocs';
  /** How to handle broken links */
  brokenLinkHandling?: 'keep' | 'remove' | 'placeholder';
  /** Report format: 'json' or 'html' */
  report?: 'json' | 'html';
  /** Report output path */
  reportOutput?: string;
}

/**
 * Result of the convert command
 */
export interface ConvertCommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Type of error if failed */
  errorType?: 'config' | 'source' | 'convert';
  /** Error message if failed */
  errorMessage?: string;
  /** Conversion result if succeeded */
  conversionResult?: ConversionResult;
}

/**
 * Convert command that orchestrates the conversion process
 */
export class ConvertCommand {
  private readonly configLoader = new YamlConfigLoader();
  private memoryMonitor?: MemoryMonitor;
  private startTime = 0;
  private processedFiles = 0;
  private totalFiles = 0;
  private lastProgressUpdate = 0;

  constructor(private readonly options: ConvertCommandOptions) {}

  async execute(): Promise<ConvertCommandResult> {
    try {
      // Load configuration
      const config = await this.loadConfig();

      // Validate source folders
      const sourceError = this.validateSourceFolders(config);
      if (sourceError) {
        console.error(sourceError);
        return {
          success: false,
          errorType: 'source',
          errorMessage: sourceError,
        };
      }

      // Initialize memory monitor
      this.initializeMemoryMonitor(config);

      // Run converter
      const converter = new Converter(config, {
        verbose: this.options.verbose,
        dryRun: this.options.dryRun,
        outputFormat: this.options.outputFormat,
        brokenLinkHandling: this.options.brokenLinkHandling,
        warnOnBroken: this.options.verbose,
        onProgress: () => this.incrementProcessedFiles(),
      });

      console.log('Starting conversion...');
      if (this.options.dryRun) {
        console.log('(Dry run mode - no files will be written)');
      }
      console.log(`Output format: ${this.options.outputFormat || 'markdown'}`);

      this.startTime = Date.now();
      this.processedFiles = 0;
      this.totalFiles = await this.countFiles(config);

      // Start memory monitoring
      this.memoryMonitor?.start();

      // Set up progress display
      const progressInterval = setInterval(() => {
        this.displayProgress();
      }, 500);

      const result = await converter.convert();

      // Clear progress interval
      clearInterval(progressInterval);

      // Stop memory monitoring
      this.memoryMonitor?.stop();

      // Output summary
      this.printSummary(result);
      this.printMemoryStats();

      // Generate report if requested
      if (this.options.report) {
        await this.generateReport(result);
      }

      return {
        success: true,
        conversionResult: result,
      };
    } catch (error) {
      this.memoryMonitor?.stop();
      if (error instanceof ConfigError) {
        this.printEnhancedError(error, this.options.verbose);
        return {
          success: false,
          errorType: 'config',
          errorMessage: error.message,
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.options.verbose && error instanceof Error && error.stack) {
        console.error(`Conversion error: ${errorMessage}`);
        console.error('Stack trace:');
        console.error(error.stack);
      } else {
        console.error(`Conversion error: ${errorMessage}`);
      }
      return {
        success: false,
        errorType: 'convert',
        errorMessage,
      };
    }
  }

  /**
   * Print enhanced error with context and suggestions
   */
  private printEnhancedError(error: ConfigError, verbose: boolean): void {
    const reporter = new ErrorReporter(verbose);

    // Create enhanced error from ConfigError
    reporter.addError(
      'CONFIG_ERROR',
      error.message,
      'ConfigError' as any,
      ErrorLevel.FATAL,
      {
        location: error.location,
        originalError: error,
        suggestions: error.field ? [
          { description: `Check the "${error.field}" field in your configuration` },
        ] : [],
      }
    );

    const options = {
      verbose,
      showContext: true,
      contextSize: 2,
    };

    console.error('\n' + reporter.formatError(reporter.getErrors()[0], options));

    if (verbose && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }

  /**
   * Initialize memory monitor based on configuration
   */
  private initializeMemoryMonitor(config: Config): void {
    const streamingConfig = config.streaming;
    if (streamingConfig?.enabled !== false) {
      this.memoryMonitor = getGlobalMemoryMonitor({
        maxMemory: streamingConfig?.maxMemory,
        warningThreshold: streamingConfig?.memoryWarningThreshold ? streamingConfig.memoryWarningThreshold / 100 : undefined,
      });

      // Listen for memory warnings
      this.memoryMonitor.on('memory-warning', (data) => {
        console.warn(`\n⚠️  Memory warning: ${MemoryMonitor.formatBytes(data.heapUsed)} (${data.usagePercent.toFixed(1)}% of max)`);
      });

      this.memoryMonitor.on('memory-exceeded', (data) => {
        console.error(`\n❌ Memory exceeded: ${MemoryMonitor.formatBytes(data.heapUsed)} (max: ${MemoryMonitor.formatBytes(data.maxMemory)})`);
      });
    }
  }

  /**
   * Count total files to be processed
   */
  private async countFiles(config: Config): Promise<number> {
    let count = 0;
    for (const folder of config.sourceFolders) {
      const absolutePath = path.resolve(folder.path);
      count += await this.countFilesRecursive(absolutePath);
    }
    return count;
  }

  /**
   * Recursively count markdown files
   */
  private async countFilesRecursive(dir: string): Promise<number> {
    let count = 0;
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', '.obsidian'].includes(entry.name)) {
          count += await this.countFilesRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          count++;
        }
      }
    } catch {
      // Ignore permission errors
    }
    return count;
  }

  /**
   * Display progress information
   */
  private displayProgress(): void {
    if (this.totalFiles === 0 || !this.startTime) return;

    const now = Date.now();
    const elapsed = now - this.startTime;
    const filesPerSecond = this.processedFiles / (elapsed / 1000);
    const remainingFiles = this.totalFiles - this.processedFiles;
    const estimatedRemainingSeconds = filesPerSecond > 0 ? remainingFiles / filesPerSecond : 0;

    const percent = ((this.processedFiles / this.totalFiles) * 100).toFixed(1);
    const eta = this.formatDuration(estimatedRemainingSeconds * 1000);
    const elapsedStr = this.formatDuration(elapsed);

    // Build progress bar
    const barLength = 30;
    const filledLength = Math.round((this.processedFiles / this.totalFiles) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    const memoryInfo = this.memoryMonitor ? ` | ${this.memoryMonitor.getSummary()}` : '';

    // Use carriage return to overwrite the line
    process.stdout.write(`\r[${bar}] ${percent}% | ${this.processedFiles}/${this.totalFiles} files | ETA: ${eta} | Elapsed: ${elapsedStr}${memoryInfo}  `);

    this.lastProgressUpdate = now;
  }

  /**
   * Update processed files count (to be called by converter)
   */
  incrementProcessedFiles(): void {
    this.processedFiles++;
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    if (ms < 0 || !isFinite(ms)) return '--:--';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Print memory statistics summary
   */
  private printMemoryStats(): void {
    if (!this.memoryMonitor) return;

    const peak = this.memoryMonitor.getPeakUsage();
    console.log(`\nPeak memory usage: ${MemoryMonitor.formatBytes(peak)}`);
  }

  private async loadConfig(): Promise<Config> {
    const { configPath, input, outputDir } = this.options;

    // Check if config file exists
    const absoluteConfigPath = path.resolve(configPath);
    const configExists = await this.configLoader.exists(absoluteConfigPath);

    // CLI-only mode: when no config file exists but input is provided
    if (!configExists && input) {
      // Build Config directly from CLI arguments
      const absoluteInputPath = path.resolve(input);
      const absoluteOutputPath = outputDir ? path.resolve(outputDir) : path.resolve('./docs');

      return {
        sourceFolders: [{ path: absoluteInputPath }],
        outputDir: absoluteOutputPath,
      };
    }

    // Config file mode: require config file to exist
    if (!configExists) {
      throw new ConfigError(
        `Configuration file not found: ${absoluteConfigPath}`,
        absoluteConfigPath
      );
    }

    // Load config
    const config = await this.configLoader.load(absoluteConfigPath);

    // Override source folders if input is specified via CLI
    if (input) {
      const absoluteInputPath = path.resolve(input);
      config.sourceFolders = [{ path: absoluteInputPath }];
    }

    // Override output directory if specified
    if (outputDir) {
      return {
        ...config,
        outputDir: path.resolve(outputDir),
      };
    }

    // Resolve output directory relative to config file location
    return {
      ...config,
      outputDir: path.resolve(path.dirname(absoluteConfigPath), config.outputDir),
    };
  }

  private validateSourceFolders(config: Config): string | null {
    for (const folder of config.sourceFolders) {
      const absolutePath = path.resolve(folder.path);
      if (!fs.existsSync(absolutePath)) {
        return `Source path not found: ${absolutePath}`;
      }
      const stats = fs.statSync(absolutePath);
      if (!stats.isDirectory() && !stats.isFile()) {
        return `Source path is not a valid file or directory: ${absolutePath}`;
      }
    }
    return null;
  }

  private printSummary(result: ConversionResult): void {
    // Clear the progress line first
    process.stdout.write('\r' + ' '.repeat(100) + '\r');

    console.log('\n=== Conversion Summary ===');
    console.log(`Total files: ${result.totalFiles}`);
    console.log(`Successful: ${result.successCount}`);
    console.log(`Failed: ${result.failedCount}`);
    console.log(`Attachments: ${result.totalAttachments}`);
    console.log(`WikiLinks converted: ${result.totalWikiLinks}`);
    console.log(`Callouts converted: ${result.totalCallouts}`);

    // Print timing
    const elapsed = Date.now() - this.startTime;
    console.log(`Time elapsed: ${this.formatDuration(elapsed)}`);

    if (result.brokenLinks.length > 0) {
      console.log(`\nBroken links (${result.brokenLinks.length}):`);
      const uniqueBroken = [...new Set(result.brokenLinks)];
      for (const link of uniqueBroken.slice(0, 10)) {
        console.log(`  - [[${link}]]`);
      }
      if (uniqueBroken.length > 10) {
        console.log(`  ... and ${uniqueBroken.length - 10} more`);
      }
    }

    if (result.failedCount > 0 && this.options.verbose) {
      console.log('\nFailed files:');
      for (const file of result.fileResults.filter(f => !f.success)) {
        console.log(`  - ${file.sourcePath}: ${file.error}`);
      }
    }
  }

  private async generateReport(result: ConversionResult): Promise<void> {
    const reportGenerator = new ReportGenerator();
    reportGenerator.startTimer();

    const reportOptions: ReportOptions = {
      format: this.options.report || 'json',
      outputPath: this.options.reportOutput,
      includeMemoryStats: true,
      includeFileTree: true,
      includeLinkGraph: true,
    };

    const report = reportGenerator.generateReport(result, reportOptions);
    const outputPath = await reportGenerator.writeReport(report, reportOptions);

    console.log(`\nReport generated: ${outputPath}`);
  }
}