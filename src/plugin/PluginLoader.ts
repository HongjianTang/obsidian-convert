import * as path from 'path';
import * as fs from 'fs';
import type {
  ObsidianConvertPlugin,
  PluginManifest,
  PluginLoadOptions,
  LoadedPlugin,
  PluginSandboxContext,
  ResourceLimits,
  PluginAPIKind,
} from './types';
import { PluginSandbox, createBasicSandboxContext } from './PluginSandbox';

/**
 * Default resource limits for plugins
 */
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxMemory: 128,
  maxExecutionTime: 5000,
  allowedPaths: [],
};

/**
 * Loads plugins from various sources with sandbox isolation
 */
export class PluginLoader {
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private options: PluginLoadOptions;

  constructor(options?: Partial<PluginLoadOptions>) {
    this.options = {
      pluginDirs: options?.pluginDirs || [],
      mode: options?.mode || 'eager',
      sandboxEnabled: options?.sandboxEnabled ?? true,
      resourceLimits: options?.resourceLimits || DEFAULT_RESOURCE_LIMITS,
    };
  }

  /**
   * Load a single plugin from a path
   * @param pluginPath - Path to plugin directory containing plugin.json
   * @returns Loaded plugin instance
   */
  async loadPlugin(pluginPath: string): Promise<ObsidianConvertPlugin> {
    // 1. Load and validate manifest
    const manifest = await this.loadManifest(pluginPath);
    this.validateManifest(manifest);

    // 2. Create sandbox context
    const sandboxContext = this.createSandboxContext(manifest);

    // 3. Load plugin module in sandbox
    const pluginModule = await this.loadPluginModule(pluginPath, manifest, sandboxContext);

    // 4. Create plugin instance
    const plugin = await this.createPluginInstance(manifest, pluginModule, sandboxContext);

    // 5. Register in loaded plugins map
    const loadedPlugin: LoadedPlugin = {
      plugin,
      pluginPath: path.resolve(pluginPath),
      loadedAt: Date.now(),
    };
    this.loadedPlugins.set(plugin.id, loadedPlugin);

    return plugin;
  }

  /**
   * Unload a plugin by ID
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const loaded = this.loadedPlugins.get(pluginId);
    if (!loaded) {
      return false;
    }

    // Call unload hook if present
    if (loaded.plugin.hooks.onUnload) {
      try {
        await loaded.plugin.hooks.onUnload();
      } catch (error) {
        console.error(`Error unloading plugin ${pluginId}:`, error);
      }
    }

    this.loadedPlugins.delete(pluginId);
    return true;
  }

  /**
   * Load all plugins from a directory
   * @param dirPath - Directory containing plugin subdirectories
   * @returns Array of loaded plugins
   */
  async loadPluginsFromDir(dirPath: string): Promise<ObsidianConvertPlugin[]> {
    const plugins: ObsidianConvertPlugin[] = [];

    if (!fs.existsSync(dirPath)) {
      return plugins;
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const pluginPath = path.join(dirPath, entry.name);
      const manifestPath = path.join(pluginPath, 'plugin.json');

      if (fs.existsSync(manifestPath)) {
        try {
          const plugin = await this.loadPlugin(pluginPath);
          plugins.push(plugin);
        } catch (error) {
          console.error(`Failed to load plugin from ${pluginPath}:`, error);
        }
      }
    }

    return plugins;
  }

