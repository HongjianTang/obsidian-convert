import { PluginErrorHandler, ErrorSeverity, PluginErrorInfo } from '../../../src/plugin/PluginErrorHandler';
import type { ErrorContext } from '../../../src/plugin/types';

describe('PluginErrorHandler', () => {
  let errorHandler: PluginErrorHandler;

  beforeEach(() => {
    errorHandler = new PluginErrorHandler();
  });

  // Helper to create a proper PluginErrorInfo
  const createPluginError = (
    pluginId: string,
    message: string = 'Test error',
    severity: ErrorSeverity = ErrorSeverity.ERROR
  ): PluginErrorInfo => ({
    code: 'TEST_ERROR',
    message,
    severity,
    pluginId,
    phase: 'transform',
    recoverable: true,
  });

  describe('handleError', () => {
    it('should return skip-file action for normal error', () => {
      const error = new Error('Test error');
      const context: ErrorContext = { phase: 'transform' };

      const action = errorHandler.handleError(error, context);

      // Normal errors have severity ERROR, which results in 'skip-file' action
      expect(action.action).toBe('skip-file');
      expect(action.pluginId).toBe('unknown');
    });

    it('should log the error', () => {
      const error = new Error('Test error');
      const context: ErrorContext = { phase: 'transform' };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      errorHandler.handleError(error, context);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should increment error count for plugin', () => {
      const context: ErrorContext = { phase: 'transform' };

      const error1 = createPluginError('test-plugin', 'Error 1');
      const error2 = createPluginError('test-plugin', 'Error 2');

      errorHandler.handleError(error1, context);
      errorHandler.handleError(error2, context);

      const stats = errorHandler.getErrorStats();
      expect(stats.errorsByPlugin.get('test-plugin')).toBe(2);
    });

    it('should set critical severity after threshold exceeded', () => {
      const context: ErrorContext = { phase: 'transform' };

      // Default threshold is 10
      for (let i = 0; i < 10; i++) {
        const error = createPluginError('test-plugin', `Error ${i}`);
        errorHandler.handleError(error, context);
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.criticalPlugins).not.toContain('test-plugin');

      // 11th error should trigger critical
      const error11 = createPluginError('test-plugin', 'Error 11');
      errorHandler.handleError(error11, context);

      const stats2 = errorHandler.getErrorStats();
      expect(stats2.criticalPlugins).toContain('test-plugin');
    });

    it('should handle PluginErrorInfo format directly', () => {
      const errorInfo = createPluginError('test-plugin', 'Test error message', ErrorSeverity.ERROR);
      const context: ErrorContext = { phase: 'transform' };

      const action = errorHandler.handleError(errorInfo, context);

      expect(action.action).toBe('skip-file');
      expect(action.pluginId).toBe('test-plugin');
    });
  });

  describe('disablePlugin/enablePlugin', () => {
    it('should disable a plugin manually', () => {
      errorHandler.disablePlugin('test-plugin');

      expect(errorHandler.isPluginDisabled('test-plugin')).toBe(true);
    });

    it('should enable a disabled plugin', () => {
      errorHandler.disablePlugin('test-plugin');
      errorHandler.enablePlugin('test-plugin');

      expect(errorHandler.isPluginDisabled('test-plugin')).toBe(false);
    });

    it('should reset error count when enabling plugin', () => {
      const context: ErrorContext = { phase: 'transform' };

      const error = createPluginError('test-plugin', 'Test error');
      errorHandler.handleError(error, context);

      errorHandler.disablePlugin('test-plugin');
      errorHandler.enablePlugin('test-plugin');

      const stats = errorHandler.getErrorStats();
      expect(stats.errorsByPlugin.get('test-plugin')).toBeUndefined();
    });
  });

  describe('getErrorStats', () => {
    it('should return correct statistics', () => {
      const error = new Error('Test error');
      const context: ErrorContext = { phase: 'transform' };

      errorHandler.handleError(error, context);

      const error1 = createPluginError('plugin-1', 'Error 1');
      const error2 = createPluginError('plugin-2', 'Error 2');

      errorHandler.handleError(error1, context);
      errorHandler.handleError(error2, context);

      const stats = errorHandler.getErrorStats();

      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByPlugin.get('unknown')).toBe(1);
      expect(stats.errorsByPlugin.get('plugin-1')).toBe(1);
      expect(stats.errorsByPlugin.get('plugin-2')).toBe(1);
    });

    it('should return recent errors', () => {
      const error = new Error('Test error');
      const context: ErrorContext = { phase: 'transform' };

      for (let i = 0; i < 15; i++) {
        errorHandler.handleError(error, context);
      }

      const stats = errorHandler.getErrorStats();
      expect(stats.recentErrors).toHaveLength(10);
    });
  });

  describe('resetPluginErrors', () => {
    it('should reset error count for specific plugin', () => {
      const context: ErrorContext = { phase: 'transform' };

      const error1 = createPluginError('test-plugin', 'Error 1');
      const error2 = createPluginError('test-plugin', 'Error 2');

      errorHandler.handleError(error1, context);
      errorHandler.handleError(error2, context);

      errorHandler.resetPluginErrors('test-plugin');

      const stats = errorHandler.getErrorStats();
      expect(stats.errorsByPlugin.get('test-plugin')).toBeUndefined();
    });
  });

  describe('clearHistory', () => {
    it('should clear all error history', () => {
      const error = new Error('Test error');
      const context: ErrorContext = { phase: 'transform' };

      errorHandler.handleError(error, context);
      errorHandler.handleError(error, context);

      errorHandler.clearHistory();

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(0);
    });
  });

  describe('getErrorsForPlugin', () => {
    it('should return errors for specific plugin', () => {
      const error = new Error('Test error');
      const context: ErrorContext = { phase: 'transform' };

      errorHandler.handleError(error, context);

      const error1 = createPluginError('test-plugin', 'Error 1');
      const error2 = createPluginError('test-plugin', 'Error 2');

      errorHandler.handleError(error1, context);
      errorHandler.handleError(error2, context);

      const errors = errorHandler.getErrorsForPlugin('test-plugin');
      expect(errors).toHaveLength(2);
    });
  });

  describe('getErrorsBySeverity', () => {
    it('should return errors filtered by severity', () => {
      const error = new Error('Test error');
      const context: ErrorContext = { phase: 'transform' };

      errorHandler.handleError(error, context);

      const criticalError = createPluginError('critical-plugin', 'Critical error', ErrorSeverity.CRITICAL);
      errorHandler.handleError(criticalError, context);

      const criticalErrors = errorHandler.getErrorsBySeverity(ErrorSeverity.CRITICAL);
      expect(criticalErrors).toHaveLength(1);
      expect(criticalErrors[0].pluginId).toBe('critical-plugin');
    });
  });

  describe('hasExceededThreshold', () => {
    it('should return false when under threshold', () => {
      const context: ErrorContext = { phase: 'transform' };

      for (let i = 0; i < 5; i++) {
        const error = createPluginError('test-plugin', `Error ${i}`);
        errorHandler.handleError(error, context);
      }

      expect(errorHandler.hasExceededThreshold('test-plugin')).toBe(false);
    });

    it('should return true when over threshold', () => {
      const context: ErrorContext = { phase: 'transform' };

      for (let i = 0; i < 11; i++) {
        const error = createPluginError('test-plugin', `Error ${i}`);
        errorHandler.handleError(error, context);
      }

      expect(errorHandler.hasExceededThreshold('test-plugin')).toBe(true);
    });
  });

  describe('setMaxErrorsPerPlugin', () => {
    it('should change the error threshold', () => {
      errorHandler.setMaxErrorsPerPlugin(5);

      const context: ErrorContext = { phase: 'transform' };

      for (let i = 0; i < 5; i++) {
        const error = createPluginError('test-plugin', `Error ${i}`);
        errorHandler.handleError(error, context);
      }

      expect(errorHandler.hasExceededThreshold('test-plugin')).toBe(false);

      const error6 = createPluginError('test-plugin', 'Error 6');
      errorHandler.handleError(error6, context);

      expect(errorHandler.hasExceededThreshold('test-plugin')).toBe(true);
    });
  });
});
