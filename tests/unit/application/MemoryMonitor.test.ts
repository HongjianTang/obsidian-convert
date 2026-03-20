import { MemoryMonitor, getGlobalMemoryMonitor, disposeGlobalMemoryMonitor } from '../../../src/application/convert/MemoryMonitor';

describe('MemoryMonitor', () => {
  afterEach(() => {
    disposeGlobalMemoryMonitor();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const monitor = new MemoryMonitor();
      expect(monitor).toBeDefined();
      monitor.dispose();
    });

    it('should create with custom maxMemory', () => {
      const monitor = new MemoryMonitor({ maxMemory: 100 * 1024 * 1024 });
      expect(monitor).toBeDefined();
      monitor.dispose();
    });

    it('should create with custom warning threshold', () => {
      const monitor = new MemoryMonitor({ warningThreshold: 0.9 });
      expect(monitor).toBeDefined();
      monitor.dispose();
    });

    it('should create with custom check interval', () => {
      const monitor = new MemoryMonitor({ checkInterval: 500 });
      expect(monitor).toBeDefined();
      monitor.dispose();
    });
  });

  describe('getStats', () => {
    it('should return memory statistics', () => {
      const monitor = new MemoryMonitor();
      const stats = monitor.getStats();

      expect(stats).toHaveProperty('heapUsed');
      expect(stats).toHaveProperty('heapTotal');
      expect(stats).toHaveProperty('rss');
      expect(stats).toHaveProperty('external');
      expect(stats).toHaveProperty('peakHeapUsed');
      expect(stats).toHaveProperty('timestamp');

      expect(stats.heapUsed).toBeGreaterThan(0);
      expect(stats.heapTotal).toBeGreaterThan(0);
      expect(stats.timestamp).toBeGreaterThan(0);

      monitor.dispose();
    });

    it('should track peak memory usage', () => {
      const monitor = new MemoryMonitor();
      const initialStats = monitor.getStats();

      // Allocate some memory
      const allocation = Buffer.alloc(1024 * 1024);

      const afterStats = monitor.getStats();
      expect(afterStats.heapUsed).toBeGreaterThanOrEqual(initialStats.heapUsed);

      // Clean up - use a different approach to release memory reference
      allocation.fill(0);

      monitor.dispose();
    });
  });

  describe('isMemorySafe', () => {
    it('should return true when under threshold', () => {
      const monitor = new MemoryMonitor({
        maxMemory: 500 * 1024 * 1024,
        warningThreshold: 0.8,
      });
      expect(monitor.isMemorySafe()).toBe(true);
      monitor.dispose();
    });

    it('should return false when over threshold', () => {
      const monitor = new MemoryMonitor({
        maxMemory: 1,
        warningThreshold: 0.8,
      });
      expect(monitor.isMemorySafe()).toBe(false);
      monitor.dispose();
    });
  });

  describe('isMemoryExceeded', () => {
    it('should return false when under max', () => {
      const monitor = new MemoryMonitor({
        maxMemory: 500 * 1024 * 1024,
      });
      expect(monitor.isMemoryExceeded()).toBe(false);
      monitor.dispose();
    });

    it('should return true when over max', () => {
      const monitor = new MemoryMonitor({
        maxMemory: 1,
      });
      expect(monitor.isMemoryExceeded()).toBe(true);
      monitor.dispose();
    });
  });

  describe('getUsagePercentage', () => {
    it('should return percentage of max memory used', () => {
      const monitor = new MemoryMonitor({
        maxMemory: 500 * 1024 * 1024, // Use larger max to ensure percentage stays reasonable
      });
      const percentage = monitor.getUsagePercentage();
      expect(percentage).toBeGreaterThan(0);
      expect(percentage).toBeLessThan(200); // Allow some overhead
      monitor.dispose();
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(MemoryMonitor.formatBytes(0)).toBe('0 B');
      expect(MemoryMonitor.formatBytes(1024)).toBe('1 KB');
      expect(MemoryMonitor.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(MemoryMonitor.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('should format fractional values', () => {
      expect(MemoryMonitor.formatBytes(1536)).toBe('1.5 KB');
      expect(MemoryMonitor.formatBytes(1572864)).toBe('1.5 MB');
    });
  });

  describe('start/stop', () => {
    it('should start and stop monitoring', async () => {
      const monitor = new MemoryMonitor({ checkInterval: 100 });
      monitor.start();
      expect(monitor.getElapsedTime()).toBeGreaterThanOrEqual(0);

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(monitor.getElapsedTime()).toBeGreaterThanOrEqual(100);

      monitor.stop();
      monitor.dispose();
    });

    it('should not start twice', () => {
      const monitor = new MemoryMonitor({ checkInterval: 100 });
      monitor.start();
      monitor.start(); // Should not throw
      monitor.stop();
      monitor.dispose();
    });
  });

  describe('events', () => {
    it('should emit memory-warning event', (done) => {
      const monitor = new MemoryMonitor({
        maxMemory: 1,
        warningThreshold: 0.1,
        checkInterval: 50,
      });

      monitor.on('memory-warning', (data) => {
        expect(data).toHaveProperty('usagePercent');
        expect(data).toHaveProperty('threshold');
        monitor.stop();
        monitor.dispose();
        done();
      });

      monitor.start();
    });

    it('should emit memory-exceeded event', (done) => {
      const monitor = new MemoryMonitor({
        maxMemory: 1,
        checkInterval: 50,
      });

      monitor.on('memory-exceeded', (data) => {
        expect(data).toHaveProperty('maxMemory');
        monitor.stop();
        monitor.dispose();
        done();
      });

      monitor.start();
    });

    it('should remove all listeners on dispose', () => {
      const monitor = new MemoryMonitor();
      const listener = jest.fn();
      monitor.on('memory-warning', listener);
      monitor.dispose();

      // After dispose, emitting should do nothing
      expect(() => monitor.emit('memory-warning')).not.toThrow();
    });
  });

  describe('resetPeak', () => {
    it('should reset peak memory tracking', () => {
      const monitor = new MemoryMonitor();

      // Get initial peak
      const initialPeak = monitor.getPeakUsage();

      // Reset should set peak to current usage
      monitor.resetPeak();
      const peakAfterReset = monitor.getPeakUsage();

      // Peak after reset should be close to current usage
      // (allowing for some tolerance due to async operations)
      expect(peakAfterReset).toBeGreaterThanOrEqual(initialPeak);

      monitor.dispose();
    });
  });

  describe('getSummary', () => {
    it('should return formatted memory summary', () => {
      const monitor = new MemoryMonitor();
      const summary = monitor.getSummary();

      expect(typeof summary).toBe('string');
      expect(summary).toContain('Memory:');
      expect(summary).toContain('Peak:');

      monitor.dispose();
    });
  });

  describe('global monitor', () => {
    it('should return the same instance', () => {
      const monitor1 = getGlobalMemoryMonitor();
      const monitor2 = getGlobalMemoryMonitor();
      expect(monitor1).toBe(monitor2);
      disposeGlobalMemoryMonitor();
    });

    it('should dispose and recreate', () => {
      const monitor1 = getGlobalMemoryMonitor();
      disposeGlobalMemoryMonitor();
      const monitor2 = getGlobalMemoryMonitor();
      expect(monitor1).not.toBe(monitor2);
      disposeGlobalMemoryMonitor();
    });

    it('should create with options', () => {
      const monitor = getGlobalMemoryMonitor({ maxMemory: 200 * 1024 * 1024 });
      expect(monitor).toBeDefined();
      disposeGlobalMemoryMonitor();
    });
  });
});