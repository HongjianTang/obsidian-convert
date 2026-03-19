import { PluginConfigValidator } from '../../../src/plugin/PluginConfigValidator';
import type { PluginManifest } from '../../../src/plugin/types';

describe('PluginConfigValidator', () => {
  let validator: PluginConfigValidator;

  beforeEach(() => {
    validator = new PluginConfigValidator();
  });

  describe('validateManifest', () => {
    it('should return valid for a correct manifest', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
      };

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for missing id', () => {
      const manifest = {
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
      } as unknown as PluginManifest;

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('id is required and must be a string');
    });

    it('should return error for invalid id pattern', () => {
      const manifest: PluginManifest = {
        id: 'Test-Plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
      };

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('lowercase letter'))).toBe(true);
    });

    it('should return error for missing name', () => {
      const manifest = {
        id: 'test-plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
      } as unknown as PluginManifest;

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required and must be a string');
    });

    it('should return error for missing version', () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        main: 'index.js',
        type: 'transformer',
      } as unknown as PluginManifest;

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('version is required and must be a string');
    });

    it('should return error for invalid version format', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: 'invalid',
        main: 'index.js',
        type: 'transformer',
      };

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('semantic version'))).toBe(true);
    });

    it('should return error for missing main', () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        type: 'transformer',
      } as unknown as PluginManifest;

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('main is required and must be a string');
    });

    it('should return error for missing type', () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
      } as unknown as PluginManifest;

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('type is required and must be a string');
    });

    it('should return error for invalid type', () => {
      const manifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'invalid-type',
      } as unknown as PluginManifest;

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('type must be one of'))).toBe(true);
    });

    it('should accept valid plugin types', () => {
      const validTypes = ['transformer', 'link-handler', 'callout-handler', 'full'];

      for (const type of validTypes) {
        const manifest: PluginManifest = {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          main: 'index.js',
          type: type as 'transformer' | 'link-handler' | 'callout-handler' | 'full',
        };

        const result = validator.validateManifest(manifest);
        expect(result.valid).toBe(true);
      }
    });

    it('should return error for invalid description length', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
        description: 'a'.repeat(513),
      };

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('512 characters'))).toBe(true);
    });

    it('should validate author object', () => {
      const manifestWithAuthor: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
        author: {
          name: 'Test Author',
          email: 'test@example.com',
          url: 'https://example.com',
        },
      };

      const result = validator.validateManifest(manifestWithAuthor);
      expect(result.valid).toBe(true);
    });

    it('should return error for author without name', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
        author: {
          name: '',
        },
      };

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('author.name'))).toBe(true);
    });

    it('should validate tags array', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
        tags: ['tag1', 'tag2'],
      };

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(true);
    });

    it('should return error for duplicate tags', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
        tags: ['tag1', 'tag1'],
      };

      const result = validator.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('unique'))).toBe(true);
    });
  });

  describe('validatePluginId', () => {
    it('should return valid for correct plugin ID', () => {
      const result = validator.validatePluginId('my-plugin');
      expect(result.valid).toBe(true);
    });

    it('should return valid for plugin ID with numbers', () => {
      const result = validator.validatePluginId('my-plugin-123');
      expect(result.valid).toBe(true);
    });

    it('should return valid for plugin ID with underscores', () => {
      const result = validator.validatePluginId('my_plugin_123');
      expect(result.valid).toBe(true);
    });

    it('should return error for empty ID', () => {
      const result = validator.validatePluginId('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error for ID starting with number', () => {
      const result = validator.validatePluginId('123-plugin');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('lowercase letter');
    });

    it('should return error for ID longer than 64 characters', () => {
      const longId = 'a'.repeat(65);
      const result = validator.validatePluginId(longId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('64 characters');
    });
  });

  describe('validateVersion', () => {
    it('should return valid for semantic version', () => {
      const result = validator.validateVersion('1.0.0');
      expect(result.valid).toBe(true);
    });

    it('should return valid for pre-release version', () => {
      const result = validator.validateVersion('1.0.0-beta.1');
      expect(result.valid).toBe(true);
    });

    it('should return error for empty version', () => {
      const result = validator.validateVersion('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error for invalid version format', () => {
      const result = validator.validateVersion('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('semantic version');
    });
  });

  describe('validatePluginType', () => {
    it('should return valid for transformer', () => {
      const result = validator.validatePluginType('transformer');
      expect(result.valid).toBe(true);
    });

    it('should return valid for link-handler', () => {
      const result = validator.validatePluginType('link-handler');
      expect(result.valid).toBe(true);
    });

    it('should return valid for callout-handler', () => {
      const result = validator.validatePluginType('callout-handler');
      expect(result.valid).toBe(true);
    });

    it('should return valid for full', () => {
      const result = validator.validatePluginType('full');
      expect(result.valid).toBe(true);
    });

    it('should return error for invalid type', () => {
      const result = validator.validatePluginType('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('type must be one of');
    });
  });

  describe('checkRequiredFields', () => {
    it('should return empty array for complete manifest', () => {
      const manifest: PluginManifest = {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        main: 'index.js',
        type: 'transformer',
      };

      const errors = validator.checkRequiredFields(manifest as unknown as Record<string, unknown>);
      expect(errors).toHaveLength(0);
    });

    it('should list all missing required fields', () => {
      const manifest = {} as PluginManifest;

      const errors = validator.checkRequiredFields(manifest as unknown as Record<string, unknown>);
      expect(errors).toContain('id is required');
      expect(errors).toContain('name is required');
      expect(errors).toContain('version is required');
      expect(errors).toContain('main is required');
      expect(errors).toContain('type is required');
    });
  });
});
