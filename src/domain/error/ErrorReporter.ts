import { parse as parseYaml, YAMLParseError } from 'yaml';
import {
  ErrorLevel,
  ErrorCategory,
  SourceLocation,
  ContextPreview,
  FixSuggestion,
  EnhancedError,
  ErrorFormatterOptions,
  ErrorReport,
} from './ErrorTypes';

/**
 * Default fix suggestions for common errors
 */
const DEFAULT_SUGGESTIONS: Record<ErrorCategory, FixSuggestion[]> = {
  [ErrorCategory.PARSE_ERROR]: [
    {
      description: 'Check YAML syntax - ensure proper indentation and valid key-value pairs',
      docsUrl: 'https://yaml.org/spec/1.2.2/',
    },
  ],
  [ErrorCategory.CONFIG_ERROR]: [
    {
      description: 'Verify all required fields are present in configuration',
    },
  ],
  [ErrorCategory.LINK_ERROR]: [
    {
      description: 'Ensure the linked file exists in your vault',
    },
  ],
  [ErrorCategory.TRANSFORM_ERROR]: [
    {
      description: 'Check transformer pattern and replacement syntax',
    },
  ],
  [ErrorCategory.IO_ERROR]: [
    {
      description: 'Verify file permissions and path existence',
    },
  ],
  [ErrorCategory.PLUGIN_ERROR]: [
    {
      description: 'Check plugin manifest and configuration',
    },
  ],
  [ErrorCategory.UNKNOWN_ERROR]: [],
};

/**
 * Collects and manages enhanced errors with source location tracking
 */
export class ErrorReporter {
  private errors: EnhancedError[] = [];
  private verbose: boolean = false;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Set verbose mode for stack traces
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Add a generic error
   */
  addError(
    code: string,
    message: string,
    category: ErrorCategory,
    level: ErrorLevel = ErrorLevel.FATAL,
    options: Partial<EnhancedError> = {}
  ): EnhancedError {
    const error: EnhancedError = {
      code,
      message,
      category,
      level,
      location: options.location,
      context: options.context,
      originalError: options.originalError,
      stack: this.verbose ? options.originalError?.stack : undefined,
      suggestions: options.suggestions || DEFAULT_SUGGESTIONS[category] || [],
      metadata: options.metadata,
    };

    this.errors.push(error);
    return error;
  }

  /**
   * Add a YAML parsing error with source location
   */
  addYamlError(
    yamlError: YAMLParseError | Error,
    filePath?: string,
    yamlContent?: string
  ): EnhancedError {
    const location = this.extractYamlLocation(yamlError, yamlContent);
    if (filePath && location) {
      location.file = filePath;
    }

    const context = yamlContent ? this.extractContext(yamlContent, location) : undefined;

    const suggestions: FixSuggestion[] = [
      {
        description: 'Check YAML syntax - ensure proper indentation and valid key-value pairs',
        docsUrl: 'https://yaml.org/spec/1.2.2/',
      },
    ];

    if (yamlError.message.includes('duplicate key')) {
      suggestions.push({
        description: 'Remove duplicate key - YAML does not allow duplicate keys',
        code: '# Remove the duplicate key entry',
      });
    }

    return this.addError(
      'YAML_PARSE_ERROR',
      yamlError.message,
      ErrorCategory.PARSE_ERROR,
      ErrorLevel.FATAL,
      {
        location,
        context,
        originalError: yamlError instanceof Error ? yamlError : undefined,
        suggestions,
      }
    );
  }

  /**
   * Add a link resolution error with source location
   */
  addLinkError(
    message: string,
    sourceFile: string,
    line: number,
    column: number,
    linkTarget?: string
  ): EnhancedError {
    const location: SourceLocation = {
      file: sourceFile,
      line,
      column,
    };

    const suggestions: FixSuggestion[] = [
      {
        description: 'Ensure the linked file exists in your vault',
      },
    ];

    if (linkTarget) {
      suggestions.push({
        description: `Verify the link target "${linkTarget}" exists`,
      });
    }

    return this.addError(
      'LINK_RESOLUTION_ERROR',
      message,
      ErrorCategory.LINK_ERROR,
      ErrorLevel.WARNING,
      {
        location,
        suggestions,
      }
    );
  }

