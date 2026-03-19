import { FileChangeEvent } from './FileWatcher';

/**
 * Types of events that can be logged
 */
export type WatchEventType =
  | 'file-add'
  | 'file-change'
  | 'file-delete'
  | 'conversion-start'
  | 'conversion-complete'
  | 'conversion-error'
  | 'watch-start'
  | 'watch-stop';

/**
 * A logged event
 */
export interface WatchEvent {
  /** Event type */
  type: WatchEventType;
  /** Event timestamp (ms since epoch) */
  timestamp: number;
  /** File path if applicable */
  filePath?: string;
  /** Additional event data */
  data?: Record<string, unknown>;
}

/**
 * Conversion result for a single file
 */
export interface FileConversionRecord {
  filePath: string;
  outputPath: string;
  success: boolean;
  wikiLinkCount: number;
  calloutCount: number;
  error?: string;
  durationMs: number;
}

/**
 * Summary of a conversion batch
 */
export interface ConversionSummary {
  totalFiles: number;
  successCount: number;
  failedCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
}

/**
 * Event log that records file change history and conversion results
 */
export class EventLog {
  private events: WatchEvent[] = [];
  private conversionRecords: FileConversionRecord[] = [];
  private watchStartTime?: number;
  private watchEndTime?: number;
  private readonly maxEvents: number;

  constructor(maxEvents: number = 1000) {
    this.maxEvents = maxEvents;
  }

  /**
   * Log a watch start event
   */
  logWatchStart(sourcePath: string, outputPath: string): void {
    this.watchStartTime = Date.now();
    this.events.push({
      type: 'watch-start',
      timestamp: Date.now(),
      data: { sourcePath, outputPath },
    });
  }

  /**
   * Log a watch stop event
   */
  logWatchStop(): void {
    this.watchEndTime = Date.now();
    this.events.push({
      type: 'watch-stop',
      timestamp: Date.now(),
    });
  }

  /**
   * Log a file change event
   */
  logFileChange(eventType: FileChangeEvent, filePath: string): void {
    const watchEventType: WatchEventType =
      eventType === 'add' ? 'file-add' :
      eventType === 'change' ? 'file-change' : 'file-delete';

    this.events.push({
      type: watchEventType,
      timestamp: Date.now(),
      filePath,
    });
  }

  /**
   * Log the start of a conversion batch
   */
  logConversionStart(files: string[]): void {
    this.events.push({
      type: 'conversion-start',
      timestamp: Date.now(),
      data: { fileCount: files.length, files },
    });
  }

  /**
   * Log a file conversion result
   */
  logFileConversion(record: FileConversionRecord): void {
    this.conversionRecords.push(record);
    this.events.push({
      type: record.success ? 'conversion-complete' : 'conversion-error',
      timestamp: Date.now(),
      filePath: record.filePath,
      data: {
        success: record.success,
        wikiLinkCount: record.wikiLinkCount,
        calloutCount: record.calloutCount,
        durationMs: record.durationMs,
        error: record.error,
      },
    });
  }

  /**
   * Get all logged events
   */
  getEvents(): WatchEvent[] {
    return [...this.events];
  }

  /**
   * Get events of a specific type
   */
  getEventsByType(type: WatchEventType): WatchEvent[] {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Get recent events (last n events)
   */
  getRecentEvents(count: number = 10): WatchEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get conversion records
   */
  getConversionRecords(): FileConversionRecord[] {
    return [...this.conversionRecords];
  }

  /**
   * Get the conversion summary
   */
  getConversionSummary(): ConversionSummary {
    const totalDurationMs = this.conversionRecords.reduce(
      (sum, r) => sum + r.durationMs,
      0
    );
    const successCount = this.conversionRecords.filter(r => r.success).length;
    const failedCount = this.conversionRecords.filter(r => !r.success).length;

    return {
      totalFiles: this.conversionRecords.length,
      successCount,
      failedCount,
      totalDurationMs,
      averageDurationMs:
        this.conversionRecords.length > 0
          ? totalDurationMs / this.conversionRecords.length
          : 0,
    };
  }

  /**
   * Get the total watch duration
   */
  getWatchDuration(): number | null {
    if (!this.watchStartTime) return null;
    const endTime = this.watchEndTime ?? Date.now();
    return endTime - this.watchStartTime;
  }

  /**
   * Clear the event log
   */
  clear(): void {
    this.events = [];
    this.conversionRecords = [];
    this.watchStartTime = undefined;
    this.watchEndTime = undefined;
  }

  /**
   * Get a summary of the watch session
   */
  getSessionSummary(): {
    watchDuration: number | null;
    totalFileChanges: number;
    totalConversions: number;
    conversionSummary: ConversionSummary;
    filesAdded: number;
    filesChanged: number;
    filesDeleted: number;
  } {
    const filesAdded = this.events.filter(e => e.type === 'file-add').length;
    const filesChanged = this.events.filter(e => e.type === 'file-change').length;
    const filesDeleted = this.events.filter(e => e.type === 'file-delete').length;

    return {
      watchDuration: this.getWatchDuration(),
      totalFileChanges: filesAdded + filesChanged + filesDeleted,
      totalConversions: this.conversionRecords.length,
      conversionSummary: this.getConversionSummary(),
      filesAdded,
      filesChanged,
      filesDeleted,
    };
  }

  /**
   * Format the session summary as a string for display
   */
  formatSummary(): string {
    const summary = this.getSessionSummary();
    const duration = summary.watchDuration
      ? `${(summary.watchDuration / 1000).toFixed(1)}s`
      : 'N/A';

    let output = '\n=== Watch Mode Summary ===\n';
    output += `Duration: ${duration}\n`;
    output += `File changes: ${summary.totalFileChanges} (${summary.filesAdded} added, ${summary.filesChanged} changed, ${summary.filesDeleted} deleted)\n`;
    output += `Total conversions: ${summary.totalConversions}\n`;

    if (summary.conversionSummary.totalFiles > 0) {
      output += `\nConversion Results:\n`;
      output += `  Total: ${summary.conversionSummary.totalFiles}\n`;
      output += `  Success: ${summary.conversionSummary.successCount}\n`;
      output += `  Failed: ${summary.conversionSummary.failedCount}\n`;
      output += `  Avg duration: ${summary.conversionSummary.averageDurationMs.toFixed(1)}ms\n`;
    }

    return output;
  }
}