import * as fs from 'fs';
import * as path from 'path';

export type FileChangeEvent = 'add' | 'change' | 'unlink';
export type FileChangeCallback = (eventType: FileChangeEvent, filePath: string, relativePath: string) => void;

/**
 * Options for FileWatcher
 */
export interface FileWatcherOptions {
  /** Debounce delay for file changes (ms) */
  debounceMs?: number;
  /** Whether to watch recursively */
  recursive?: boolean;
  /** File extensions to watch */
  extensions?: string[];
}

/**
 * File watcher that monitors a directory for changes
 * Uses Node.js fs.watch for cross-platform compatibility
 */
export class FileWatcher {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private callbacks: FileChangeCallback[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceMs: number;
  private readonly recursive: boolean;
  private readonly extensions: Set<string>;
  private watchedPaths: Set<string> = new Set();

  constructor(options: FileWatcherOptions = {}) {
    this.debounceMs = options.debounceMs ?? 300;
    this.recursive = options.recursive ?? true;
    this.extensions = new Set(options.extensions ?? ['.md']);
  }

  /**
   * Watch a directory for file changes
   */
  watch(dirPath: string, callback: FileChangeCallback): void {
    if (this.watchedPaths.has(dirPath)) {
      return;
    }
    this.watchedPaths.add(dirPath);
    this.callbacks.push(callback);

    // Use fs.watch recursively by walking the directory
    this.watchDirectory(dirPath);
  }

  /**
   * Watch a directory and all subdirectories
   */
  private watchDirectory(dirPath: string): void {
    try {
      const watcher = fs.watch(dirPath, { recursive: this.recursive }, (eventType, filename) => {
        if (!filename) return;

        const fullPath = path.join(dirPath, filename);
        this.handleEvent(fullPath, dirPath);
      });

      this.watchers.set(dirPath, watcher);

      // Also watch any existing subdirectories
      if (this.recursive) {
        this.watchSubdirectories(dirPath);
      }
    } catch (error) {
      console.error(`Failed to watch directory ${dirPath}:`, error);
    }
  }

  /**
   * Watch all subdirectories of a directory
   */
  private watchSubdirectories(dirPath: string): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (['node_modules', '.obsidian'].includes(entry.name)) continue;

        const fullPath = path.join(dirPath, entry.name);
        this.watchDirectory(fullPath);
      }
    } catch {
      // Ignore errors when reading directories
    }
  }

  /**
   * Handle a file change event
   */
  private handleEvent(fullPath: string, rootPath: string): void {
    // Check file extension
    const ext = path.extname(fullPath).toLowerCase();
    if (!this.extensions.has(ext)) return;

    // Get relative path
    const relativePath = path.relative(rootPath, fullPath);

    // Determine event type
    let eventType: FileChangeEvent;
    try {
      fs.accessSync(fullPath, fs.constants.F_OK);
      eventType = 'change';
    } catch {
      eventType = 'unlink';
    }

    // Debounce the event
    this.debounceEvent(fullPath, relativePath, eventType);
  }

  /**
   * Debounce file events to avoid multiple rapid triggers
   */
  private debounceEvent(
    filePath: string,
    relativePath: string,
    eventType: FileChangeEvent
  ): void {
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.notifyCallbacks(eventType, filePath, relativePath);
    }, this.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Notify all callbacks of a file change
   */
  private notifyCallbacks(
    eventType: FileChangeEvent,
    filePath: string,
    relativePath: string
  ): void {
    for (const callback of this.callbacks) {
      try {
        callback(eventType, filePath, relativePath);
      } catch (error) {
        console.error('Error in file watcher callback:', error);
      }
    }
  }

  /**
   * Stop watching all directories
   */
  close(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchedPaths.clear();
    this.callbacks = [];
  }
}