import * as path from 'path';
import * as fs from 'fs';
import { YamlConfigLoader, ConfigError, Config } from '../../../infrastructure/config';
import { Converter, ConversionResult } from '../../../application/convert';
import { ErrorReporter, ErrorLevel } from '../../../domain/error';

/**
 * Options for the convert command
 */
export interface ConvertCommandOptions {
  /** Path to config file */
  configPath: string;
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

      // Run converter
      const converter = new Converter(config, {
        verbose: this.options.verbose,
        dryRun: this.options.dryRun,
        outputFormat: this.options.outputFormat,
        brokenLinkHandling: this.options.brokenLinkHandling,
        warnOnBroken: this.options.verbose,
      });

      console.log('Starting conversion...');
      if (this.options.dryRun) {
        console.log('(Dry run mode - no files will be written)');
      }
      console.log(`Output format: ${this.options.outputFormat || 'markdown'}`);

      const result = await converter.convert();

      // Output summary
      this.printSummary(result);

      return {
        success: true,
        conversionResult: result,
      };
    } catch (error) {
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

  private async loadConfig(): Promise<Config> {
    const { configPath, outputDir } = this.options;

    // Check if config file exists
    const absoluteConfigPath = path.resolve(configPath);
    if (!await this.configLoader.exists(absoluteConfigPath)) {
      throw new ConfigError(
        `Configuration file not found: ${absoluteConfigPath}`,
        absoluteConfigPath
      );
    }

    // Load config
    const config = await this.configLoader.load(absoluteConfigPath);

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
        return `Source folder not found: ${absolutePath}`;
      }
      if (!fs.statSync(absolutePath).isDirectory()) {
        return `Source path is not a directory: ${absolutePath}`;
      }
    }
    return null;
  }

  private printSummary(result: ConversionResult): void {
    console.log('\n=== Conversion Summary ===');
    console.log(`Total files: ${result.totalFiles}`);
    console.log(`Successful: ${result.successCount}`);
    console.log(`Failed: ${result.failedCount}`);
    console.log(`Attachments: ${result.totalAttachments}`);
    console.log(`WikiLinks converted: ${result.totalWikiLinks}`);
    console.log(`Callouts converted: ${result.totalCallouts}`);

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
}