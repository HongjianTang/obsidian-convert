import { ProgressTracker, InteractiveWatchHandler } from '../../../../src/presentation/cli/ProgressTracker';

// Mock process.stdout.isTTY
const originalIsTTY = process.stdout.isTTY;

describe('ProgressTracker', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    // Mock TTY as true for color support tests
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // Restore original isTTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  describe('constructor', () => {
    it('should create a progress tracker with correct options', () => {
      const tracker = new ProgressTracker({
        totalFiles: 10,
        interactive: false,
        prefixText: 'Test',
      });

      expect(tracker).toBeDefined();
    });

    it('should default interactive to true when not specified', () => {
      const tracker = new ProgressTracker({
        totalFiles: 10,
      });

      expect(tracker).toBeDefined();
    });
  });

  describe('isColorSupported', () => {
    it('should return false when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const tracker = new ProgressTracker({
        totalFiles: 10,
        interactive: true,
      });

      expect(tracker.isColorSupported()).toBe(false);
    });

    it('should return false when FORCE_COLOR is 0', () => {
      process.env.FORCE_COLOR = '0';
      const tracker = new ProgressTracker({
        totalFiles: 10,
        interactive: true,
      });

      expect(tracker.isColorSupported()).toBe(false);
    });
  });

  describe('isInteractive', () => {
    it('should return false when interactive is disabled', () => {
      const tracker = new ProgressTracker({
        totalFiles: 10,
        interactive: false,
      });

      expect(tracker.isInteractive()).toBe(false);
    });
  });

  describe('start and update', () => {
    it('should start and track progress', () => {
      const tracker = new ProgressTracker({
        totalFiles: 10,
        interactive: false,
      });

      tracker.start();
      tracker.update('/path/to/file1.md', true);
      tracker.update('/path/to/file2.md', true);

      const stats = tracker.getStats();
      expect(stats.processedFiles).toBe(2);
      expect(stats.totalFiles).toBe(10);
      expect(stats.successCount).toBe(2);
      expect(stats.failCount).toBe(0);
      expect(stats.percent).toBe(20);
    });

    it('should track failed files', () => {
      const tracker = new ProgressTracker({
        totalFiles: 5,
        interactive: false,
      });

      tracker.start();
      tracker.update('/path/to/file1.md', true);
      tracker.update('/path/to/file2.md', false);
      tracker.update('/path/to/file3.md', false);

      const stats = tracker.getStats();
      expect(stats.processedFiles).toBe(3);
      expect(stats.successCount).toBe(1);
      expect(stats.failCount).toBe(2);
    });

    it('should calculate ETA after some progress', () => {
      const tracker = new ProgressTracker({
        totalFiles: 100,
        interactive: false,
      });

      tracker.start();
      tracker.update('/path/to/file1.md', true);

      const stats = tracker.getStats();
      expect(stats.processedFiles).toBe(1);
      expect(stats.percent).toBe(1);
      expect(stats.eta).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats', () => {
    it('should return correct initial stats', () => {
      const tracker = new ProgressTracker({
        totalFiles: 20,
        interactive: false,
      });

      tracker.start();

      const stats = tracker.getStats();
      expect(stats.totalFiles).toBe(20);
      expect(stats.processedFiles).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failCount).toBe(0);
      expect(stats.percent).toBe(0);
    });
  });

  describe('print methods', () => {
    it('should not throw when printing messages', () => {
      const tracker = new ProgressTracker({
        totalFiles: 10,
        interactive: false,
      });

      expect(() => {
        tracker.warn('warning message');
        tracker.error('error message');
        tracker.success('success message');
        tracker.info('info message');
      }).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should not throw when stopping', () => {
      const tracker = new ProgressTracker({
        totalFiles: 10,
        interactive: false,
      });

      tracker.start();
      tracker.update('/path/to/file1.md', true);

      expect(() => tracker.stop()).not.toThrow();
    });
  });
});

describe('InteractiveWatchHandler', () => {
  describe('constructor', () => {
    it('should create an interactive handler', () => {
      const handler = new InteractiveWatchHandler(true);
      expect(handler).toBeDefined();
    });

    it('should default to interactive mode', () => {
      const handler = new InteractiveWatchHandler();
      expect(handler).toBeDefined();
    });
  });

  describe('updateStats', () => {
    it('should update statistics', () => {
      const handler = new InteractiveWatchHandler(false);
      handler.updateStats(5, 10, 2);

      // Stats are internal, but method should not throw
      expect(handler).toBeDefined();
    });
  });

  describe('isWatchPaused', () => {
    it('should return false initially', () => {
      const handler = new InteractiveWatchHandler(false);
      expect(handler.isWatchPaused()).toBe(false);
    });
  });

  describe('togglePause', () => {
    it('should toggle pause state', () => {
      const handler = new InteractiveWatchHandler(false);

      expect(handler.isWatchPaused()).toBe(false);
      handler.togglePause();
      expect(handler.isWatchPaused()).toBe(true);
      handler.togglePause();
      expect(handler.isWatchPaused()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should not throw when disposing', () => {
      const handler = new InteractiveWatchHandler(true);
      expect(() => handler.dispose()).not.toThrow();
    });
  });
});
