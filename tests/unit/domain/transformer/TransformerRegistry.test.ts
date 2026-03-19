import { TransformerRegistry } from '../../../../src/domain/transformer/TransformerRegistry';
import { Transformer, TransformContext } from '../../../../src/domain/transformer/Transformer';

describe('TransformerRegistry', () => {
  let registry: TransformerRegistry;

  beforeEach(() => {
    registry = new TransformerRegistry();
  });

  describe('register', () => {
    it('should register a valid transformer', () => {
      const transformer: Transformer = {
        name: 'test-transformer',
        pattern: /test/g,
        transform: () => 'replaced',
      };

      registry.register(transformer);
      expect(registry.getCount()).toBe(1);
      expect(registry.get('test-transformer')).toBe(transformer);
    });

    it('should throw error if transformer has no name', () => {
      const transformer = {
        pattern: /test/g,
        transform: () => 'replaced',
      } as unknown as Transformer;

      expect(() => registry.register(transformer)).toThrow('Transformer must have a name');
    });

    it('should throw error if transformer has no pattern', () => {
      const transformer = {
        name: 'test',
        transform: () => 'replaced',
      } as unknown as Transformer;

      expect(() => registry.register(transformer)).toThrow('Transformer test must have a pattern');
    });

    it('should override existing transformer with same name', () => {
      const transformer1: Transformer = {
        name: 'test',
        pattern: /test1/g,
        transform: () => 'replaced1',
      };

      const transformer2: Transformer = {
        name: 'test',
        pattern: /test2/g,
        transform: () => 'replaced2',
      };

      registry.register(transformer1);
      registry.register(transformer2);

      expect(registry.getCount()).toBe(1);
      expect(registry.get('test')?.pattern).toEqual(/test2/g);
    });

    it('should set default priority to 0 if not provided', () => {
      const transformer: Transformer = {
        name: 'test',
        pattern: /test/g,
        transform: () => 'replaced',
      };

      registry.register(transformer);
      expect(registry.get('test')?.priority).toBe(0);
    });

    it('should set default enabled to true if not provided', () => {
      const transformer: Transformer = {
        name: 'test',
        pattern: /test/g,
        transform: () => 'replaced',
      };

      registry.register(transformer);
      expect(registry.get('test')?.enabled).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should unregister a transformer by name', () => {
      const transformer: Transformer = {
        name: 'test',
        pattern: /test/g,
        transform: () => 'replaced',
      };

      registry.register(transformer);
      expect(registry.unregister('test')).toBe(true);
      expect(registry.getCount()).toBe(0);
    });

    it('should return false if transformer not found', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('getEnabled', () => {
    it('should return only enabled transformers', () => {
      registry.register({
        name: 'enabled',
        pattern: /test/g,
        transform: () => 'replaced',
        enabled: true,
      });

      registry.register({
        name: 'disabled',
        pattern: /test/g,
        transform: () => 'replaced',
        enabled: false,
      });

      const enabled = registry.getEnabled();
      expect(enabled.length).toBe(1);
      expect(enabled[0].name).toBe('enabled');
    });
  });

  describe('execute', () => {
    it('should execute transformer and transform content', () => {
      registry.register({
        name: 'uppercase',
        pattern: /hello/g,
        transform: (match) => match[0].toUpperCase(),
      });

      const context: TransformContext = {
        fullContent: 'hello world',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('hello world', context);
      expect(result.content).toBe('HELLO world');
    });

    it('should process multiple matches', () => {
      registry.register({
        name: 'replace-abc',
        pattern: /abc/g,
        transform: () => 'XYZ',
      });

      const context: TransformContext = {
        fullContent: 'abc abc abc',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('abc abc abc', context);
      expect(result.content).toBe('XYZ XYZ XYZ');
    });

    it('should preserve content when transformer returns null', () => {
      registry.register({
        name: 'conditional',
        pattern: /test/g,
        transform: (match) => {
          if (match[0] === 'TEST') return null;
          return match[0].toUpperCase();
        },
      });

      const context: TransformContext = {
        fullContent: 'test TEST',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('test TEST', context);
      expect(result.content).toBe('TEST TEST');
    });

    it('should process transformers in priority order (higher priority first)', () => {
      registry.register({
        name: 'low-priority',
        pattern: /hello/g,
        transform: () => 'LOW',
        priority: 1,
      });

      registry.register({
        name: 'high-priority',
        pattern: /hello/g,
        transform: () => 'HIGH',
        priority: 10,
      });

      const context: TransformContext = {
        fullContent: 'hello',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('hello', context);
      expect(result.content).toBe('HIGH');
    });

    it('should isolate transformer errors when errorIsolation is enabled', () => {
      registry.register({
        name: 'error-thrower',
        pattern: /error/g,
        transform: () => {
          throw new Error('Transformer error');
        },
      });

      const context: TransformContext = {
        fullContent: 'error',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('error', context);
      expect(result.content).toBe('error'); // Original content preserved
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].message).toBe('Transformer error');
    });

    it('should continue processing after transformer error when failFast is false', () => {
      registry.register({
        name: 'error-thrower',
        pattern: /error/g,
        transform: () => {
          throw new Error('Error 1');
        },
      });

      registry.register({
        name: 'fix-it',
        pattern: /error/g,
        transform: () => 'fixed',
      });

      const context: TransformContext = {
        fullContent: 'error',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('error', context);
      expect(result.content).toBe('fixed');
      expect(result.errors.length).toBe(1);
    });

    it('should stop processing after first error when failFast is true', () => {
      registry.register({
        name: 'error-thrower',
        pattern: /error/g,
        transform: () => {
          throw new Error('Error 1');
        },
      });

      registry.register({
        name: 'fix-it',
        pattern: /error/g,
        transform: () => 'fixed',
      });

      const context: TransformContext = {
        fullContent: 'error',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('error', context, { failFast: true });
      expect(result.content).toBe('error'); // Original content preserved, second transformer not run
      expect(result.errors.length).toBe(1);
    });

    it('should not isolate errors when errorIsolation is disabled', () => {
      registry.setErrorIsolation(false);

      registry.register({
        name: 'error-thrower',
        pattern: /error/g,
        transform: () => {
          throw new Error('Transformer error');
        },
      });

      const context: TransformContext = {
        fullContent: 'error',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      expect(() => registry.execute('error', context)).toThrow('Transformer error');
    });

    it('should return empty results for content with no matches', () => {
      registry.register({
        name: 'test',
        pattern: /xyz/g,
        transform: () => 'ABC',
      });

      const context: TransformContext = {
        fullContent: 'hello world',
        filePath: '/test.md',
        sourceRoot: '/test',
      };

      const result = registry.execute('hello world', context);
      expect(result.content).toBe('hello world');
      expect(result.results.length).toBe(0);
    });
  });

  describe('built-in transformer management', () => {
    it('should disable and enable built-in transformers', () => {
      registry.disableBuiltIn('wikilink');
      expect(registry.isBuiltInDisabled('wikilink')).toBe(true);

      registry.enableBuiltIn('wikilink');
      expect(registry.isBuiltInDisabled('wikilink')).toBe(false);
    });

    it('should configure built-in transformers', () => {
      registry.configureBuiltIn('wikilink', { enabled: false });
      expect(registry.isBuiltInDisabled('wikilink')).toBe(true);

      const config = registry.getBuiltInConfig('wikilink');
      expect(config?.enabled).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all transformers', () => {
      registry.register({
        name: 'test',
        pattern: /test/g,
        transform: () => 'replaced',
      });

      registry.clearAll();
      expect(registry.getCount()).toBe(0);
    });
  });
});
