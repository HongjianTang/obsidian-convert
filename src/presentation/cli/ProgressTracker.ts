import * as path from 'path';
import * as fs from 'fs';

// Dynamic import for ora to support NO_COLOR
let oraInstance: typeof import('ora').default | null = null;

interface ProgressTrackerOptions {
  /** Total number of files to process */
  totalFiles: number;
  /** Enable interactive mode (default: true) */
  interactive?: boolean;
  /** Prefix text for the progress bar */
  prefixText?: string;
}

/**
 * ProgressTracker manages progress display using ora for cross-platform progress bars
 * Supports NO_COLOR environment variable and graceful degradation for non-TTY environments
 */
export class ProgressTracker {
  private readonly totalFiles: number;
  private readonly interactive: boolean;
  private readonly prefixText: string;
  private readonly isTTY: boolean;
  private readonly supportsColor: boolean;

  private processedFiles = 0;
  private successCount = 0;
  private failCount = 0;
  private startTime = 0;
  private currentFile = '';
  private etaHistory: number[] = [];
  private spinner?: ReturnType<typeof import('ora').default>;
  private progressInterval?: NodeJS.Timeout;
  private lastUpdate = 0;

  constructor(options: ProgressTrackerOptions) {
    this.totalFiles = options.totalFiles;
    this.interactive = options.interactive !== false;
    this.prefixText = options.prefixText || 'Converting';
    this.isTTY = process.stdout.isTTY;
    // Check NO_COLOR environment variable
    this.supportsColor = this.isTTY && !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0';
  }

  /**
   * Check if color output is supported
   */
  isColorSupported(): boolean {
    return this.supportsColor;
  }

  /**
   * Check if interactive mode is enabled
   */
  isInteractive(): boolean {
    return this.interactive && this.isTTY;
  }

  /**
   * Start the progress tracker
   */
  start(): void {
    this.startTime = Date.now();
    this.processedFiles = 0;
    this.successCount = 0;
    this.failCount = 0;
    this.etaHistory = [];

    if (this.isInteractive() && !this.spinner) {
      // Dynamically load ora
      import('ora').then(ora => {
        oraInstance = ora.default;
        this.initSpinner();
      }).catch(() => {
        // ora not available, will use text mode
      });
    }
  }

  /**
   * Initialize the ora spinner
   */
  private initSpinner(): void {
    if (!oraInstance || !this.isInteractive()) return;

    this.spinner = oraInstance({
      text: this.formatProgressText(),
      prefixText: this.prefixText,
      spinner: 'dots2',
    }).start();

    // Update progress every 500ms
    this.progressInterval = setInterval(() => {
      this.updateSpinner();
    }, 500);
  }

  /**
   * Update spinner text and progress
   */
  private updateSpinner(): void {
    if (!this.spinner) return;

    const text = this.formatProgressText();
    this.spinner.text = text;
  }

