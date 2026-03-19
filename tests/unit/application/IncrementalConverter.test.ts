import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IncrementalConverter, IncrementalOptions, ConversionState } from '../../../src/application/convert/IncrementalConverter';

describe('IncrementalConverter', () => {
  let incrementalConverter: IncrementalConverter;
  let tempDir: string;
  let statePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incremental-converter-test-'));
    statePath = path.join(tempDir, 'state.json');
    incrementalConverter = new IncrementalConverter({
      statePath,
      watchDebounce: 100,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadState', () => {
    it('should load existing state from file', async () => {
      const state: ConversionState = {
        startedAt: Date.now() - 1000,
        completedAt: Date.now() - 500,
        lastModified: Date.now() - 500,
        totalFiles: 2,
        files: {
          '/path/to/file1.md': {
            sourcePath: '/path/to/file1.md',
            outputPath: '/output/file1.md',
            sourceModified: Date.now() - 1000,
            convertedAt: Date.now() - 500,
            wikiLinkCount: 5,
            calloutCount: 2,
            success: true,
          },
          '/path/to/file2.md': {
            sourcePath: '/path/to/file2.md',
            outputPath: '/output/file2.md',
            sourceModified: Date.now() - 1000,
            convertedAt: Date.now() - 500,
            wikiLinkCount: 3,
            calloutCount: 1,
            success: true,
          },
        },
      };

      await fs.promises.writeFile(statePath, JSON.stringify(state));

      const loadedState = await incrementalConverter.loadState();

      expect(loadedState.totalFiles).toBe(2);
      expect(loadedState.files['/path/to/file1.md']).toBeDefined();
      expect(loadedState.files['/path/to/file2.md']).toBeDefined();
    });

    it('should return empty state if no state file exists', async () => {
      const state = await incrementalConverter.loadState();

      expect(state.totalFiles).toBe(0);
      expect(Object.keys(state.files)).toHaveLength(0);
    });

    it('should handle corrupted state file', async () => {
      await fs.promises.writeFile(statePath, 'not valid json');

      const state = await incrementalConverter.loadState();

      expect(state.totalFiles).toBe(0);
    });
  });

  describe('saveState', () => {
    it('should save state to file', async () => {
      await incrementalConverter.loadState();

      incrementalConverter.updateFileState({
        sourcePath: '/path/to/file1.md',
        outputPath: '/output/file1.md',
        sourceModified: Date.now(),
        convertedAt: Date.now(),
        wikiLinkCount: 5,
        calloutCount: 2,
        success: true,
      });

      await incrementalConverter.saveState();

      const savedContent = await fs.promises.readFile(statePath, 'utf-8');
      const savedState = JSON.parse(savedContent);

      expect(savedState.totalFiles).toBe(1);
      expect(savedState.files['/path/to/file1.md']).toBeDefined();
    });
  });

  describe('needsConversion', () => {
    it('should return true for never-converted files', () => {
      const testFile = path.join(tempDir, 'new.md');
      fs.writeFileSync(testFile, '# New File');

      expect(incrementalConverter.needsConversion(testFile)).toBe(true);
    });

    it('should return true for modified files', async () => {
      const testFile = path.join(tempDir, 'modified.md');
      fs.writeFileSync(testFile, '# Modified File');

      const originalMtime = (await fs.promises.stat(testFile)).mtimeMs;

      await incrementalConverter.loadState();
      incrementalConverter.updateFileState({
        sourcePath: testFile,
        outputPath: '/output/modified.md',
        sourceModified: originalMtime,
        convertedAt: Date.now(),
        wikiLinkCount: 1,
        calloutCount: 0,
        success: true,
      });

      // Wait a bit and modify the file
      await new Promise(resolve => setTimeout(resolve, 10));
      fs.writeFileSync(testFile, '# Modified File\n\nNew content');

      expect(incrementalConverter.needsConversion(testFile)).toBe(true);
    });

    it('should return false for unchanged files', async () => {
      const testFile = path.join(tempDir, 'unchanged.md');
      fs.writeFileSync(testFile, '# Unchanged File');

      const fileStats = await fs.promises.stat(testFile);

      await incrementalConverter.loadState();
      incrementalConverter.updateFileState({
        sourcePath: testFile,
        outputPath: '/output/unchanged.md',
        sourceModified: fileStats.mtimeMs + 1000, // Pretend converted after file was modified
        convertedAt: fileStats.mtimeMs + 1000,
        wikiLinkCount: 1,
        calloutCount: 0,
        success: true,
      });

      expect(incrementalConverter.needsConversion(testFile)).toBe(false);
    });
  });

  describe('getFilesToConvert', () => {
    it('should return only files that need conversion', async () => {
      const file1 = path.join(tempDir, 'file1.md');
      const file2 = path.join(tempDir, 'file2.md');
      const file3 = path.join(tempDir, 'file3.md');

      fs.writeFileSync(file1, '# File 1');
      fs.writeFileSync(file2, '# File 2');
      fs.writeFileSync(file3, '# File 3');

      await incrementalConverter.loadState();

      // Mark file1 as needing conversion (file was modified AFTER conversion)
      // The file's current mtime should be greater than convertedAt
      incrementalConverter.updateFileState({
        sourcePath: file1,
        outputPath: '/output/file1.md',
        sourceModified: Date.now() - 2000, // File was "modified" 2 seconds ago
        convertedAt: Date.now() - 1000,    // But we say conversion was 1 second ago
        wikiLinkCount: 0,
        calloutCount: 0,
        success: true,
      });

      // Mark file2 as already converted (and unchanged)
      const file2Stats = await fs.promises.stat(file2);
      incrementalConverter.updateFileState({
        sourcePath: file2,
        outputPath: '/output/file2.md',
        sourceModified: file2Stats.mtimeMs,
        convertedAt: Date.now(),
        wikiLinkCount: 0,
        calloutCount: 0,
        success: true,
      });

      const allFiles = [file1, file2, file3];
      const filesToConvert = incrementalConverter.getFilesToConvert(allFiles);

      // file1 needs conversion (modified after conversion)
      // file2 doesn't need conversion (not modified since conversion)
      // file3 needs conversion (never converted)
      expect(filesToConvert).toContain(file1);
      expect(filesToConvert).toContain(file3);
      expect(filesToConvert).not.toContain(file2);
    });
  });

  describe('removeFileFromState', () => {
    it('should remove a file from state', async () => {
      const testFile = path.join(tempDir, 'to-remove.md');
      fs.writeFileSync(testFile, '# Remove Me');

      await incrementalConverter.loadState();
      incrementalConverter.updateFileState({
        sourcePath: testFile,
        outputPath: '/output/to-remove.md',
        sourceModified: Date.now(),
        convertedAt: Date.now(),
        wikiLinkCount: 1,
        calloutCount: 0,
        success: true,
      });

      expect(incrementalConverter.getState().totalFiles).toBe(1);

      incrementalConverter.removeFileFromState(testFile);

      expect(incrementalConverter.getState().totalFiles).toBe(0);
    });
  });

  describe('clearState', () => {
    it('should clear all state', async () => {
      await incrementalConverter.loadState();
      incrementalConverter.updateFileState({
        sourcePath: '/path/to/file1.md',
        outputPath: '/output/file1.md',
        sourceModified: Date.now(),
        convertedAt: Date.now(),
        wikiLinkCount: 1,
        calloutCount: 0,
        success: true,
      });

      incrementalConverter.clearState();

      expect(incrementalConverter.getState().totalFiles).toBe(0);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', async () => {
      await incrementalConverter.loadState();

      incrementalConverter.updateFileState({
        sourcePath: '/path/to/file1.md',
        outputPath: '/output/file1.md',
        sourceModified: Date.now() - 2000,
        convertedAt: Date.now() - 1000,
        wikiLinkCount: 5,
        calloutCount: 2,
        success: true,
      });

      incrementalConverter.updateFileState({
        sourcePath: '/path/to/file2.md',
        outputPath: '/output/file2.md',
        sourceModified: Date.now() - 2000,
        convertedAt: Date.now() - 1000,
        wikiLinkCount: 3,
        calloutCount: 1,
        success: true,
      });

      const stats = incrementalConverter.getStatistics();

      expect(stats.totalFiles).toBe(2);
      expect(stats.convertedFiles).toBe(2);
      expect(stats.averageConversionTime).toBe(1000); // 2000 - 1000 = 1000 per file
    });
  });
});