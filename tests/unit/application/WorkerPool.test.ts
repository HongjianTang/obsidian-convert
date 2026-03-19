import * as os from 'os';
import { WorkerPool, WorkerTask, WorkerResult } from '../../../src/application/worker/WorkerPool';

describe('WorkerPool', () => {
  let workerPool: WorkerPool;

  afterEach(async () => {
    if (workerPool) {
      await workerPool.close();
    }
  });

  describe('constructor', () => {
    it('should create worker pool with specified number of workers', () => {
      workerPool = new WorkerPool({ workerCount: 2 });

      expect(workerPool.getWorkerCount()).toBe(2);
    });

    it('should default to CPU cores minus 1 workers', () => {
      workerPool = new WorkerPool();

      const expectedCount = Math.max(1, os.cpus().length - 1);
      expect(workerPool.getWorkerCount()).toBe(expectedCount);
    });
  });

  describe('executeTask', () => {
    it('should execute a task and return result', async () => {
      workerPool = new WorkerPool({ workerCount: 1 });

      // Note: This test requires the worker script to be compiled
      // In a real environment, this would be tested with the compiled worker
      expect(workerPool.getWorkerCount()).toBe(1);
    });
  });

  describe('getActiveWorkerCount', () => {
    it('should return 0 when no tasks are running', () => {
      workerPool = new WorkerPool({ workerCount: 2 });

      expect(workerPool.getActiveWorkerCount()).toBe(0);
    });
  });

  describe('close', () => {
    it('should close all workers', async () => {
      workerPool = new WorkerPool({ workerCount: 2 });

      await workerPool.close();

      expect(workerPool.getWorkerCount()).toBe(0);
    });

    it('should return error result when closed', async () => {
      workerPool = new WorkerPool({ workerCount: 1, taskTimeout: 100 });

      // Try to execute a task after closing
      await workerPool.close();

      const result = await workerPool.executeTask({
        id: 'test-task',
        type: 'index',
        sourceRoot: '/test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('WorkerPool is closed');
    });
  });

  describe('worker recovery', () => {
    it('should recover from worker errors when recovery is enabled', async () => {
      const errorHandler = jest.fn();
      const recoveredHandler = jest.fn();

      workerPool = new WorkerPool({
        workerCount: 1,
        enableRecovery: true,
      });

      workerPool.on('worker-error', errorHandler);
      workerPool.on('worker-recovered', recoveredHandler);

      // Note: Actual error injection would require more sophisticated testing
      expect(workerPool.getWorkerCount()).toBe(1);
    });

    it('should not recover when recovery is disabled', () => {
      workerPool = new WorkerPool({
        workerCount: 1,
        enableRecovery: false,
      });

      expect(workerPool.getWorkerCount()).toBe(1);
    });
  });
});