  /**
   * Load plugin manifest from plugin.json
   */
  private async loadManifest(pluginPath: string): Promise<PluginManifest> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const content = await fs.promises.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as PluginManifest;
  }

  /**
   * Validate plugin manifest has required fields
   */
  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.id) {
      throw new Error('Plugin manifest must have an id field');
    }
    if (!manifest.name) {
      throw new Error('Plugin manifest must have a name field');
    }
    if (!manifest.version) {
      throw new Error('Plugin manifest must have a version field');
    }
    if (!manifest.main) {
      throw new Error('Plugin manifest must have a main field');
    }
    if (!manifest.type) {
      throw new Error('Plugin manifest must have a type field');
    }
    const validTypes = ['transformer', 'link-handler', 'callout-handler', 'full'];
    if (!validTypes.includes(manifest.type)) {
      throw new Error(`Plugin type must be one of: ${validTypes.join(', ')}`);
    }
  }

  /**
   * Create sandbox context for a plugin
   */
  private createSandboxContext(manifest: PluginManifest): PluginSandboxContext {
    return createBasicSandboxContext(
      manifest.id,
      manifest.version,
      this.resolveAllowedAPIs(manifest),
      this.options.resourceLimits
    );
  }

  /**
   * Determine allowed APIs based on plugin type
   */
  private resolveAllowedAPIs(manifest: PluginManifest): Set<PluginAPIKind> {
    const baseAPIs: PluginAPIKind[] = ['config:get', 'logger:info', 'logger:warn', 'logger:error'];

    switch (manifest.type) {
      case 'transformer':
        return new Set<PluginAPIKind>([...baseAPIs, 'transformer:register', 'transformer:unregister']);
      case 'link-handler':
        return new Set<PluginAPIKind>([...baseAPIs, 'file:read']);
      case 'callout-handler':
        return new Set<PluginAPIKind>([...baseAPIs, 'file:read']);
      case 'full':
        return new Set<PluginAPIKind>([
          ...baseAPIs,
          'file:read',
          'file:write',
          'http:fetch',
          'transformer:register',
          'transformer:unregister',
          'hook:on',
          'hook:off',
        ]);
      default:
        return new Set<PluginAPIKind>(baseAPIs);
    }
  }

  /**
   * Load plugin module code in sandbox
   */
  private async loadPluginModule(
    pluginPath: string,
    manifest: PluginManifest,
    context: PluginSandboxContext
  ): Promise<unknown> {
    const mainPath = path.join(pluginPath, manifest.main);

    if (!fs.existsSync(mainPath)) {
      throw new Error(`Plugin main file not found: ${mainPath}`);
    }

    if (!this.options.sandboxEnabled) {
      // Load without sandbox - for testing or trusted plugins
      const module = await import(mainPath);
      return module.default || module;
    }

    // Use sandbox for isolation
    const sandbox = new PluginSandbox({
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      allowedAPIs: context.allowedAPIs,
      resourceLimits: this.options.resourceLimits,
      pluginConfig: {},
    });

    try {
      return await sandbox.loadModule(mainPath);
    } finally {
      sandbox.dispose();
    }
  }

  /**
   * Create plugin instance from loaded module
   */
  private async createPluginInstance(
    manifest: PluginManifest,
    module: unknown,
    _context: PluginSandboxContext
  ): Promise<ObsidianConvertPlugin> {
    let pluginFactory: (context: PluginSandboxContext) => ObsidianConvertPlugin | Promise<ObsidianConvertPlugin>;

    if (typeof module === 'function') {
      pluginFactory = module as (context: PluginSandboxContext) => ObsidianConvertPlugin;
    } else if (module && typeof module === 'object' && 'default' in module) {
      pluginFactory = module.default as (context: PluginSandboxContext) => ObsidianConvertPlugin;
    } else {
      throw new Error('Plugin module must export a factory function');
    }

    const plugin = await pluginFactory(_context);

    // Generate runtime ID with version
    plugin.id = `${manifest.id}@${manifest.version}`;
    plugin.manifest = manifest;

    return plugin;
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Get a loaded plugin by ID
   */
  getLoadedPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * Get count of loaded plugins
   */
  getLoadedCount(): number {
    return this.loadedPlugins.size;
  }

  /**
   * Check if a plugin is loaded
   */
  isLoaded(pluginId: string): boolean {
    return this.loadedPlugins.has(pluginId);
  }

  /**
   * Get current loader options
   */
  getOptions(): PluginLoadOptions {
    return { ...this.options };
  }
}
