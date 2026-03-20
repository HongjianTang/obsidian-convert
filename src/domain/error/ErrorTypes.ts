/**
 * Error severity levels
 */
export enum ErrorLevel {
  /** Fatal error - cannot continue */
  FATAL = 'fatal',
  /** Warning - can continue but may cause issues */
  WARNING = 'warning',
  /** Info - informational message */
  INFO = 'info',
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  /** YAML parsing error */
  PARSE_ERROR = 'ParseError',
  /** Transformer error */
  TRANSFORM_ERROR = 'TransformError',
  /** File I/O error */
  IO_ERROR = 'IOError',
  /** Link resolution error */
  LINK_ERROR = 'LinkError',
  /** Configuration error */
  CONFIG_ERROR = 'ConfigError',
  /** Plugin error */
  PLUGIN_ERROR = 'PluginError',
  /** Unknown error */
  UNKNOWN_ERROR = 'UnknownError',
}

/**
 * Source location information
 */
export interface SourceLocation {
  /** File path */
  file?: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Optional end line for ranges */
  endLine?: number;
  /** Optional end column for ranges */
  endColumn?: number;
}

/**
 * Context preview showing lines around the error
 */
export interface ContextPreview {
  /** Lines before the error */
  before: string[];
  /** The line containing the error */
  line: string;
  /** Lines after the error */
  after: string[];
  /** Number of padding lines to show */
  contextSize: number;
}

/**
 * Fix suggestion for common errors
 */
export interface FixSuggestion {
  /** Short description of the fix */
  description: string;
  /** Code snippet for the fix (if applicable) */
  code?: string;
  /** Documentation URL for more info */
  docsUrl?: string;
}

/**
 * Enhanced error with full context
 */
export interface EnhancedError {
  /** Unique error code */
  code: string;
  /** Error message */
  message: string;
  /** Error category */
  category: ErrorCategory;
  /** Error severity level */
  level: ErrorLevel;
  /** Source location */
  location?: SourceLocation;
  /** Context preview */
  context?: ContextPreview;
  /** Original error if wrapped */
  originalError?: Error;
  /** Stack trace (if verbose) */
  stack?: string;
  /** Fix suggestions */
  suggestions: FixSuggestion[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for error formatting
 */
export interface ErrorFormatterOptions {
  /** Show full stack trace */
  verbose?: boolean;
  /** Show context preview (default: true) */
  showContext?: boolean;
  /** Number of context lines (default: 2) */
  contextSize?: number;
  /** Colorize output (default: false) */
  colorize?: boolean;
  /** IDE-compatible format (default: false) */
  ideFormat?: boolean;
}

/**
 * Result of collecting errors
 */
export interface ErrorReport {
  /** All errors */
  errors: EnhancedError[];
  /** Errors by level */
  byLevel: {
    fatal: EnhancedError[];
    warning: EnhancedError[];
    info: EnhancedError[];
  };
  /** Error statistics */
  stats: {
    total: number;
    fatalCount: number;
    warningCount: number;
    infoCount: number;
  };
}