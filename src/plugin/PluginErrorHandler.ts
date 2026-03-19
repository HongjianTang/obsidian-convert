import type { PluginError, ErrorContext } from './types';

/**
 * Error severity levels for plugin errors
 */
export enum ErrorSeverity {
  /** Warning - does not affect main flow */
  WARNING = 'warning',
  /** Error - skip current file */
  ERROR = 'error',
  /** Critical - disable plugin */
  CRITICAL = 'critical',
}

/**
 * Information about a plugin error
 */
export interface PluginErrorInfo {
  /** Error code for categorization */
  code: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: ErrorSeverity;
  /** Plugin that caused the error */
  pluginId: string;
  /** Lifecycle phase where error occurred */
  phase: 'load' | 'init' | 'convert' | 'transform' | 'teardown';
  /** Underlying error if any */
  originalError?: Error;
  /** Whether the error is recoverable */
  recoverable: boolean;
}

/**
 * Action to take based on error severity
 */
export interface ErrorAction {
  /** Action type */
  action: 'continue' | 'skip-file' | 'disable-plugin';
  /** Plugin ID */
  pluginId: string;
}

/**
 * Handles plugin errors with isolation and recovery
 */
export class PluginErrorHandler {
  private errorLog: PluginErrorInfo[] = [];
  private pluginErrorCounts: Map<string, number> = new Map();
  private maxErrorsPerPlugin: number = 10;
  private disabledPlugins: Set<string> = new Set();

  /**
   * Handle a plugin error and determine appropriate action
   */
  handleError(error: Error | PluginErrorInfo, context: ErrorContext): ErrorAction {
    const errorInfo = this.normalizeError(error, context);
    this.errorLog.push(errorInfo);

    // Increment error count for plugin
    const count = (this.pluginErrorCounts.get(errorInfo.pluginId) || 0) + 1;
    this.pluginErrorCounts.set(errorInfo.pluginId, count);

    // Check if threshold exceeded
    if (count > this.maxErrorsPerPlugin) {
      errorInfo.severity = ErrorSeverity.CRITICAL;
      errorInfo.recoverable = false;
      this.disabledPlugins.add(errorInfo.pluginId);
    }

    // Check if plugin was manually disabled
    if (this.disabledPlugins.has(errorInfo.pluginId)) {
      errorInfo.severity = ErrorSeverity.CRITICAL;
    }

    // Log the error
    this.logError(errorInfo);

    // Determine action based on severity
    switch (errorInfo.severity) {
      case ErrorSeverity.WARNING:
        return { action: 'continue', pluginId: errorInfo.pluginId };

      case ErrorSeverity.ERROR:
        return { action: 'skip-file', pluginId: errorInfo.pluginId };

      case ErrorSeverity.CRITICAL:
        return { action: 'disable-plugin', pluginId: errorInfo.pluginId };

      default:
        return { action: 'continue', pluginId: errorInfo.pluginId };
    }
  }

  /**
   * Convert error to standard PluginErrorInfo format
   */
  private normalizeError(
    error: Error | PluginErrorInfo,
    context: ErrorContext
  ): PluginErrorInfo {
    if ('severity' in error) {
      // Already in PluginErrorInfo format
      return {
        ...error,
        phase: context.phase,
      };
    }

    // Convert from plain Error
    return {
      code: this.classifyError(error),
      message: error.message,
      severity: ErrorSeverity.ERROR,
      pluginId: 'unknown',
      phase: context.phase,
      originalError: error,
      recoverable: true,
    };
  }

  /**
   * Classify error based on message patterns
   */
  private classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    if (message.includes('timeout')) return 'TIMEOUT_ERROR';
    if (message.includes('memory')) return 'MEMORY_ERROR';
    if (message.includes('permission')) return 'PERMISSION_ERROR';
    if (message.includes('not found')) return 'NOT_FOUND_ERROR';
    if (message.includes('sandbox')) return 'SANDBOX_ERROR';
    if (message.includes('transform')) return 'TRANSFORM_ERROR';
    return 'PLUGIN_ERROR';
  }

  /**
   * Log error with appropriate severity
   */
  private logError(errorInfo: PluginErrorInfo): void {
    const prefix = `[Plugin Error] ${errorInfo.pluginId}:`;
    const level = errorInfo.severity === ErrorSeverity.CRITICAL ? 'error' : 'warn';

    console[level](`${prefix} [${errorInfo.code}] ${errorInfo.message}`);
    if (errorInfo.originalError?.stack) {
      console[level](`${prefix} Stack: ${errorInfo.originalError.stack}`);
    }
  }

  /**
   * Manually disable a plugin
   */
  disablePlugin(pluginId: string): void {
    this.disabledPlugins.add(pluginId);
  }

  /**
   * Re-enable a previously disabled plugin
   */
  enablePlugin(pluginId: string): void {
    this.disabledPlugins.delete(pluginId);
    this.resetPluginErrors(pluginId);
  }

  /**
   * Check if a plugin is disabled
   */
  isPluginDisabled(pluginId: string): boolean {
    return this.disabledPlugins.has(pluginId);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByPlugin: Map<string, number>;
    criticalPlugins: string[];
    recentErrors: PluginErrorInfo[];
  } {
    return {
      totalErrors: this.errorLog.length,
      errorsByPlugin: new Map(this.pluginErrorCounts),
      criticalPlugins: Array.from(this.disabledPlugins),
      recentErrors: this.errorLog.slice(-10),
    };
  }

  /**
   * Reset error count for a specific plugin
   */
  resetPluginErrors(pluginId: string): void {
    this.pluginErrorCounts.delete(pluginId);
  }

  /**
   * Clear all error history
   */
  clearHistory(): void {
    this.errorLog = [];
    this.pluginErrorCounts.clear();
  }

  /**
   * Get errors filtered by plugin
   */
  getErrorsForPlugin(pluginId: string): PluginErrorInfo[] {
    return this.errorLog.filter(e => e.pluginId === pluginId);
  }

  /**
   * Get errors filtered by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): PluginErrorInfo[] {
    return this.errorLog.filter(e => e.severity === severity);
  }

  /**
   * Check if a plugin has exceeded error threshold
   */
  hasExceededThreshold(pluginId: string): boolean {
    return (this.pluginErrorCounts.get(pluginId) || 0) > this.maxErrorsPerPlugin;
  }

  /**
   * Set maximum errors allowed per plugin
   */
  setMaxErrorsPerPlugin(max: number): void {
    this.maxErrorsPerPlugin = max;
  }
}
