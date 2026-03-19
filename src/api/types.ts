import type { Config, SourceFolderConfig, StreamingConfig, WorkerConfig, IncrementalConfig } from '../infrastructure/config/Config';
import type { TransformerConfig } from '../domain/transformer';
import type { PluginOptions, ResourceLimits } from '../plugin/types';

/**
 * Event types for conversion lifecycle
 */
export type ConversionEvent =
  | 'start'
  | 'file-start'
  | 'file-complete'
  | 'file-error'
  | 'progress'
  | 'complete'
  | 'warning'
  | 'error';

/**
 * Progress data for progress events
 */
export interface ConversionProgress {
  /** Current file index */
  current: number;
  /** Total files to convert */
  total: number;
  /** Current file being processed */
  currentFile: string;
  /** Progress percentage (0-100) */
  percentage: number;
}

/**
 * Callback function for conversion events
 */
export type EventCallback = (data: ConversionProgress | FileConversionResult | ConversionResult | ValidationResult | string) => void;

/**
 * Validation issue types
 */
export interface ValidationIssue {
  /** Type of validation issue */
  type: 'broken-link' | 'broken-embed' | 'orphan' | 'missing-frontmatter';
  /** File containing the issue */
  file: string;
  /** Target of the link or embed (if applicable) */
  target?: string;
  /** Human-readable message */
  message: string;
}

/**
 * Result of validating notes
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** All validation issues found */
  issues: ValidationIssue[];
  /** Number of files validated */
  fileCount: number;
  /** Number of links checked */
  linkCount: number;
  /** Number of orphan files found */
  orphanCount: number;
}

/**
 * Options for ObsidianConvert initialization
 */
export interface ObsidianConvertOptions {
  /** Source folders to convert (string or array) */
  sourceFolders?: string | string[];
  /** Output directory for converted files */
  outputDir?: string;
  /** Output format */
  format?: 'markdown' | 'mdx' | 'fumadocs';
  /** Verbose logging */
  verbose?: boolean;
  /** Dry run - don't write files */
  dryRun?: boolean;
  /** How to handle broken links */
  brokenLinkHandling?: 'keep' | 'remove' | 'placeholder';
  /** Warn on broken links */
  warnOnBroken?: boolean;
  /** Attachment output directory */
  attachmentDir?: string;
  /** Custom transformer configuration */
  transformers?: TransformerConfig;
  /** Streaming configuration */
  streaming?: StreamingConfig;
  /** Worker thread configuration */
  workers?: WorkerConfig;
  /** Incremental conversion configuration */
  incremental?: IncrementalConfig;
  /** Plugin configuration */
  plugins?: PluginOptions[];
  /** Plugin directory path */
  pluginDir?: string;
  /** Enable plugin sandbox (default: true) */
  pluginSandboxEnabled?: boolean;
  /** Plugin resource limits */
  pluginResourceLimits?: ResourceLimits;
}

/**
 * Options for single file conversion
 */
export interface SingleFileConvertOptions {
  /** Output path for the converted file */
  outputPath?: string;
  /** Output format */
  format?: 'markdown' | 'mdx' | 'fumadocs';
  /** Dry run - don't write files */
  dryRun?: boolean;
}

/**
 * Options for directory conversion
 */
export interface DirectoryConvertOptions {
  /** Output path (if different from constructor) */
  outputPath?: string;
  /** Output format */
  format?: 'markdown' | 'mdx' | 'fumadocs';
  /** Dry run - don't write files */
  dryRun?: boolean;
  /** Recursively process subdirectories (default: true) */
  recursive?: boolean;
  /** Glob pattern to include files */
  include?: string[];
  /** Glob pattern to exclude files */
  exclude?: string[];
}

/**
 * Options for validation
 */
export interface ValidateOptions {
  /** Check for broken links */
  checkLinks?: boolean;
  /** Check for broken embeds */
  checkEmbeds?: boolean;
  /** Check for orphan files */
  checkOrphans?: boolean;
}

/**
 * Result of converting a single file
 */
export interface FileConversionResult {
  /** Source file path */
  sourcePath: string;
  /** Output file path */
  outputPath: string;
  /** Converted content (only in dryRun or when requested) */
  content?: string;
  /** Number of WikiLinks converted */
  wikiLinkCount: number;
  /** Number of callouts converted */
  calloutCount: number;
  /** Number of attachments processed */
  attachmentCount: number;
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
  /** Total WikiLinks converted */
  totalWikiLinks: number;
  /** Total callouts converted */
  totalCallouts: number;
  /** Total attachments processed */
  totalAttachments: number;
  /** Individual file results */
  fileResults: FileConversionResult[];
  /** All broken links found */
  brokenLinks: string[];
  /** Conversion duration in milliseconds */
  duration: number;
}

/**
 * Internal converter options (derived from ObsidianConvertOptions)
 */
export interface InternalConverterOptions {
  verbose?: boolean;
  dryRun?: boolean;
  outputFormat?: 'markdown' | 'mdx' | 'fumadocs';
  brokenLinkHandling?: 'keep' | 'remove' | 'placeholder';
  warnOnBroken?: boolean;
  streaming?: StreamingConfig;
  worker?: WorkerConfig;
  incremental?: IncrementalConfig;
}
