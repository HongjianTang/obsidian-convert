import type {
  ConvertContext,
  FileContext,
  FileResult,
  PluginError,
  ErrorContext,
  ConversionResult,
} from './types';
import type { PluginRegistry } from './PluginRegistry';

/**
 * Handler registered for a specific hook
 */
interface HookHandler {
  pluginId: string;
  handler: (...args: unknown[]) => unknown;
  priority: number;
}

/**
 * Dispatches lifecycle hooks to registered plugin handlers
 */
export class HookDispatcher {
  private pluginRegistry: PluginRegistry;
  private hookHandlers: Map<string, HookHandler[]> = new Map();
  private defaultHookTimeout: number = 5000;

  constructor(pluginRegistry: PluginRegistry) {
    this.pluginRegistry = pluginRegistry;
  }

  /**
   * Register a hook handler for a plugin
   */
  registerHook(
    pluginId: string,
    hookName: string,
    handler: (...args: unknown[]) => unknown,
    priority: number = 0
  ): void {
    if (!this.hookHandlers.has(hookName)) {
      this.hookHandlers.set(hookName, []);
    }

    const handlers = this.hookHandlers.get(hookName)!;
    const existingIndex = handlers.findIndex(h => h.pluginId === pluginId);

    if (existingIndex !== -1) {
      // Update existing handler
      handlers[existingIndex] = { pluginId, handler, priority };
    } else {
      // Add new handler
      handlers.push({ pluginId, handler, priority });
      // Sort by priority (descending)
      handlers.sort((a, b) => b.priority - a.priority);
    }
  }

  /**
   * Unregister all hooks for a plugin
   */
  unregisterPluginHooks(pluginId: string): void {
    for (const [hookName, handlers] of this.hookHandlers.entries()) {
      const filtered = handlers.filter(h => h.pluginId !== pluginId);
      this.hookHandlers.set(hookName, filtered);
    }
  }

  /**
   * Unregister a specific hook
   */
  unregisterHook(pluginId: string, hookName: string): void {
    const handlers = this.hookHandlers.get(hookName);
    if (handlers) {
      const filtered = handlers.filter(h => h.pluginId !== pluginId);
      this.hookHandlers.set(hookName, filtered);
    }
  }

  /**
   * Dispatch beforeConvert hook to all enabled plugins
   */
  async dispatchBeforeConvert(context: ConvertContext): Promise<void> {
    await this.dispatch('beforeConvert', context);
  }

  /**
   * Dispatch afterConvert hook to all enabled plugins
   */
  async dispatchAfterConvert(
    context: ConvertContext,
    result: ConversionResult
  ): Promise<void> {
    // afterConvert runs in reverse order
    await this.dispatchReverse('afterConvert', context, result);
  }

  /**
   * Dispatch beforeFileProcess hook
   */
  async dispatchBeforeFileProcess(file: FileContext): Promise<void> {
    await this.dispatch('beforeFileProcess', file);
  }

  /**
   * Dispatch afterFileProcess hook
   */
  async dispatchAfterFileProcess(
    file: FileContext,
    fileResult: FileResult
  ): Promise<void> {
    // afterFileProcess runs in reverse order
    await this.dispatchReverse('afterFileProcess', file, fileResult);
  }

  /**
   * Dispatch onError hook
   */
  async dispatchError(error: PluginError, context: ErrorContext): Promise<void> {
    await this.dispatch('onError', error, context);
  }

  /**
   * Dispatch hook to all enabled plugins in order
   */
  private async dispatch(hookName: string, ...args: unknown[]): Promise<void> {
    const handlers = this.hookHandlers.get(hookName) || [];

    for (const { pluginId, handler } of handlers) {
      const plugin = this.pluginRegistry.get(pluginId);
      if (!plugin || !this.pluginRegistry.isEnabled(pluginId)) {
        continue;
      }

      try {
        await this.callHookWithTimeout(handler, args, pluginId);
      } catch (error) {
        console.error(`Error in hook ${hookName} for plugin ${pluginId}:`, error);

        // Dispatch error hook
        await this.dispatchError(
          {
            code: 'HOOK_ERROR',
            message: error instanceof Error ? error.message : String(error),
            pluginId,
            originalError: error instanceof Error ? error : undefined,
          },
          {
            phase: 'transform',
          }
        );
      }
    }
  }

  /**
   * Dispatch hook in reverse order (for after* hooks)
   */
  private async dispatchReverse(hookName: string, ...args: unknown[]): Promise<void> {
    const handlers = this.hookHandlers.get(hookName) || [];

    // Process in reverse order
    for (let i = handlers.length - 1; i >= 0; i--) {
      const { pluginId, handler } = handlers[i];
      const plugin = this.pluginRegistry.get(pluginId);
      if (!plugin || !this.pluginRegistry.isEnabled(pluginId)) {
        continue;
      }

      try {
        await this.callHookWithTimeout(handler, args, pluginId);
      } catch (error) {
        console.error(`Error in hook ${hookName} for plugin ${pluginId}:`, error);

        // Dispatch error hook
        await this.dispatchError(
          {
            code: 'HOOK_ERROR',
            message: error instanceof Error ? error.message : String(error),
            pluginId,
            originalError: error instanceof Error ? error : undefined,
          },
          {
            phase: 'transform',
          }
        );
      }
    }
  }

  /**
   * Call hook function with timeout
   */
  private async callHookWithTimeout(
    hookFn: (...args: unknown[]) => unknown,
    args: unknown[],
    pluginId: string,
    timeout?: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook timeout for plugin ${pluginId}`));
      }, timeout || this.defaultHookTimeout);

      try {
        const result = hookFn(...args);
        Promise.resolve(result)
          .then(() => {
            clearTimeout(timer);
            resolve();
          })
          .catch(error => {
            clearTimeout(timer);
            reject(error);
          });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Set default timeout for hook execution
   */
  setDefaultHookTimeout(timeout: number): void {
    this.defaultHookTimeout = timeout;
  }

  /**
   * Get count of registered handlers for a hook
   */
  getHookCount(hookName: string): number {
    return this.hookHandlers.get(hookName)?.length || 0;
  }

  /**
   * Get all registered hook names
   */
  getRegisteredHooks(): string[] {
    return Array.from(this.hookHandlers.keys());
  }

  /**
   * Clear all registered hooks
   */
  clear(): void {
    this.hookHandlers.clear();
  }
}
