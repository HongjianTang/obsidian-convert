import { EventEmitter } from 'events';

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  /** Current heap used in bytes */
  heapUsed: number;
  /** Total heap available in bytes */
  heapTotal: number;
  /** RSS (Resident Set Size) in bytes */
  rss: number;
  /** External memory in bytes */
  external: number;
  /** Peak heap used in bytes since monitoring started */
  peakHeapUsed: number;
  /** Timestamp of when stats were captured */
  timestamp: number;
}

/**
 * Options for MemoryMonitor
 */
export interface MemoryMonitorOptions {
  /** Maximum memory threshold in bytes (default: 500MB) */
  maxMemory?: number;
  /** Warning threshold as percentage of maxMemory (default: 80%) */
  warningThreshold?: number;
  /** Interval for checking memory in ms (default: 1000) */
  checkInterval?: number;
  /** Enable automatic garbage collection hints (default: false) */
  enableGCHints?: boolean;
}

/**
 * MemoryMonitor tracks memory usage and emits warnings when thresholds are exceeded
 */
export class MemoryMonitor extends EventEmitter {
  private readonly maxMemory: number;
  private readonly warningThreshold: number;
  private readonly checkInterval: number;
  private readonly enableGCHints: boolean;
  private peakHeapUsed = 0;
  private intervalId?: NodeJS.Timeout;
  private startTime = 0;
  private isMonitoring = false;

  constructor(options: MemoryMonitorOptions = {}) {
    super();

    // Default max memory: 500MB
    this.maxMemory = options.maxMemory || 500 * 1024 * 1024;
    // Default warning at 80% of max
    this.warningThreshold = options.warningThreshold || 0.8;
    this.checkInterval = options.checkInterval || 1000;
    this.enableGCHints = options.enableGCHints || false;
  }

  /**
   * Get current memory statistics
   */
  getStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;

    // Update peak if current is higher
    if (heapUsed > this.peakHeapUsed) {
      this.peakHeapUsed = heapUsed;
    }

    return {
      heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      peakHeapUsed: this.peakHeapUsed,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if memory usage is within acceptable range
   */
  isMemorySafe(): boolean {
    const stats = this.getStats();
    return stats.heapUsed < this.maxMemory * this.warningThreshold;
  }

  /**
   * Check if memory usage has exceeded the maximum
   */
  isMemoryExceeded(): boolean {
    const stats = this.getStats();
    return stats.heapUsed > this.maxMemory;
  }

  /**
   * Get memory usage as a percentage of maxMemory
   */
  getUsagePercentage(): number {
    const stats = this.getStats();
    return (stats.heapUsed / this.maxMemory) * 100;
  }

  /**
   * Format bytes to human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Start monitoring memory usage
   */
  start(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.startTime = Date.now();
    this.peakHeapUsed = 0;

    // Capture initial peak
    this.getStats();

    this.intervalId = setInterval(() => {
      this.checkMemory();
    }, this.checkInterval);
  }

  /**
   * Stop monitoring memory usage
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isMonitoring = false;
  }

  /**
   * Check current memory and emit warnings if needed
   */
  private checkMemory(): void {
    const stats = this.getStats();
    const usagePercent = (stats.heapUsed / this.maxMemory) * 100;

    // Emit warning if above threshold
    if (usagePercent >= this.warningThreshold * 100) {
      this.emit('memory-warning', {
        ...stats,
        usagePercent,
        threshold: this.warningThreshold * 100,
      });
    }

    // Emit critical if exceeded
    if (stats.heapUsed > this.maxMemory) {
      this.emit('memory-exceeded', {
        ...stats,
        usagePercent,
        maxMemory: this.maxMemory,
      });

      // Request GC if enabled and available
      if (this.enableGCHints && global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Get elapsed time since monitoring started in ms
   */
  getElapsedTime(): number {
    if (this.startTime === 0) return 0;
    return Date.now() - this.startTime;
  }

  /**
   * Get peak memory usage
   */
  getPeakUsage(): number {
    return this.peakHeapUsed;
  }

  /**
   * Reset peak memory tracking
   */
  resetPeak(): void {
    this.peakHeapUsed = process.memoryUsage().heapUsed;
  }

  /**
   * Create a summary string for current memory state
   */
  getSummary(): string {
    const stats = this.getStats();
    const percent = ((stats.heapUsed / this.maxMemory) * 100).toFixed(1);
    return `Memory: ${MemoryMonitor.formatBytes(stats.heapUsed)} / ${MemoryMonitor.formatBytes(this.maxMemory)} (${percent}%) | Peak: ${MemoryMonitor.formatBytes(this.peakHeapUsed)}`;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.removeAllListeners();
  }
}

/**
 * Global memory monitor instance for shared monitoring across the application
 */
let globalMonitor: MemoryMonitor | null = null;

/**
 * Get or create the global memory monitor instance
 */
export function getGlobalMemoryMonitor(options?: MemoryMonitorOptions): MemoryMonitor {
  if (!globalMonitor) {
    globalMonitor = new MemoryMonitor(options);
  }
  return globalMonitor;
}

/**
 * Dispose the global memory monitor
 */
export function disposeGlobalMemoryMonitor(): void {
  if (globalMonitor) {
    globalMonitor.dispose();
    globalMonitor = null;
  }
}