  /**
   * Add a configuration error
   */
  addConfigError(
    message: string,
    field?: string,
    configPath?: string,
    suggestions: FixSuggestion[] = []
  ): EnhancedError {
    const location: SourceLocation | undefined = configPath
      ? { file: configPath, line: 1, column: 1 }
      : undefined;

    const defaultSuggestions: FixSuggestion[] = [
      {
        description: 'Verify all required fields are present in configuration',
      },
    ];

    if (field) {
      defaultSuggestions.unshift({
        description: `Check the "${field}" field in your configuration`,
      });
    }

    return this.addError(
      'CONFIG_ERROR',
      message,
      ErrorCategory.CONFIG_ERROR,
      ErrorLevel.FATAL,
      {
        location,
        suggestions: suggestions.length > 0 ? suggestions : defaultSuggestions,
      }
    );
  }

  /**
   * Add a transformer error
   */
  addTransformerError(
    message: string,
    sourceFile?: string,
    line?: number,
    column?: number,
    pattern?: string
  ): EnhancedError {
    const location: SourceLocation | undefined = sourceFile
      ? { file: sourceFile, line: line || 1, column: column || 1 }
      : undefined;

    const suggestions: FixSuggestion[] = [
      {
        description: 'Check transformer pattern and replacement syntax',
      },
    ];

    if (pattern) {
      suggestions.unshift({
        description: `Verify regex pattern: ${pattern}`,
      });
    }

    return this.addError(
      'TRANSFORM_ERROR',
      message,
      ErrorCategory.TRANSFORM_ERROR,
      ErrorLevel.WARNING,
      { location, suggestions }
    );
  }

  /**
   * Add an I/O error
   */
  addIOError(
    message: string,
    filePath?: string,
    operation: 'read' | 'write' = 'read'
  ): EnhancedError {
    const location: SourceLocation | undefined = filePath
      ? { file: filePath, line: 1, column: 1 }
      : undefined;

    const suggestions: FixSuggestion[] = [
      {
        description: `Verify file ${operation} permissions and path existence`,
      },
    ];

    return this.addError(
      'IO_ERROR',
      message,
      ErrorCategory.IO_ERROR,
      ErrorLevel.FATAL,
      { location, suggestions }
    );
  }

  /**
   * Extract YAML error location
   */
  private extractYamlLocation(
    error: YAMLParseError | Error,
    yamlContent?: string
  ): SourceLocation | undefined {
    if (error instanceof YAMLParseError && yamlContent) {
      const linePos = error.linePos;
      if (linePos) {
        return {
          line: linePos[0]?.line || 1,
          column: linePos[0]?.col || 1,
        };
      }
    }

    // Fallback: try to extract from error message
    const match = error.message.match(/at line (\d+), column (\d+)/i);
    if (match) {
      return {
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
      };
    }

    return { line: 1, column: 1 };
  }

  /**
   * Extract context preview around a location
   */
  extractContext(
    content: string,
    location?: SourceLocation,
    contextSize: number = 2
  ): ContextPreview | undefined {
    if (!location) return undefined;

    const lines = content.split(/\r?\n/);
    const targetLine = location.line - 1; // Convert to 0-indexed

    if (targetLine < 0 || targetLine >= lines.length) {
      return undefined;
    }

    const before: string[] = [];
    const after: string[] = [];

    // Get lines before
    for (let i = contextSize; i > 0; i--) {
      const lineIdx = targetLine - i;
      if (lineIdx >= 0) {
        before.push(lines[lineIdx]);
      }
    }

    // Get lines after
    for (let i = 1; i <= contextSize; i++) {
      const lineIdx = targetLine + i;
      if (lineIdx < lines.length) {
        after.push(lines[lineIdx]);
      }
    }

    return {
      before,
      line: lines[targetLine],
      after,
      contextSize,
    };
  }

  /**
   * Format a single error for display
   */
  formatError(error: EnhancedError, options: ErrorFormatterOptions = {}): string {
    const opts: ErrorFormatterOptions = {
      verbose: false,
      showContext: true,
      contextSize: 2,
      colorize: false,
      ideFormat: false,
      ...options,
    };

    const lines: string[] = [];

    if (opts.ideFormat) {
      lines.push(this.formatIdeError(error));
    } else {
      lines.push(this.formatHumanError(error, opts));
    }

    return lines.join('\n');
  }

  /**
   * Format error in IDE-compatible format (VS Code problem matcher)
   */
  private formatIdeError(error: EnhancedError): string {
    const location = error.location;
    const file = location?.file || '';
    const line = location?.line || 1;
    const column = location?.column || 1;

    const severity = this.ideSeverity(error.level);

    if (file) {
      return `${file}(${line},${column}): ${severity} ${error.code}: ${error.message}`;
    }

    return `${severity} ${error.code}: ${error.message}`;
  }

