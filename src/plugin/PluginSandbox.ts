import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs';
import type { PluginSandboxContext, ResourceLimits, PluginAPIKind } from './types';
import { SandboxPluginAPI, createSafeConsole, createSafeProcess } from './api';

/**
 * Options for creating a plugin sandbox
 */
export interface SandboxOptions {
  /** Plugin identifier */
  pluginId: string;
  /** Plugin version */
  pluginVersion: string;
  /** Set of allowed API kinds */
  allowedAPIs: Set<PluginAPIKind>;
  /** Resource usage limits */
  resourceLimits: ResourceLimits;
  /** Global error handler callback */
  globalErrorHandler?: (error: Error) => void;
  /** Plugin configuration */
  pluginConfig?: Record<string, unknown>;
}

/**
 * Sandbox for isolated plugin execution
 * Provides security boundaries and controlled API access
 */
export class PluginSandbox {
  private context: vm.Context;
  private options: SandboxOptions;
  private pluginAPI: SandboxPluginAPI;
  private disposed: boolean = false;

  constructor(options: SandboxOptions) {
    this.options = options;
    this.context = this.createContext();
    this.pluginAPI = new SandboxPluginAPI(
      options.pluginId,
      options.allowedAPIs,
      options.pluginConfig || {}
    );
  }

  /**
   * Create an isolated VM context
   */
  private createContext(): vm.Context {
    const sandbox = {
      console: createSafeConsole(this.options.pluginId),
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      clearImmediate: undefined,
      require: undefined,
      module: undefined,
      exports: undefined,
      __dirname: undefined,
      __filename: undefined,
      process: createSafeProcess(),
      Buffer: undefined,
      pluginAPI: this.pluginAPI,
      pluginManifest: {
        id: this.options.pluginId,
        version: this.options.pluginVersion,
      },
    };

    vm.createContext(sandbox);
    return sandbox;
  }

  /**
   * Run code within the sandbox
   * @param code - JavaScript code to execute
   * @param filename - Filename for error reporting
   * @returns Result of code execution
   */
  runCode(code: string, filename: string = 'plugin.js'): unknown {
    if (this.disposed) {
      throw new Error('Sandbox has been disposed');
    }

    const timeout = this.options.resourceLimits.maxExecutionTime || 5000;

    try {
      const script = new vm.Script(code, {
        filename,
      });

      return script.runInContext(this.context, {
        timeout,
      });
    } catch (error) {
      if (this.options.globalErrorHandler && error instanceof Error) {
        this.options.globalErrorHandler(error);
      }
      throw error;
    }
  }

  /**
   * Run a function within the sandbox
   * @param fn - Function to execute
   * @param args - Arguments to pass
   * @returns Function result
   */
  runFunction<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): T {
    if (this.disposed) {
      throw new Error('Sandbox has been disposed');
    }

    const fnString = fn.toString();
    const timeout = this.options.resourceLimits.maxExecutionTime || 5000;

    try {
      const wrappedCode = `
        (function(fn) {
          return fn(...args);
        })(${fnString})
      `;

      const script = new vm.Script(wrappedCode, {
        filename: 'plugin-wrapper.js',
      });

      return script.runInContext(this.context, {
        timeout,
      }) as T;
    } catch (error) {
      if (this.options.globalErrorHandler && error instanceof Error) {
        this.options.globalErrorHandler(error);
      }
      throw error;
    }
  }

  /**
   * Load and execute a plugin module file
   * @param modulePath - Path to the module file
   * @returns Loaded module exports
   */
  async loadModule(modulePath: string): Promise<unknown> {
    if (this.disposed) {
      throw new Error('Sandbox has been disposed');
    }

    const resolvedPath = path.resolve(modulePath);

    // Check allowed paths if configured
    if (this.options.resourceLimits.allowedPaths) {
      const isAllowed = this.options.resourceLimits.allowedPaths.some((allowedPath: string) =>
        resolvedPath.startsWith(path.resolve(allowedPath))
      );
      if (!isAllowed) {
        throw new Error(`Path ${modulePath} is not in allowed paths`);
      }
    }

    const code = await fs.promises.readFile(resolvedPath, 'utf-8');
    return this.runCode(code, path.basename(resolvedPath));
  }

  /**
   * Get the sandbox's plugin API instance
   */
  getPluginAPI(): SandboxPluginAPI {
    return this.pluginAPI;
  }

  /**
   * Get context for inspection
   */
  getContext(): vm.Context {
    return this.context;
  }

  /**
   * Check if sandbox has been disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Dispose of the sandbox and cleanup resources
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clear context references
    if (this.context && typeof this.context === 'object') {
      const ctx = this.context as Record<string, unknown>;
      for (const key of Object.keys(ctx)) {
        ctx[key] = undefined;
      }
    }
    this.context = null as unknown as vm.Context;
  }
}

/**
 * Create a sandbox context object without full sandbox isolation
 * Used for plugins that don't require strict security
 */
export function createBasicSandboxContext(
  pluginId: string,
  pluginVersion: string,
  allowedAPIs: Set<PluginAPIKind>,
  resourceLimits: ResourceLimits
): PluginSandboxContext {
  return {
    pluginId,
    pluginVersion,
    allowedAPIs,
    resourceLimits,
  };
}
