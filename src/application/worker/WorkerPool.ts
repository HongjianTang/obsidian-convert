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
}

/**
 * WorkerPool manages a pool of worker threads for parallel conversion
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
  private closed = false;

  constructor(options: WorkerPoolOptions = {}) {
    super();

    // Default to CPU cores - 1, minimum 1
    this.workerCount = options.workerCount || Math.max(1, os.cpus().length - 1);
    this.taskTimeout = options.taskTimeout || 30000;
    this.enableRecovery = options.enableRecovery !== false;

    this.initialize();
  }

  private initialize(): void {
    // Only initialize in main thread
    if (isMainThread) {
      for (let i = 0; i < this.workerCount; i++) {
        this.createWorker(i);
      }
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
   */
  async executeTask(task: WorkerTask): Promise<WorkerResult> {
    if (this.closed) {
      throw new Error('WorkerPool is closed');
    }

    // Wait for available worker
    const worker = await this.waitForAvailableWorker();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingTasks.delete(task.id);
        reject(new Error(`Task ${task.id} timed out after ${this.taskTimeout}ms`));
      }, this.taskTimeout);

      this.pendingTasks.set(task.id, { resolve, reject, timeout });

      worker.postMessage(task);
    });
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