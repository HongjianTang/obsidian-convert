import type { Transformer } from '../domain/transformer';

/**
 * Plugin manifest - metadata describing a plugin
 */
export interface PluginManifest {
  /** Unique identifier for the plugin */
  id: string;
  /** Human-readable plugin name */
  name: string;
  /** Semantic version string */
  version: string;
  /** Optional description */
  description?: string;
  /** Author information */
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  /** Entry file path */
  main: string;
  /** Plugin type classification */
  type: 'transformer' | 'link-handler' | 'callout-handler' | 'full';
  /** Optional dependencies with version ranges */
  dependencies?: Record<string, string>;
  /** JSON schema for configuration validation */
  configSchema?: Record<string, unknown>;
  /** Plugin tags for categorization */
  tags?: string[];
}

/**
 * Plugin configuration item definition
 */
export interface PluginConfigItem {
  /** Configuration key */
  key: string;
  /** Value type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'select';
  /** Default value */
  default?: unknown;
  /** Description text */
  description?: string;
  /** Whether required */
  required?: boolean;
  /** Options for select type */
  options?: { label: string; value: unknown }[];
  /** Custom validator function */
  validate?: (value: unknown) => string | null;
}

/**
 * Sandbox context passed to plugins
 */
export interface PluginSandboxContext {
  /** Plugin identifier */
  pluginId: string;
  /** Plugin version */
  pluginVersion: string;
  /** Allowed API kinds */
  allowedAPIs: Set<PluginAPIKind>;
  /** Resource limitations */
  resourceLimits: ResourceLimits;
}

/**
 * Resource usage limits for plugins
 */
export interface ResourceLimits {
  /** Maximum memory in MB */
  maxMemory?: number;
  /** Maximum execution time in ms */
  maxExecutionTime?: number;
  /** Allowed filesystem paths */
  allowedPaths?: string[];
}

/**
 * Categories of APIs available to plugins
 */
export type PluginAPIKind =
  | 'file:read'
  | 'file:write'
  | 'config:get'
  | 'config:set'
  | 'logger:info'
  | 'logger:warn'
  | 'logger:error'
  | 'http:fetch'
  | 'transformer:register'
  | 'transformer:unregister'
  | 'hook:on'
  | 'hook:off';

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
  /** Called before batch conversion starts */
  beforeConvert?: (context: ConvertContext) => void | Promise<void>;
  /** Called after batch conversion completes */
  afterConvert?: (context: ConvertContext, result: ConversionResult) => void | Promise<void>;
  /** Called before processing a single file */
  beforeFileProcess?: (file: FileContext) => void | Promise<void>;
  /** Called after processing a single file */
  afterFileProcess?: (file: FileContext, result: FileResult) => void | Promise<void>;
  /** Called when an error occurs */
  onError?: (error: PluginError, context: ErrorContext) => void | Promise<void>;
  /** Called before plugin unloading */
  onUnload?: () => void | Promise<void>;
}

/**
 * Context for conversion operations
 */
export interface ConvertContext {
  /** Source folder paths */
  sourceFolders: string[];
  /** Output directory */
  outputDir: string;
  /** Target format */
  format: 'markdown' | 'mdx' | 'fumadocs';
  /** Global configuration */
  config: Record<string, unknown>;
}

/**
 * Context for file operations
 */
export interface FileContext {
  /** Source file path */
  sourcePath: string;
  /** Output file path */
  outputPath: string;
  /** File content */
  content: string;
  /** Source root directory */
  sourceRoot: string;
}

/**
 * Result of file conversion
 */
export interface FileResult {
  /** Transformed content */
  content: string;
  /** Whether operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Number of WikiLinks processed */
  wikiLinkCount: number;
  /** Number of callouts processed */
  calloutCount: number;
}

/**
 * Plugin-specific error information
 */
export interface PluginError {
  /** Error code for categorization */
  code: string;
  /** Human-readable message */
  message: string;
  /** Plugin that caused the error */
  pluginId: string;
  /** Underlying error if any */
  originalError?: Error;
}

/**
 * Context describing where an error occurred
 */
export interface ErrorContext {
  /** File where error occurred */
  file?: string;
  /** Lifecycle phase */
  phase: 'load' | 'init' | 'convert' | 'transform' | 'teardown';
  /** Stack trace if available */
  stack?: string;
}

/**
 * Loaded plugin instance
 */
export interface ObsidianConvertPlugin {
  /** Plugin metadata */
  manifest: PluginManifest;
  /** Runtime unique identifier */
  id: string;
  /** Lifecycle hooks */
  hooks: PluginHooks;
  /** Custom transformers provided by plugin */
  transformers?: Transformer[];
  /** Plugin configuration */
  config?: Record<string, unknown>;
  /** Initialization function */
  init?: (api: PluginAPI) => void | Promise<void>;
}

/**
 * Plugin API surface exposed to plugins
 */
export interface PluginAPI {
  /** Get configuration value */
  getConfig: <T = unknown>(key: string, defaultValue?: T) => T;
  /** Set configuration value */
  setConfig: (key: string, value: unknown) => void;
  /** Logger interface */
  logger: {
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  /** Register a transformer */
  registerTransformer: (transformer: Transformer) => void;
  /** Unregister a transformer by name */
  unregisterTransformer: (name: string) => boolean;
  /** Subscribe to an event */
  on: (event: PluginEvent, callback: PluginEventCallback) => void;
  /** Unsubscribe from an event */
  off: (event: PluginEvent, callback: PluginEventCallback) => void;
}

/**
 * Event types plugins can subscribe to
 */
export type PluginEvent =
  | 'convert:start'
  | 'convert:complete'
  | 'file:start'
  | 'file:complete'
  | 'file:error'
  | 'error';

/**
 * Callback for plugin events
 */
export type PluginEventCallback = (data: unknown) => void | Promise<void>;

/**
 * Conversion result structure (subset for hook context)
 */
export interface ConversionResult {
  totalFiles: number;
  successCount: number;
  failedCount: number;
  totalWikiLinks: number;
  totalCallouts: number;
  totalAttachments: number;
  brokenLinks: string[];
  duration: number;
}

/**
 * Plugin options from configuration
 */
export interface PluginOptions {
  /** Plugin ID or path */
  id?: string;
  /** Local plugin path */
  path?: string;
  /** NPM package name */
  package?: string;
  /** Plugin configuration */
  config?: Record<string, unknown>;
  /** Whether plugin is enabled */
  enabled?: boolean;
}

/**
 * Plugin load options
 */
export interface PluginLoadOptions {
  /** Directories to search for plugins */
  pluginDirs: string[];
  /** Load strategy */
  mode: 'lazy' | 'eager' | 'on-demand';
  /** Enable sandbox isolation */
  sandboxEnabled: boolean;
  /** Resource limits */
  resourceLimits: ResourceLimits;
}

/**
 * Result of loading a plugin
 */
export interface LoadedPlugin {
  /** Plugin instance */
  plugin: ObsidianConvertPlugin;
  /** Path to plugin */
  pluginPath: string;
  /** Timestamp when loaded */
  loadedAt: number;
}