  /**
   * Format error in human-readable format
   */
  private formatHumanError(error: EnhancedError, opts: ErrorFormatterOptions): string {
    const lines: string[] = [];

    // Header
    const levelStr = `[${error.level.toUpperCase()}]`;
    const codeStr = `[${error.code}]`;
    lines.push(`${levelStr} ${codeStr} ${error.message}`);

    // Location
    if (error.location) {
      const loc = error.location;
      if (loc.file) {
        lines.push(`  --> ${loc.file}:${loc.line}:${loc.column}`);
      } else {
        lines.push(`  --> line ${loc.line}, column ${loc.column}`);
      }
    }

    // Context
    if (opts.showContext !== false && error.context) {
      lines.push('');
      const ctx = error.context;

      for (const beforeLine of ctx.before) {
        lines.push(`  | ${beforeLine}`);
      }

      // Highlight the error line
      lines.push(`  | ${ctx.line}`);
      if (error.location) {
        const pointer = ' '.repeat(3 + (error.location.column - 1)) + '^';
        lines.push(`${pointer} ${error.message}`);
      }

      for (const afterLine of ctx.after) {
        lines.push(`  | ${afterLine}`);
      }
    }

    // Stack trace in verbose mode
    if (opts.verbose && error.stack) {
      lines.push('');
      lines.push('Stack trace:');
      lines.push(error.stack);
    }

    // Suggestions
    if (error.suggestions.length > 0) {
      lines.push('');
      lines.push('Suggestions:');
      for (const suggestion of error.suggestions) {
        lines.push(`  - ${suggestion.description}`);
        if (suggestion.code) {
          lines.push(`    ${suggestion.code}`);
        }
        if (suggestion.docsUrl) {
          lines.push(`    See: ${suggestion.docsUrl}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Convert error level to IDE severity
   */
  private ideSeverity(level: ErrorLevel): string {
    switch (level) {
      case ErrorLevel.FATAL:
        return 'error';
      case ErrorLevel.WARNING:
        return 'warning';
      case ErrorLevel.INFO:
        return 'info';
      default:
        return 'error';
    }
  }

  /**
   * Format all errors as a report
   */
  formatReport(options: ErrorFormatterOptions = {}): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('Error Report');
    lines.push('='.repeat(60));
    lines.push('');

    const report = this.getReport();

    lines.push(`Total: ${report.stats.total} error(s)`);
    lines.push(`  Fatal: ${report.stats.fatalCount}`);
    lines.push(`  Warning: ${report.stats.warningCount}`);
    lines.push(`  Info: ${report.stats.infoCount}`);
    lines.push('');

    if (report.byLevel.fatal.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('FATAL ERRORS');
      lines.push('-'.repeat(60));
      for (const error of report.byLevel.fatal) {
        lines.push(this.formatError(error, options));
        lines.push('');
      }
    }

    if (report.byLevel.warning.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('WARNINGS');
      lines.push('-'.repeat(60));
      for (const error of report.byLevel.warning) {
        lines.push(this.formatError(error, options));
        lines.push('');
      }
    }

    if (report.byLevel.info.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('INFO');
      lines.push('-'.repeat(60));
      for (const error of report.byLevel.info) {
        lines.push(this.formatError(error, options));
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Get a summary report of all errors
   */
  getReport(): ErrorReport {
    const byLevel = {
      fatal: this.errors.filter((e) => e.level === ErrorLevel.FATAL),
      warning: this.errors.filter((e) => e.level === ErrorLevel.WARNING),
      info: this.errors.filter((e) => e.level === ErrorLevel.INFO),
    };

    return {
      errors: this.errors,
      byLevel,
      stats: {
        total: this.errors.length,
        fatalCount: byLevel.fatal.length,
        warningCount: byLevel.warning.length,
        infoCount: byLevel.info.length,
      },
    };
  }

  /**
   * Get all errors
   */
  getErrors(): EnhancedError[] {
    return [...this.errors];
  }

  /**
   * Clear all errors
   */
  clear(): void {
    this.errors = [];
  }

  /**
   * Check if there are fatal errors
   */
  hasFatalErrors(): boolean {
    return this.errors.some((e) => e.level === ErrorLevel.FATAL);
  }
}