import { ConflictStrategy } from '../../domain/link';
import { TransformerConfig } from '../../domain/transformer';

/**
 * Source folder configuration
 */
export interface SourceFolderConfig {
  /** Path to the Obsidian folder (absolute or relative) */
  path: string;
  /** Glob pattern to include files (optional) */
  include?: string;
  /** Glob pattern to exclude files (optional) */
  exclude?: string;
}

/**
 * Link resolution configuration
 */
export interface LinkResolutionConfig {
  /** Conflict resolution strategy (default: 'nearest') */
  conflictStrategy?: ConflictStrategy;
  /** Strict mode - throw error on broken links (default: false) */
  strictMode?: boolean;
  /** Auto build index (default: true) */
  autoIndex?: boolean;
}

/**
 * Streaming configuration for large file handling
 */
export interface StreamingConfig {
  /** Enable streaming mode for large files (default: true) */
  enabled?: boolean;
  /** Chunk size for streaming (default: 64KB) */
  highWaterMark?: number;
  /** Max file size to buffer entirely before streaming (default: 10MB) */
  maxBufferSize?: number;
  /** Maximum memory usage threshold in bytes (default: 500MB) */
  maxMemory?: number;
  /** Memory warning threshold as percentage of maxMemory (default: 80) */
  memoryWarningThreshold?: number;
}

/**
 * Worker thread configuration
 */
export interface WorkerConfig {
  /** Number of worker threads (default: 0 = auto based on CPU cores) */
  workers?: number;
  /** Worker strategy: 'auto' distributes automatically, 'manual' requires explicit dispatch */
  workerStrategy?: 'auto' | 'manual';
  /** Timeout for worker tasks in ms (default: 30000) */
  taskTimeout?: number;
  /** Enable worker crash recovery (default: true) */
  enableRecovery?: boolean;
  /** Enable graceful degradation when workers unavailable (default: true) */
  gracefulDegradation?: boolean;
}

/**
 * Incremental conversion configuration
 */
export interface IncrementalConfig {
  /** Path to state file for tracking converted files */
  statePath?: string;
  /** Enable watch mode for continuous conversion */
  watch?: boolean;
  /** Debounce delay for file changes in watch mode (ms, default: 500) */
  watchDebounce?: number;
}

/**
 * Main configuration for obsidian-convert
 */
export interface Config {
  /** List of source folders to convert */
  sourceFolders: SourceFolderConfig[];
  /** Output directory for converted files */
  outputDir: string;
  /** Attachment output directory (relative to outputDir, default: "public/attachments") */
  attachmentDir?: string;
  /** Link resolution configuration */
  linkResolution?: LinkResolutionConfig;
  /** Streaming configuration for large files */
  streaming?: StreamingConfig;
  /** Worker thread configuration */
  worker?: WorkerConfig;
  /** Incremental conversion configuration */
  incremental?: IncrementalConfig;
  /** Custom transformer configuration */
  transformer?: TransformerConfig;
  /** Auto-generate title from filename if not present in frontmatter (default: true) */
  autoTitle?: boolean;
}

/**
 * Configuration loader interface
 */
export interface ConfigLoader {
  /**
   * Load configuration from a file
   * @param configPath - Path to the config file
   * @returns Parsed configuration
   */
  load(configPath: string): Promise<Config>;

  /**
   * Check if a config file exists
   * @param configPath - Path to check
   */
  exists(configPath: string): Promise<boolean>;
}