import { PluginRegistry } from '../../../src/plugin/PluginRegistry';
import type { ObsidianConvertPlugin } from '../../../src/plugin/types';

function createMockPlugin(id: string, type: string = 'transformer'): ObsidianConvertPlugin {
  return {
    id,
    manifest: {
      id,
      name: `Plugin ${id}`,
      version: '1.0.0',
      main: 'index.js',
      type: type as 'transformer' | 'link-handler' | 'callout-handler' | 'full',
    },
    hooks: {},
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  describe('register', () => {
    it('should register a plugin successfully', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      expect(registry.get('test-plugin')).toBe(plugin);
      expect(registry.getCount()).toBe(1);
    });

    it('should throw error when registering duplicate plugin', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      expect(() => registry.register(plugin)).toThrow('already registered');
    });

    it('should maintain registration order', () => {
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');
      const plugin3 = createMockPlugin('plugin-3');

      registry.register(plugin1);
      registry.register(plugin2);
      registry.register(plugin3);

      const all = registry.getAll();
      expect(all.map(p => p.id)).toEqual(['plugin-1', 'plugin-2', 'plugin-3']);
    });
  });

  describe('unregister', () => {
    it('should unregister a plugin successfully', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      expect(registry.unregister('test-plugin')).toBe(true);
      expect(registry.get('test-plugin')).toBeUndefined();
      expect(registry.getCount()).toBe(0);
    });

    it('should return false when unregistering non-existent plugin', () => {
      expect(registry.unregister('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should retrieve registered plugin', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      expect(registry.get('test-plugin')).toBe(plugin);
    });

    it('should return undefined for non-existent plugin', () => {
      expect(registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered plugins in order', () => {
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');
      registry.register(plugin1);
      registry.register(plugin2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe('plugin-1');
      expect(all[1].id).toBe('plugin-2');
    });

    it('should return empty array when no plugins registered', () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('getEnabled', () => {
    it('should return only enabled plugins', () => {
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');
      registry.register(plugin1);
      registry.register(plugin2);
      registry.disable('plugin-1');

      const enabled = registry.getEnabled();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].id).toBe('plugin-2');
    });
  });

  describe('getByType', () => {
    it('should return plugins of specified type', () => {
      const transformer = createMockPlugin('transformer-plugin', 'transformer');
      const linkHandler = createMockPlugin('link-handler-plugin', 'link-handler');
      registry.register(transformer);
      registry.register(linkHandler);

      const transformers = registry.getByType('transformer');
      expect(transformers).toHaveLength(1);
      expect(transformers[0].id).toBe('transformer-plugin');
    });
  });

  describe('enable/disable', () => {
    it('should enable a disabled plugin', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);
      registry.disable('test-plugin');

      expect(registry.isEnabled('test-plugin')).toBe(false);

      registry.enable('test-plugin');
      expect(registry.isEnabled('test-plugin')).toBe(true);
    });

    it('should disable an enabled plugin', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      expect(registry.isEnabled('test-plugin')).toBe(true);

      registry.disable('test-plugin');
      expect(registry.isEnabled('test-plugin')).toBe(false);
    });

    it('should not enable non-existent plugin', () => {
      registry.enable('non-existent');
      expect(registry.isEnabled('non-existent')).toBe(false);
    });
  });

  describe('has', () => {
    it('should return true for registered plugin', () => {
      const plugin = createMockPlugin('test-plugin');
      registry.register(plugin);

      expect(registry.has('test-plugin')).toBe(true);
    });

    it('should return false for non-registered plugin', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all plugins', () => {
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');
      registry.register(plugin1);
      registry.register(plugin2);

      registry.clear();

      expect(registry.getCount()).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe('getCount/getEnabledCount', () => {
    it('should return correct counts', () => {
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');
      registry.register(plugin1);
      registry.register(plugin2);
      registry.disable('plugin-2');

      expect(registry.getCount()).toBe(2);
      expect(registry.getEnabledCount()).toBe(1);
    });
  });

  describe('updateConfig', () => {
    it('should update plugin config', () => {
      const plugin = createMockPlugin('test-plugin');
      plugin.config = { key: 'value' };
      registry.register(plugin);

      const result = registry.updateConfig('test-plugin', { newKey: 'newValue' });

      expect(result).toBe(true);
      expect(plugin.config).toEqual({ key: 'value', newKey: 'newValue' });
    });

    it('should return false for non-existent plugin', () => {
      const result = registry.updateConfig('non-existent', { key: 'value' });
      expect(result).toBe(false);
    });
  });

  describe('reorder', () => {
    it('should move plugin to new position', () => {
      const plugin1 = createMockPlugin('plugin-1');
      const plugin2 = createMockPlugin('plugin-2');
      const plugin3 = createMockPlugin('plugin-3');
      registry.register(plugin1);
      registry.register(plugin2);
      registry.register(plugin3);

      registry.reorder('plugin-1', 2);

      const all = registry.getAll();
      expect(all.map(p => p.id)).toEqual(['plugin-2', 'plugin-3', 'plugin-1']);
    });

    it('should return false for non-existent plugin', () => {
      const result = registry.reorder('non-existent', 1);
      expect(result).toBe(false);
    });

    it('should return false for invalid index', () => {
      const plugin = createMockPlugin('plugin-1');
      registry.register(plugin);

      expect(registry.reorder('plugin-1', -1)).toBe(false);
      expect(registry.reorder('plugin-1', 10)).toBe(false);
    });
  });
});
