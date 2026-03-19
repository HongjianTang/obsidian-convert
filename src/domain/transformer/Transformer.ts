/**
 * Custom Transformer Interface
 * Users can define custom transformers with pattern matching and transform functions
 */
export interface Transformer {
  /** Unique name for the transformer */
  name: string;
  /** Regex pattern to match content */
  pattern: RegExp;
  /** Transform function that processes matched content */
  transform: TransformFunction;
  /** Priority for execution order (higher = runs first, default: 0) */
  priority?: number;
  /** Whether this transformer is enabled (default: true) */
  enabled?: boolean;
  /** Human-readable description */
  description?: string;
}

/**
 * Transform function signature
 * @param match - The full regex match
 * @param context - Transform context with file information
 * @returns Transformed string or null to keep original
 */
export type TransformFunction = (
  match: RegExpMatchArray,
  context: TransformContext
) => string | null;

/**
 * Context passed to transform functions
 */
export interface TransformContext {
  /** Full content of the file */
  fullContent: string;
  /** Current file path */
  filePath: string;
  /** Source root directory */
  sourceRoot: string;
  /** File index for link resolution */
  fileIndex?: Map<string, string>;
}

/**
 * Result of a transformer execution
 */
export interface TransformerResult {
  /** Original match */
  match: RegExpMatchArray;
  /** Transformed content (null if no change) */
  transformed: string | null;
  /** Whether transformation occurred */
  changed: boolean;
  /** Error if transformation failed */
  error?: Error;
}

/**
 * Options for transformer execution
 */
export interface TransformerExecutionOptions {
  /** Stop processing after first error */
  failFast?: boolean;
  /** Continue on error and collect errors */
  collectErrors?: boolean;
}

/**
 * Built-in transformer names that can be disabled or overridden
 */
export type BuiltInTransformerName =
  | 'wikilink'
  | 'callout'
  | 'frontmatter'
  | 'attachment';

/**
 * Configuration for a built-in transformer
 */
export interface BuiltInTransformerConfig {
  /** Whether to enable this transformer */
  enabled: boolean;
  /** Override with custom options */
  options?: Record<string, unknown>;
}

/**
 * Transformer configuration in config file
 */
export interface TransformerConfig {
  /** List of custom transformers */
  custom?: Array<{
    name: string;
    pattern: string;
    transform: string;
    priority?: number;
    enabled?: boolean;
    description?: string;
  }>;
  /** Built-in transformer configuration */
  builtIn?: Partial<Record<BuiltInTransformerName, BuiltInTransformerConfig>>;
  /** Default priority for custom transformers */
  defaultPriority?: number;
  /** Enable error isolation (default: true) */
  errorIsolation?: boolean;
}

/**
 * Validate a transformer pattern
 * @param pattern - Regex pattern string
 * @returns true if valid
 */
export function isValidPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compile a pattern string to RegExp
 * @param pattern - Pattern string
 * @param flags - Optional flags
 * @returns Compiled RegExp
 */
export function compilePattern(pattern: string, flags?: string): RegExp {
  return new RegExp(pattern, flags);
}
