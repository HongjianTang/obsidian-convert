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
 * Main configuration for obsidian-convert
 */
export interface Config {
  /** List of source folders to convert */
  sourceFolders: SourceFolderConfig[];
  /** Output directory for converted files */
  outputDir: string;
  /** Attachment output directory (relative to outputDir, default: "public/attachments") */
  attachmentDir?: string;
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