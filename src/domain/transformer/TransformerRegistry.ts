import {
  Transformer,
  TransformerResult,
  TransformerExecutionOptions,
  BuiltInTransformerName,
  BuiltInTransformerConfig,
  TransformContext,
} from './Transformer';

/**
 * Default priority for built-in transformers
 */
const DEFAULT_BUILT_IN_PRIORITY = 100;

/**
 * Registry for managing transformers with execution ordering and error isolation
 */
export class TransformerRegistry {
  private transformers: Transformer[] = [];
  private disabledBuiltIns: Set<BuiltInTransformerName> = new Set();
  private builtInConfigs: Map<BuiltInTransformerName, BuiltInTransformerConfig> = new Map();
  private errorIsolationEnabled: boolean = true;

  constructor() {
    // Initialize with empty registry
  }

  /**
   * Register a custom transformer
   */
  register(transformer: Transformer): void {
    if (!transformer.name) {
      throw new Error('Transformer must have a name');
    }
    if (!transformer.pattern) {
      throw new Error(`Transformer ${transformer.name} must have a pattern`);
    }
    if (typeof transformer.transform !== 'function') {
      throw new Error(`Transformer ${transformer.name} must have a transform function`);
    }

    // Set default priority if not provided
    if (transformer.priority === undefined) {
      transformer.priority = 0;
    }

    // Set default enabled if not provided
    if (transformer.enabled === undefined) {
      transformer.enabled = true;
    }

    // Remove existing transformer with same name (for overriding)
    this.transformers = this.transformers.filter(t => t.name !== transformer.name);
    this.transformers.push(transformer);

    // Sort by priority (descending - higher priority first)
    this.sortByPriority();
  }

  /**
   * Unregister a transformer by name
   */
  unregister(name: string): boolean {
    const initialLength = this.transformers.length;
    this.transformers = this.transformers.filter(t => t.name !== name);
    return this.transformers.length < initialLength;
  }

  /**
   * Get a transformer by name
   */
  get(name: string): Transformer | undefined {
    return this.transformers.find(t => t.name === name);
  }

  /**
   * Get all registered transformers (sorted by priority)
   */
  getAll(): Transformer[] {
    return [...this.transformers];
  }

  /**
   * Get only enabled transformers (sorted by priority)
   */
  getEnabled(): Transformer[] {
    return this.transformers.filter(t => t.enabled !== false);
  }

  /**
   * Disable a built-in transformer
   */
  disableBuiltIn(name: BuiltInTransformerName): void {
    this.disabledBuiltIns.add(name);
  }

  /**
   * Enable a built-in transformer
   */
  enableBuiltIn(name: BuiltInTransformerName): void {
    this.disabledBuiltIns.delete(name);
  }

  /**
   * Check if a built-in transformer is disabled
   */
  isBuiltInDisabled(name: BuiltInTransformerName): boolean {
    return this.disabledBuiltIns.has(name);
  }

  /**
   * Configure a built-in transformer
   */
  configureBuiltIn(name: BuiltInTransformerName, config: BuiltInTransformerConfig): void {
    this.builtInConfigs.set(name, config);
    if (!config.enabled) {
      this.disableBuiltIn(name);
    } else {
      this.enableBuiltIn(name);
    }
  }

  /**
   * Get configuration for a built-in transformer
   */
  getBuiltInConfig(name: BuiltInTransformerName): BuiltInTransformerConfig | undefined {
    return this.builtInConfigs.get(name);
  }

  /**
   * Set error isolation enabled/disabled
   */
  setErrorIsolation(enabled: boolean): void {
    this.errorIsolationEnabled = enabled;
  }

  /**
   * Check if error isolation is enabled
   */
  isErrorIsolationEnabled(): boolean {
    return this.errorIsolationEnabled;
  }

  /**
   * Execute all enabled transformers on content
   */
  execute(
    content: string,
    context: TransformContext,
    options: TransformerExecutionOptions = {}
  ): { content: string; results: TransformerResult[]; errors: Error[] } {
    const results: TransformerResult[] = [];
    const errors: Error[] = [];
    let result = content;

    const enabledTransformers = this.getEnabled();

    for (const transformer of enabledTransformers) {
      if (transformer.enabled === false) continue;

      const { content: newContent, results: transformerResults } = this.executeTransformer(
        transformer,
        result,
        context
      );

      for (const tr of transformerResults) {
        results.push(tr);

        if (tr.error) {
          errors.push(tr.error);
          if (options.failFast) {
            return { content: result, results, errors };
          }
        }
      }

      // Update result with transformed content
      result = newContent;
    }

    return { content: result, results, errors };
  }

  /**
   * Execute a single transformer on content
   * Returns the modified content and results
   */
  private executeTransformer(
    transformer: Transformer,
    content: string,
    context: TransformContext
  ): { content: string; results: TransformerResult[] } {
    const transformerResults: TransformerResult[] = [];
    const matches = [...content.matchAll(transformer.pattern)];

    if (matches.length === 0) {
      return { content, results: [] };
    }

    // Process matches in reverse order to preserve positions
    let result = content;
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      let transformed: string | null = null;
      let error: Error | undefined;

      if (this.errorIsolationEnabled) {
        // Error isolation enabled - catch transformer errors
        try {
          transformed = transformer.transform(match, context);
        } catch (e) {
          error = e instanceof Error ? e : new Error(String(e));
        }
      } else {
        // No error isolation - let errors propagate
        transformed = transformer.transform(match, context);
      }

      const changed = transformed !== null && transformed !== match[0];

      const tr: TransformerResult = {
        match,
        transformed,
        changed,
        error,
      };
      transformerResults.push(tr);

      // Apply transformation if changed
      if (changed && transformed !== null && error === undefined) {
        const before = result.slice(0, match.index);
        const after = result.slice(match.index! + match[0].length);
        result = before + transformed + after;
      }
    }

    // Reverse results back to original order
    transformerResults.reverse();

    return { content: result, results: transformerResults };
  }

  /**
   * Sort transformers by priority (descending)
   */
  private sortByPriority(): void {
    this.transformers.sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA;
    });
  }

  /**
   * Clear all custom transformers (keeps built-in configuration)
   */
  clearCustomTransformers(): void {
    this.transformers = this.transformers.filter(t => t.name.startsWith('built-in:'));
  }

  /**
   * Clear all transformers including built-in configuration
   */
  clearAll(): void {
    this.transformers = [];
    this.disabledBuiltIns.clear();
    this.builtInConfigs.clear();
  }

  /**
   * Get the count of registered transformers
   */
  getCount(): number {
    return this.transformers.length;
  }

  /**
   * Get the count of enabled transformers
   */
  getEnabledCount(): number {
    return this.getEnabled().length;
  }
}
