import * as path from 'path';
import type {
  PluginOptions,
  ObsidianConvertPlugin,
  PluginAPI,
  ConvertContext,
  FileContext,
  FileResult,
  ConversionResult,
  ResourceLimits,
  PluginLoadOptions,
} from './types';
import type { TransformerRegistry } from '../domain/transformer';
import { PluginLoader } from './PluginLoader';
import { PluginRegistry } from './PluginRegistry';
import { HookDispatcher } from './HookDispatcher';
import { PluginErrorHandler } from './PluginErrorHandler';
import { PluginConfigValidator } from './PluginConfigValidator';
import { SandboxPluginAPI } from './api';

/**
 * Default resource limits for plugins
 */
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxMemory: 128,
  maxExecutionTime: 5000,
  allowedPaths: [],
};

/**
 * Options for creating a PluginHost
 */
export interface PluginHostOptions {
  /** Directory containing plugins */
  pluginDir?: string;
  /** Plugin load options */
  loadOptions?: Partial<PluginLoadOptions>;
  /** Transformer registry for plugin transformer registration */
  transformerRegistry?: TransformerRegistry;
  /** Default plugin configuration */
  defaultConfig?: Record<string, unknown>;
}

/**
 * PluginHost integrates the plugin system with the main conversion system
 */
export class PluginHost {
  private loader: PluginLoader;
  private registry: PluginRegistry;
  private dispatcher: HookDispatcher;
  private errorHandler: PluginErrorHandler;
  private validator: PluginConfigValidator;
  private options: Required<PluginHostOptions>;
  private initialized: boolean = false;

  constructor(options: PluginHostOptions = {}) {
    this.options = {
      pluginDir: options.pluginDir || './plugins',
      loadOptions: {
        pluginDirs: options.loadOptions?.pluginDirs || [],
        mode: options.loadOptions?.mode || 'eager',
        sandboxEnabled: options.loadOptions?.sandboxEnabled ?? true,
        resourceLimits: options.loadOptions?.resourceLimits || DEFAULT_RESOURCE_LIMITS,
      },
      transformerRegistry: options.transformerRegistry!,
      defaultConfig: options.defaultConfig || {},
    };

    this.loader = new PluginLoader(this.options.loadOptions);
    this.registry = new PluginRegistry();
    this.dispatcher = new HookDispatcher(this.registry);
    this.errorHandler = new PluginErrorHandler();
    this.validator = new PluginConfigValidator();
  }

