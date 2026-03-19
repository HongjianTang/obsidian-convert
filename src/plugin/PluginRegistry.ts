import type { ObsidianConvertPlugin } from './types';

/**
 * Registry for managing plugin lifecycle and state
 */
export class PluginRegistry {
  private plugins: Map<string, ObsidianConvertPlugin> = new Map();
  private pluginOrder: string[] = [];
  private enabledPlugins: Set<string> = new Set();

  /**
   * Register a plugin in the registry
   * @throws Error if plugin with same ID is already registered
   */
  register(plugin: ObsidianConvertPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already registered`);
    }

    this.plugins.set(plugin.id, plugin);
    this.pluginOrder.push(plugin.id);
    this.enabledPlugins.add(plugin.id);
  }

  /**
   * Unregister a plugin by ID
   */
  unregister(pluginId: string): boolean {
    if (!this.plugins.has(pluginId)) {
      return false;
    }

    this.plugins.delete(pluginId);
    this.pluginOrder = this.pluginOrder.filter(id => id !== pluginId);
    this.enabledPlugins.delete(pluginId);

    return true;
  }

  /**
   * Get a plugin by ID
   */
  get(pluginId: string): ObsidianConvertPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all registered plugins in registration order
   */
  getAll(): ObsidianConvertPlugin[] {
    return this.pluginOrder.map(id => this.plugins.get(id)!);
  }

  /**
   * Get only enabled plugins
   */
  getEnabled(): ObsidianConvertPlugin[] {
    return this.pluginOrder
      .filter(id => this.enabledPlugins.has(id))
      .map(id => this.plugins.get(id)!);
  }

  /**
   * Get plugins by type
   */
  getByType(type: string): ObsidianConvertPlugin[] {
    return this.getAll().filter(p => p.manifest.type === type);
  }

  /**
   * Enable a plugin
   */
  enable(pluginId: string): void {
    if (this.plugins.has(pluginId)) {
      this.enabledPlugins.add(pluginId);
    }
  }

  /**
   * Disable a plugin
   */
  disable(pluginId: string): void {
    this.enabledPlugins.delete(pluginId);
  }

  /**
   * Check if a plugin is enabled
   */
  isEnabled(pluginId: string): boolean {
    return this.enabledPlugins.has(pluginId);
  }

  /**
   * Get count of registered plugins
   */
  getCount(): number {
    return this.plugins.size;
  }

  /**
   * Get count of enabled plugins
   */
  getEnabledCount(): number {
    return this.enabledPlugins.size;
  }

  /**
   * Check if a plugin is registered
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Clear all plugins from registry
   */
  clear(): void {
    this.plugins.clear();
    this.pluginOrder = [];
    this.enabledPlugins.clear();
  }

  /**
   * Get all plugin IDs
   */
  getPluginIds(): string[] {
    return [...this.plugins.keys()];
  }

  /**
   * Get all enabled plugin IDs
   */
  getEnabledIds(): string[] {
    return [...this.enabledPlugins];
  }

  /**
   * Update plugin configuration
   */
  updateConfig(pluginId: string, config: Record<string, unknown>): boolean {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      return false;
    }
    plugin.config = { ...plugin.config, ...config };
    return true;
  }

  /**
   * Reorder plugins - move plugin to specific position
   */
  reorder(pluginId: string, newIndex: number): boolean {
    const currentIndex = this.pluginOrder.indexOf(pluginId);
    if (currentIndex === -1) {
      return false;
    }

    if (newIndex < 0 || newIndex >= this.pluginOrder.length) {
      return false;
    }

    // Remove from current position
    this.pluginOrder.splice(currentIndex, 1);
    // Insert at new position
    this.pluginOrder.splice(newIndex, 0, pluginId);

    return true;
  }

  /**
   * Get plugins sorted by dependency order
   * Note: This is a basic implementation; full dependency resolution
   * would require analyzing manifest.dependencies
   */
  getSortedByPriority(): ObsidianConvertPlugin[] {
    return this.getEnabled();
  }
}
