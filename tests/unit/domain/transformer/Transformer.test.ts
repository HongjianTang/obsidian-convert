import {
  isValidPattern,
  compilePattern,
} from '../../../../src/domain/transformer/Transformer';

describe('Transformer', () => {
  describe('isValidPattern', () => {
    it('should return true for valid regex patterns', () => {
      expect(isValidPattern('test')).toBe(true);
      expect(isValidPattern('\\d+')).toBe(true);
      expect(isValidPattern('[a-z]+')).toBe(true);
      expect(isValidPattern('^hello$')).toBe(true);
    });

    it('should return false for invalid regex patterns', () => {
      expect(isValidPattern('[invalid')).toBe(false);
      expect(isValidPattern('(unclosed')).toBe(false);
      expect(isValidPattern('*invalid')).toBe(false);
    });
  });

  describe('compilePattern', () => {
    it('should compile a pattern string to RegExp', () => {
      const pattern = compilePattern('test');
      expect(pattern).toEqual(/test/);
    });

    it('should compile pattern with flags', () => {
      const pattern = compilePattern('test', 'gi');
      expect(pattern).toEqual(/test/gi);
    });
  });
});
