import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents the state of a converted file
 */
export interface FileConversionState {
  /** Source file path */
  sourcePath: string;
  /** Output file path */
  outputPath: string;
  /** Last modified timestamp of source file */
  sourceModified: number;
  /** Last modified timestamp when converted */
  convertedAt: number;
  /** MD5 hash of source content for change detection */
  sourceHash?: string;
  /** Number of WikiLinks at time of conversion */
  wikiLinkCount: number;
  /** Number of callouts at time of conversion */
  calloutCount: number;
  /** Whether conversion succeeded */
  success: boolean;
}

/**
 * Complete conversion state
 */
export interface ConversionState {
  /** When the conversion started */
  startedAt: number;
  /** When the conversion completed */
  completedAt: number;
  /** Last modified timestamp of state file */
  lastModified: number;
  /** Number of files converted */
  totalFiles: number;
  /** Per-file conversion states */
  files: Record<string, FileConversionState>;
}

/**
 * Options for incremental conversion
 */
export interface IncrementalOptions {
  /** Path to state file */
  statePath: string;
  /** Only convert files modified since this timestamp */
  since?: number;
  /** Watch mode - continuously watch for changes */
  watch?: boolean;
  /** Debounce delay for file changes in watch mode (ms) */
  watchDebounce?: number;
}

/**
 * Handles incremental conversion with state management
 */
export class IncrementalConverter {
  private state: ConversionState;
  private readonly statePath: string;
  private readonly watchDebounce: number;
  private watchHandles: Map<string, fs.FSWatcher> = new Map();
  private watchCallbacks: Map<string, (eventType: string, filename: string) => void> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(options: IncrementalOptions) {
    this.statePath = options.statePath;
    this.watchDebounce = options.watchDebounce || 500;
    this.state = this.createEmptyState();
  }

  /**
   * Create an empty conversion state
   */
  private createEmptyState(): ConversionState {
    const now = Date.now();
    return {
      startedAt: now,
      completedAt: now,
      lastModified: now,
      totalFiles: 0,
      files: {},
    };
  }

  /**
   * Load conversion state from file
   */
  async loadState(): Promise<ConversionState> {
    try {
      if (fs.existsSync(this.statePath)) {
        const content = await fs.promises.readFile(this.statePath, 'utf-8');
        this.state = JSON.parse(content);
        return this.state;
      }
    } catch (error) {
      console.warn(`Failed to load state from ${this.statePath}:`, error);
    }

    this.state = this.createEmptyState();
    return this.state;
  }

  /**
   * Save conversion state to file
   */
  async saveState(): Promise<void> {
    this.state.lastModified = Date.now();
    this.state.completedAt = this.state.lastModified;

    // Ensure directory exists
    const dir = path.dirname(this.statePath);
    await fs.promises.mkdir(dir, { recursive: true });

    await fs.promises.writeFile(
      this.statePath,
      JSON.stringify(this.state, null, 2),
      'utf-8'
    );
  }

  /**
   * Get the current conversion state
   */
  getState(): ConversionState {
    return this.state;
  }

  /**
   * Check if a file needs conversion based on its modification time
   */
  needsConversion(filePath: string): boolean {
    const fileState = this.state.files[filePath];

    if (!fileState) {
      return true; // Never converted
    }

    try {
      const stats = fs.statSync(filePath);
      return stats.mtimeMs > fileState.convertedAt;
    } catch {
      return true; // File doesn't exist or can't be accessed
    }
  }

  /**
   * Update state for a converted file
   */
  updateFileState(fileState: FileConversionState): void {
    this.state.files[fileState.sourcePath] = fileState;
    this.state.totalFiles = Object.keys(this.state.files).length;
    this.state.lastModified = Date.now();
  }

  /**
   * Get files that need conversion
   */
  getFilesToConvert(allFiles: string[]): string[] {
    return allFiles.filter(file => this.needsConversion(file));
  }

  /**
   * Get the modification time threshold for incremental conversion
   */
  getSinceTimestamp(): number | undefined {
    return this.state.lastModified;
  }

  /**
   * Start watching a directory for file changes
   */
  watchDirectory(
    dirPath: string,
    callback: (eventType: string, filename: string, filePath: string) => void
  ): void {
    if (this.watchHandles.has(dirPath)) {
      return; // Already watching
    }

    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.md')) return;

      const fullPath = path.join(dirPath, filename);
      this.debounceWatchEvent(fullPath, eventType, callback);
    });

    this.watchHandles.set(dirPath, watcher);
  }

  /**
   * Debounce watch events to avoid processing the same file multiple times
   */
  private debounceWatchEvent(
    filePath: string,
    eventType: string,
    callback: (eventType: string, filename: string, filePath: string) => void
  ): void {
    // Clear existing timer for this file
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      callback(eventType, path.basename(filePath), filePath);
    }, this.watchDebounce);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Stop watching all directories
   */
  unwatchAll(): void {
    for (const [dirPath, watcher] of this.watchHandles) {
      watcher.close();
    }
    this.watchHandles.clear();
    this.watchCallbacks.clear();

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Remove a specific file from the state (e.g., when deleted)
   */
  removeFileFromState(filePath: string): void {
    if (this.state.files[filePath]) {
      delete this.state.files[filePath];
      this.state.totalFiles = Object.keys(this.state.files).length;
      this.state.lastModified = Date.now();
    }
  }

  /**
   * Clear all state
   */
  clearState(): void {
    this.state = this.createEmptyState();
  }

  /**
   * Get statistics about the conversion
   */
  getStatistics(): {
    totalFiles: number;
    convertedFiles: number;
    lastModified: number;
    averageConversionTime: number;
  } {
    const files = Object.values(this.state.files);
    const successfulConversions = files.filter(f => f.success);

    // Calculate average conversion time
    let totalConversionTime = 0;
    for (const file of successfulConversions) {
      totalConversionTime += file.convertedAt - file.sourceModified;
    }
    const avgConversionTime = successfulConversions.length > 0
      ? totalConversionTime / successfulConversions.length
      : 0;

    return {
      totalFiles: this.state.totalFiles,
      convertedFiles: successfulConversions.length,
      lastModified: this.state.lastModified,
      averageConversionTime: avgConversionTime,
    };
  }
}