  /**
   * Format the progress text
   */
  private formatProgressText(): string {
    const percent = this.totalFiles > 0 ? ((this.processedFiles / this.totalFiles) * 100).toFixed(1) : '0.0';
    const eta = this.calculateETA();
    const elapsed = this.formatDuration(Date.now() - this.startTime);

    const barLength = 20;
    const filledLength = Math.round((this.processedFiles / this.totalFiles) * barLength) || 0;
    const bar = '█'.repeat(filledLength) + '░'.repeat(Math.max(0, barLength - filledLength));

    const stats = [
      `| ${this.processedFiles}/${this.totalFiles}`,
      `| ${percent}%`,
      `| ✓${this.successCount}`,
      this.failCount > 0 ? ` ✗${this.failCount}` : '',
      `| ETA: ${eta}`,
      `| Elapsed: ${elapsed}`,
    ].filter(Boolean).join(' ');

    const fileInfo = this.currentFile ? `\n  📄 ${path.basename(this.currentFile)}` : '';

    return `[${bar}] ${stats}${fileInfo}`;
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateETA(): string {
    if (this.processedFiles === 0 || this.totalFiles === 0) {
      return '--:--';
    }

    const elapsed = Date.now() - this.startTime;
    const msPerFile = elapsed / this.processedFiles;
    const remainingFiles = this.totalFiles - this.processedFiles;
    const estimatedMs = msPerFile * remainingFiles;

    // Add to history for smoothing
    this.etaHistory.push(estimatedMs);
    if (this.etaHistory.length > 5) {
      this.etaHistory.shift();
    }

    // Use average of recent ETAs for more stable estimate
    const smoothedEta = this.etaHistory.reduce((a, b) => a + b, 0) / this.etaHistory.length;
    return this.formatDuration(smoothedEta);
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    if (ms <= 0 || !isFinite(ms)) return '0s';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Update progress - call this when a file is processed
   */
  update(filePath: string, success: boolean): void {
    this.processedFiles++;
    if (success) {
      this.successCount++;
    } else {
      this.failCount++;
    }
    this.currentFile = filePath;
    this.lastUpdate = Date.now();

    if (this.spinner) {
      this.updateSpinner();
    }
  }

  /**
   * Get current statistics
   */
  getStats(): {
    processedFiles: number;
    totalFiles: number;
    successCount: number;
    failCount: number;
    elapsed: number;
    eta: number;
    percent: number;
  } {
    return {
      processedFiles: this.processedFiles,
      totalFiles: this.totalFiles,
      successCount: this.successCount,
      failCount: this.failCount,
      elapsed: Date.now() - this.startTime,
      eta: this.etaHistory.length > 0
        ? this.etaHistory[this.etaHistory.length - 1]
        : 0,
      percent: this.totalFiles > 0
        ? (this.processedFiles / this.totalFiles) * 100
        : 0,
    };
  }

  /**
   * Stop the progress tracker and show final status
   */
  stop(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = undefined;
    }

    if (this.spinner) {
      const stats = this.getStats();
      const text = this.formatCompleteText(stats);
      this.spinner.succeed(text);
      this.spinner = undefined;
    }
  }

  /**
   * Format the completion text
   */
  private formatCompleteText(stats: ReturnType<typeof this.getStats>): string {
    const elapsed = this.formatDuration(stats.elapsed);
    const percent = stats.percent.toFixed(1);

    return [
      `${this.prefixText} Complete`,
      `| ${stats.processedFiles}/${stats.totalFiles} files (${percent}%)`,
      `| ✓ ${stats.successCount}`,
      stats.failCount > 0 ? ` ✗ ${stats.failCount}` : '',
      `| ${elapsed}`,
    ].filter(Boolean).join(' ');
  }

  /**
   * Print a non-interactive text progress line
   */
  printTextProgress(): void {
    if (this.isInteractive() && this.spinner) {
      // Spinner is handling it
      return;
    }

    const percent = this.totalFiles > 0 ? ((this.processedFiles / this.totalFiles) * 100).toFixed(1) : '0.0';
    const eta = this.calculateETA();
    const elapsed = this.formatDuration(Date.now() - this.startTime);

    const line = `[${this.processedFiles}/${this.totalFiles}] ${percent}% | ETA: ${eta} | Elapsed: ${elapsed}`;
    process.stdout.write(`\r${line}${' '.repeat(Math.max(0, 100 - line.length))}`);
  }

  /**
   * Print a message with color (if supported)
   */
  print(message: string, color?: 'green' | 'yellow' | 'red' | 'cyan' | 'magenta'): void {
    const colors: Record<string, string> = {
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      cyan: '\x1b[36m',
      magenta: '\x1b[35m',
    };

    const reset = '\x1b[0m';
    const prefix = this.supportsColor && color ? colors[color] : '';
    const suffix = this.supportsColor && color ? reset : '';

    console.log(`${prefix}${message}${suffix}`);
  }

  /**
   * Print a warning message
   */
  warn(message: string): void {
    this.print(`⚠️  ${message}`, 'yellow');
  }

  /**
   * Print an error message
   */
  error(message: string): void {
    this.print(`❌ ${message}`, 'red');
  }

  /**
   * Print a success message
   */
  success(message: string): void {
    this.print(`✅ ${message}`, 'green');
  }

  /**
   * Print an info message
   */
  info(message: string): void {
    this.print(`ℹ️  ${message}`, 'cyan');
  }

  /**
   * Clear current line (for non-interactive mode)
   */
  clearLine(): void {
    if (!this.isInteractive()) {
      process.stdout.write('\r' + ' '.repeat(100) + '\r');
    }
  }
}

/**
 * Watch mode interactive handler for pause/resume/status operations
 */
export class InteractiveWatchHandler {
  private isPaused = false;
  private pendingCount = 0;
  private convertedCount = 0;
  private errorCount = 0;
  private lastActivity = Date.now();
  private statusListeners: Array<() => void> = [];

  constructor(private readonly interactive: boolean = true) {
    if (interactive && process.stdin.isTTY) {
      this.setupKeyboardHandlers();
    }
  }

  /**
   * Setup keyboard handlers for interactive mode
   */
  private setupKeyboardHandlers(): void {
    // Read single character from stdin
    process.stdin.setRawMode?.(true);
    process.stdin.resume?.();
    process.stdin.setEncoding?.('utf8');

    let buffer = '';

    const handleData = (chunk: string) => {
      buffer += chunk;

      // Check for Ctrl+C (exit)
      if (buffer.includes('\u0003')) {
        process.emit('SIGINT');
        return;
      }

      // Check for 'p' (pause/resume)
      if (buffer.includes('p') || buffer.includes('P')) {
        this.togglePause();
        buffer = '';
        return;
      }

      // Check for 's' (status)
      if (buffer.includes('s') || buffer.includes('S')) {
        this.printStatus();
        buffer = '';
        return;
      }

      // Only keep last character if buffer is getting long
      if (buffer.length > 10) {
        buffer = buffer.slice(-1);
      }
    };

    process.stdin.on?.('data', handleData);
  }

  /**
   * Toggle pause state
   */
  togglePause(): void {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      console.log('\n⏸️  Watch mode PAUSED (press p to resume)');
    } else {
      console.log('\n▶️  Watch mode RESUMED');
    }
  }

  /**
   * Check if watch is paused
   */
  isWatchPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Update statistics
   */
  updateStats(pending: number, converted: number, errors: number): void {
    this.pendingCount = pending;
    this.convertedCount = converted;
    this.errorCount = errors;
    this.lastActivity = Date.now();
  }

  /**
   * Print current status
   */
  printStatus(): void {
    const uptime = this.formatDuration(Date.now() - this.lastActivity);
    console.log('\n📊 Watch Mode Status:');
    console.log(`   Pending conversions: ${this.pendingCount}`);
    console.log(`   Converted since start: ${this.convertedCount}`);
    console.log(`   Errors: ${this.errorCount}`);
    console.log(`   Last activity: ${uptime} ago`);
    console.log('   Press p to pause/resume, s for status, Ctrl+C to exit\n');
  }

  /**
   * Format duration
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Cleanup handlers
   */
  dispose(): void {
    process.stdin.removeAllListeners?.('data');
    process.stdin.setRawMode?.(false);
  }
}
