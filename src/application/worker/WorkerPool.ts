import * as os from 'os';
import * as path from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';

/**
 * Task types for worker communication
 */
export interface WorkerTask {
  id: string;
  type: 'convert' | 'index';
  filePath?: string;
  sourceRoot?: string;
  outputDir?: string;
  content?: string;
}

export interface WorkerResult {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
  workerId: number;
}

/**
 * Options for WorkerPool
 */
export interface WorkerPoolOptions {
  /** Number of workers (default: 0 = auto based on CPU cores) */
  workerCount?: number;
  /** Task timeout in ms (default: 30000) */
  taskTimeout?: number;
  /** Enable worker recovery on crash */
  enableRecovery?: boolean;
  /** Enable graceful degradation when workers unavailable (default: true) */
  gracefulDegradation?: boolean;
}

/**
 * Check if worker threads are supported in the current environment
 */
function isWorkerThreadsSupported(): boolean {
  try {
    // Check if we're in main thread and worker_threads module is available
    return isMainThread;
  } catch {
    return false;
  }
}

/**
 * WorkerPool manages a pool of worker threads for parallel conversion
 * Supports graceful degradation when workers are unavailable
 */
export class WorkerPool extends EventEmitter {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private pendingTasks: Map<string, {
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private readonly workerCount: number;
  private readonly taskTimeout: number;
  private readonly enableRecovery: boolean;
  private readonly gracefulDegradation: boolean;
  private closed = false;
  private workersAvailable = true;

  constructor(options: WorkerPoolOptions = {}) {
    super();

    // Default to CPU cores - 1, minimum 1
    this.workerCount = options.workerCount || Math.max(1, os.cpus().length - 1);
    this.taskTimeout = options.taskTimeout || 30000;
    this.enableRecovery = options.enableRecovery !== false;
    this.gracefulDegradation = options.gracefulDegradation !== false;

    this.initialize();
  }

  private initialize(): void {
    // Only initialize in main thread
    if (isMainThread && isWorkerThreadsSupported()) {
      try {
        for (let i = 0; i < this.workerCount; i++) {
          this.createWorker(i);
        }
        this.workersAvailable = true;
      } catch (error) {
        this.workersAvailable = false;
        this.emit('worker-unavailable', {
          error: error instanceof Error ? error.message : String(error),
          reason: 'initialization_failed',
        });
      }
    } else {
      this.workersAvailable = false;
      this.emit('worker-unavailable', {
        error: 'Worker threads not supported in this environment',
        reason: 'not_supported',
      });
    }
  }

  private createWorker(id: number): Worker {
    const worker = new Worker(path.join(__dirname, 'worker-script.js'), {
      workerData: { workerId: id },
    });

    worker.on('message', (result: WorkerResult) => {
      this.handleWorkerMessage(result);
    });

    worker.on('error', (error: unknown) => {
      this.handleWorkerError(worker, error instanceof Error ? error : new Error(String(error)));
    });

    worker.on('exit', (code) => {
      this.handleWorkerExit(worker, code);
    });

    this.workers.push(worker);
    this.availableWorkers.push(worker);

    return worker;
  }

  private handleWorkerMessage(result: WorkerResult): void {
    const pending = this.pendingTasks.get(result.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingTasks.delete(result.id);
      pending.resolve(result);
    }

    // Mark worker as available again
    const worker = this.workers.find(w => w.threadId === result.workerId);
    if (worker && !this.availableWorkers.includes(worker)) {
      this.availableWorkers.push(worker);
    }

    this.emit('task-complete', result);
  }

  private handleWorkerError(worker: Worker, error: Error): void {
    const workerId = this.workers.indexOf(worker);
    this.emit('worker-error', { workerId, error });

    if (this.enableRecovery) {
      // Remove failed worker and create a new one
      const index = this.availableWorkers.indexOf(worker);
      if (index > -1) {
        this.availableWorkers.splice(index, 1);
      }

      const newWorker = this.createWorker(workerId);
      this.emit('worker-recovered', { oldWorkerId: workerId, newWorkerId: newWorker.threadId });
    }
  }

  private handleWorkerExit(worker: Worker, code: number): void {
    const index = this.availableWorkers.indexOf(worker);
    if (index > -1) {
      this.availableWorkers.splice(index, 1);
    }

    const workerId = this.workers.indexOf(worker);
    this.emit('worker-exit', { workerId, code });

    if (this.enableRecovery && code !== 0 && !this.closed) {
      // Create replacement worker
      const newWorker = this.createWorker(workerId);
      this.emit('worker-recovered', { oldWorkerId: workerId, newWorkerId: newWorker.threadId });
    }
  }

  /**
   * Execute a task on an available worker
   * Falls back gracefully when workers are unavailable
   */
  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    if (this.closed) {
      return {
        id: task.id,
        success: false,
        error: 'WorkerPool is closed',
        workerId: -1,
      };
    }

    // Check if workers are available
    if (!this.workersAvailable || this.workers.length === 0) {
      if (this.gracefulDegradation) {
        this.emit('fallback', { taskId: task.id, reason: 'workers_unavailable' });
        return {
          id: task.id,
          success: false,
          error: 'Workers unavailable - use main thread fallback',
          workerId: -1,
        };
      }
      throw new Error('WorkerPool workers are not available');
    }

    // Wait for available worker
    try {
      const worker = await this.waitForAvailableWorker();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingTasks.delete(task.id);
          reject(new Error(`Task ${task.id} timed out after ${this.taskTimeout}ms`));
        }, this.taskTimeout);

        this.pendingTasks.set(task.id, { resolve, reject, timeout });

        worker.postMessage(task);
      });
    } catch (error) {
      if (this.gracefulDegradation && this.workers.length === 0) {
        this.emit('fallback', { taskId: task.id, reason: 'all_workers_failed' });
        return {
          id: task.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          workerId: -1,
        };
      }
      throw error;
    }
  }

  private async waitForAvailableWorker(): Promise<Worker> {
    if (this.availableWorkers.length > 0) {
      return this.availableWorkers.shift()!;
    }

    // Wait for a worker to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.availableWorkers.length > 0) {
          clearInterval(checkInterval);
          resolve(this.availableWorkers.shift()!);
        }
      }, 100);
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeTasks(tasks: WorkerTask[]): Promise<WorkerResult[]> {
    return Promise.all(tasks.map(task => this.executeTask(task)));
  }

  /**
   * Get the number of active workers
   */
  getActiveWorkerCount(): number {
    return this.workers.length - this.availableWorkers.length;
  }

  /**
   * Get total worker count
   */
  getWorkerCount(): number {
    return this.workers.length;
  }

  /**
   * Check if workers are currently available
   */
  isAvailable(): boolean {
    return this.workersAvailable && this.workers.length > 0 && !this.closed;
  }

  /**
   * Check if graceful degradation is enabled
   */
  hasGracefulDegradation(): boolean {
    return this.gracefulDegradation;
  }

  /**
   * Close the worker pool
   */
  async close(): Promise<void> {
    this.closed = true;

    // Clear all pending tasks
    for (const [id, pending] of this.pendingTasks) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('WorkerPool closed'));
    }
    this.pendingTasks.clear();

    // Terminate all workers
    await Promise.all(this.workers.map(worker => worker.terminate()));

    this.workers = [];
    this.availableWorkers = [];
  }
}