  /**
   * Initialize the plugin system and load configured plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
  }

  /**
   * Load a plugin from configuration
   */
  async loadPlugin(config: PluginOptions): Promise<ObsidianConvertPlugin | null> {
    try {
      let plugin: ObsidianConvertPlugin;

      if (config.path) {
        // Load from local path
        plugin = await this.loader.loadPlugin(config.path);
      } else if (config.id) {
        // Load from plugin directory
        const pluginPath = path.join(this.options.pluginDir, config.id);
        plugin = await this.loader.loadPlugin(pluginPath);
      } else {
        console.error('Plugin must have either path or id');
        return null;
      }

      // Apply configuration
      if (config.config) {
        plugin.config = { ...this.options.defaultConfig, ...config.config };
      } else {
        plugin.config = { ...this.options.defaultConfig };
      }

      // Register plugin
      this.registry.register(plugin);

      // Register hooks
      this.registerPluginHooks(plugin);

      // Initialize plugin if it has init function
      if (plugin.init) {
        const api = this.createPluginAPI(plugin);
        await plugin.init(api);
      }

      // Register transformers if any
      if (plugin.transformers && this.options.transformerRegistry) {
        for (const transformer of plugin.transformers) {
          this.options.transformerRegistry.register(transformer);
        }
      }

      // Enable or disable based on config
      if (config.enabled === false) {
        this.registry.disable(plugin.id);
      }

      return plugin;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, { phase: 'load' });
      console.error(`Failed to load plugin:`, error);
      return null;
    }
  }

  /**
   * Unload a plugin by ID
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.registry.get(pluginId);
    if (!plugin) {
      return false;
    }

    // Call unload hook
    if (plugin.hooks.onUnload) {
      try {
        await plugin.hooks.onUnload();
      } catch (error) {
        console.error(`Error calling onUnload for ${pluginId}:`, error);
      }
    }

    // Unregister transformers
    if (plugin.transformers && this.options.transformerRegistry) {
      for (const transformer of plugin.transformers) {
        this.options.transformerRegistry.unregister(transformer.name);
      }
    }

    // Unregister hooks
    this.dispatcher.unregisterPluginHooks(pluginId);

    // Unregister from registry
    this.registry.unregister(pluginId);

    // Unload from loader
    await this.loader.unloadPlugin(pluginId);

    return true;
  }

  /**
   * Create the API object exposed to a plugin
   */
  private createPluginAPI(plugin: ObsidianConvertPlugin): PluginAPI {
    return {
      getConfig: <T = unknown>(key: string, defaultValue?: T): T => {
        return (plugin.config?.[key] as T) ?? defaultValue!;
      },

      setConfig: (key: string, value: unknown): void => {
        if (plugin.config) {
          plugin.config[key] = value;
        }
      },

      logger: {
        info: (message: string, ...args: unknown[]) => {
          console.info(`[${plugin.id}]`, message, ...args);
        },
        warn: (message: string, ...args: unknown[]) => {
          console.warn(`[${plugin.id}]`, message, ...args);
        },
        error: (message: string, ...args: unknown[]) => {
          console.error(`[${plugin.id}]`, message, ...args);
        },
      },

      registerTransformer: (transformer) => {
        if (this.options.transformerRegistry) {
          this.options.transformerRegistry.register(transformer);
        }
      },

      unregisterTransformer: (name: string): boolean => {
        if (this.options.transformerRegistry) {
          return this.options.transformerRegistry.unregister(name);
        }
        return false;
      },

      on: (event, callback) => {
        this.dispatcher.registerHook(plugin.id, event, callback as (...args: unknown[]) => unknown);
      },

      off: (event, callback) => {
        this.dispatcher.unregisterHook(plugin.id, event);
      },
    };
  }

  /**
   * Register all hooks from a plugin
   */
  private registerPluginHooks(plugin: ObsidianConvertPlugin): void {
    const hookNames: (keyof typeof plugin.hooks)[] = [
      'beforeConvert',
      'afterConvert',
      'beforeFileProcess',
      'afterFileProcess',
      'onError',
      'onUnload',
    ];

    for (const hookName of hookNames) {
      const hook = plugin.hooks[hookName];
      if (typeof hook === 'function') {
        this.dispatcher.registerHook(
          plugin.id,
          hookName,
          hook as (...args: unknown[]) => unknown
        );
      }
    }
  }

  /**
   * Dispatch beforeConvert hook
   */
  async dispatchBeforeConvert(context: ConvertContext): Promise<void> {
    await this.dispatcher.dispatchBeforeConvert(context);
  }

  /**
   * Dispatch afterConvert hook
   */
  async dispatchAfterConvert(
    context: ConvertContext,
    result: ConversionResult
  ): Promise<void> {
    await this.dispatcher.dispatchAfterConvert(context, result);
  }

  /**
   * Dispatch beforeFileProcess hook
   */
  async dispatchBeforeFileProcess(file: FileContext): Promise<void> {
    await this.dispatcher.dispatchBeforeFileProcess(file);
  }

  /**
   * Dispatch afterFileProcess hook
   */
  async dispatchAfterFileProcess(
    file: FileContext,
    fileResult: FileResult
  ): Promise<void> {
    await this.dispatcher.dispatchAfterFileProcess(file, fileResult);
  }

  /**
   * Get the plugin registry
   */
  getRegistry(): PluginRegistry {
    return this.registry;
  }

  /**
   * Get the error handler
   */
  getErrorHandler(): PluginErrorHandler {
    return this.errorHandler;
  }

  /**
   * Get the config validator
   */
  getValidator(): PluginConfigValidator {
    return this.validator;
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): ObsidianConvertPlugin[] {
    return this.registry.getAll();
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): ObsidianConvertPlugin[] {
    return this.registry.getEnabled();
  }

  /**
   * Enable a plugin
   */
  enablePlugin(pluginId: string): void {
    this.registry.enable(pluginId);
    this.errorHandler.enablePlugin(pluginId);
  }

  /**
   * Disable a plugin
   */
  disablePlugin(pluginId: string): void {
    this.registry.disable(pluginId);
    this.errorHandler.disablePlugin(pluginId);
  }

  /**
   * Check if plugin system is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Dispose of plugin host and unload all plugins
   */
  async dispose(): Promise<void> {
    const plugins = this.registry.getAll();

    for (const plugin of plugins) {
      await this.unloadPlugin(plugin.id);
    }

    this.dispatcher.clear();
    this.registry.clear();
    this.initialized = false;
  }
}
