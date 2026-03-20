import {
  ErrorReporter,
  ErrorLevel,
  ErrorCategory,
  SourceLocation,
} from '../../../../src/domain/error';

describe('ErrorReporter', () => {
  describe('basic error handling', () => {
    it('should create an error reporter with default verbose false', () => {
      const reporter = new ErrorReporter();
      expect(reporter).toBeDefined();
    });

    it('should create an error reporter with verbose true', () => {
      const reporter = new ErrorReporter(true);
      expect(reporter).toBeDefined();
    });

    it('should add a generic error', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addError(
        'TEST_ERROR',
        'Test error message',
        ErrorCategory.UNKNOWN_ERROR
      );

      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.category).toBe(ErrorCategory.UNKNOWN_ERROR);
      expect(error.level).toBe(ErrorLevel.FATAL);
    });

    it('should add an error with custom level', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addError(
        'TEST_ERROR',
        'Warning message',
        ErrorCategory.UNKNOWN_ERROR,
        ErrorLevel.WARNING
      );

      expect(error.level).toBe(ErrorLevel.WARNING);
    });

    it('should track multiple errors', () => {
      const reporter = new ErrorReporter();
      reporter.addError('E1', 'Error 1', ErrorCategory.UNKNOWN_ERROR);
      reporter.addError('E2', 'Error 2', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.WARNING);
      reporter.addError('E3', 'Error 3', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.INFO);

      const errors = reporter.getErrors();
      expect(errors).toHaveLength(3);
    });

    it('should clear all errors', () => {
      const reporter = new ErrorReporter();
      reporter.addError('E1', 'Error 1', ErrorCategory.UNKNOWN_ERROR);
      reporter.clear();

      const errors = reporter.getErrors();
      expect(errors).toHaveLength(0);
    });

    it('should report fatal errors correctly', () => {
      const reporter = new ErrorReporter();
      reporter.addError('FATAL', 'Fatal error', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.FATAL);

      expect(reporter.hasFatalErrors()).toBe(true);
    });

    it('should not report fatal errors when only warnings', () => {
      const reporter = new ErrorReporter();
      reporter.addError('WARN', 'Warning', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.WARNING);

      expect(reporter.hasFatalErrors()).toBe(false);
    });
  });

  describe('YAML error handling', () => {
    it('should add YAML parse error with location', () => {
      const reporter = new ErrorReporter();
      const yamlContent = `name: test
  invalid: yaml`;

      const error = new Error('YAML syntax error: unexpected token');
      const yamlError = reporter.addYamlError(error, '/path/to/config.yaml', yamlContent);

      expect(yamlError.code).toBe('YAML_PARSE_ERROR');
      expect(yamlError.category).toBe(ErrorCategory.PARSE_ERROR);
      expect(yamlError.level).toBe(ErrorLevel.FATAL);
    });

    it('should extract context from YAML content', () => {
      const reporter = new ErrorReporter();
      const yamlContent = `name: test
version: 1.0
  invalid: yaml
end: value`;

      const location: SourceLocation = { line: 3, column: 3 };
      const context = reporter.extractContext(yamlContent, location, 2);

      expect(context).toBeDefined();
      expect(context?.line).toBe('  invalid: yaml');
      expect(context?.before).toHaveLength(2);
      expect(context?.after).toHaveLength(1);
    });
  });

  describe('link error handling', () => {
    it('should add link error with source location', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addLinkError(
        'Broken link: [[Target]]',
        '/path/to/file.md',
        10,
        5,
        'Target'
      );

      expect(error.code).toBe('LINK_RESOLUTION_ERROR');
      expect(error.category).toBe(ErrorCategory.LINK_ERROR);
      expect(error.level).toBe(ErrorLevel.WARNING);
      expect(error.location?.file).toBe('/path/to/file.md');
      expect(error.location?.line).toBe(10);
      expect(error.location?.column).toBe(5);
    });

    it('should provide suggestions for link errors', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addLinkError(
        'Broken link',
        '/path/to/file.md',
        10,
        5,
        'Target'
      );

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('config error handling', () => {
    it('should add config error', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addConfigError(
        'Missing required field',
        'sourceFolders',
        '/path/to/config.yaml'
      );

      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.category).toBe(ErrorCategory.CONFIG_ERROR);
      expect(error.level).toBe(ErrorLevel.FATAL);
    });

    it('should include field in config error suggestions', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addConfigError(
        'Invalid field',
        'outputDir'
      );

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions.some(s => s.description.includes('outputDir'))).toBe(true);
    });
  });

  describe('transformer error handling', () => {
    it('should add transformer error', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addTransformerError(
        'Pattern not found',
        '/path/to/file.md',
        5,
        10,
        'test.*pattern'
      );

      expect(error.code).toBe('TRANSFORM_ERROR');
      expect(error.category).toBe(ErrorCategory.TRANSFORM_ERROR);
      expect(error.level).toBe(ErrorLevel.WARNING);
    });
  });

  describe('I/O error handling', () => {
    it('should add I/O error', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addIOError(
        'File not found',
        '/path/to/file.md',
        'read'
      );

      expect(error.code).toBe('IO_ERROR');
      expect(error.category).toBe(ErrorCategory.IO_ERROR);
      expect(error.level).toBe(ErrorLevel.FATAL);
    });
  });

  describe('error report generation', () => {
    it('should generate correct report stats', () => {
      const reporter = new ErrorReporter();
      reporter.addError('E1', 'Fatal 1', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.FATAL);
      reporter.addError('E2', 'Fatal 2', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.FATAL);
      reporter.addError('E3', 'Warning 1', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.WARNING);
      reporter.addError('E4', 'Info 1', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.INFO);

      const report = reporter.getReport();

      expect(report.stats.total).toBe(4);
      expect(report.stats.fatalCount).toBe(2);
      expect(report.stats.warningCount).toBe(1);
      expect(report.stats.infoCount).toBe(1);
    });

    it('should categorize errors by level', () => {
      const reporter = new ErrorReporter();
      reporter.addError('F1', 'Fatal', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.FATAL);
      reporter.addError('W1', 'Warning', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.WARNING);
      reporter.addError('I1', 'Info', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.INFO);

      const report = reporter.getReport();

      expect(report.byLevel.fatal).toHaveLength(1);
      expect(report.byLevel.warning).toHaveLength(1);
      expect(report.byLevel.info).toHaveLength(1);
    });
  });

  describe('error formatting', () => {
    it('should format error for human reading', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addError(
        'TEST_ERROR',
        'Test error message',
        ErrorCategory.UNKNOWN_ERROR,
        ErrorLevel.FATAL
      );

      const formatted = reporter.formatError(error, { showContext: false });
      expect(formatted).toContain('[FATAL]');
      expect(formatted).toContain('[TEST_ERROR]');
      expect(formatted).toContain('Test error message');
    });

    it('should format error with location', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addError(
        'TEST_ERROR',
        'Test error',
        ErrorCategory.UNKNOWN_ERROR,
        ErrorLevel.FATAL,
        { location: { file: '/path/to/file.md', line: 10, column: 5 } }
      );

      const formatted = reporter.formatError(error, { showContext: false });
      expect(formatted).toContain('/path/to/file.md:10:5');
    });

    it('should format error with context', () => {
      const reporter = new ErrorReporter();
      const content = `line 1
line 2
line 3
line 4
line 5`;

      const error = reporter.addError(
        'TEST_ERROR',
        'Error on line 3',
        ErrorCategory.UNKNOWN_ERROR,
        ErrorLevel.FATAL,
        {
          location: { file: '/path/file.md', line: 3, column: 1 },
          context: reporter.extractContext(content, { line: 3, column: 1 }, 1)
        }
      );

      const formatted = reporter.formatError(error, { showContext: true, contextSize: 1 });
      expect(formatted).toContain('line 2');
      expect(formatted).toContain('line 3');
      expect(formatted).toContain('line 4');
    });

    it('should format error in IDE format', () => {
      const reporter = new ErrorReporter();
      const error = reporter.addError(
        'TEST_ERROR',
        'Test error',
        ErrorCategory.UNKNOWN_ERROR,
        ErrorLevel.WARNING,
        { location: { file: '/path/to/file.md', line: 10, column: 5 } }
      );

      const formatted = reporter.formatError(error, { ideFormat: true });
      expect(formatted).toContain('/path/to/file.md(10,5)');
      expect(formatted).toContain('warning');
    });

    it('should include stack trace in verbose mode', () => {
      const reporter = new ErrorReporter(true);
      const originalError = new Error('Original error');
      const error = reporter.addError(
        'TEST_ERROR',
        'Test error',
        ErrorCategory.UNKNOWN_ERROR,
        ErrorLevel.FATAL,
        { originalError }
      );

      const formatted = reporter.formatError(error, { verbose: true });
      expect(formatted).toContain('Stack trace:');
    });
  });

  describe('context extraction', () => {
    it('should extract context with default size', () => {
      const reporter = new ErrorReporter();
      const content = 'line1\nline2\nline3\nline4\nline5';

      const context = reporter.extractContext(content, { line: 3, column: 1 });

      expect(context?.line).toBe('line3');
      expect(context?.before).toHaveLength(2);
      expect(context?.after).toHaveLength(2);
      expect(context?.contextSize).toBe(2);
    });

    it('should extract context with custom size', () => {
      const reporter = new ErrorReporter();
      const content = 'line1\nline2\nline3\nline4\nline5\nline6\nline7';

      const context = reporter.extractContext(content, { line: 4, column: 1 }, 1);

      expect(context?.before).toHaveLength(1);
      expect(context?.after).toHaveLength(1);
      expect(context?.contextSize).toBe(1);
    });

    it('should handle start of file', () => {
      const reporter = new ErrorReporter();
      const content = 'line1\nline2\nline3';

      const context = reporter.extractContext(content, { line: 1, column: 1 });

      expect(context?.before).toHaveLength(0);
      expect(context?.line).toBe('line1');
    });

    it('should handle end of file', () => {
      const reporter = new ErrorReporter();
      const content = 'line1\nline2\nline3';

      const context = reporter.extractContext(content, { line: 3, column: 1 });

      expect(context?.after).toHaveLength(0);
      expect(context?.line).toBe('line3');
    });

    it('should return undefined for invalid line', () => {
      const reporter = new ErrorReporter();
      const content = 'line1\nline2';

      const context = reporter.extractContext(content, { line: 10, column: 1 });

      expect(context).toBeUndefined();
    });
  });

  describe('setVerbose', () => {
    it('should enable verbose mode', () => {
      const reporter = new ErrorReporter(false);
      reporter.setVerbose(true);

      const originalError = new Error('Test');
      reporter.addError('E1', 'Error', ErrorCategory.UNKNOWN_ERROR, ErrorLevel.FATAL, {
        originalError
      });

      const formatted = reporter.formatError(reporter.getErrors()[0], { verbose: true });
      expect(formatted).toContain('Stack trace:');
    });
  });
});