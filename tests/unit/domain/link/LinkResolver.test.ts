import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LinkResolver } from '../../../../src/domain/link';

describe('LinkResolver', () => {
  let resolver: LinkResolver;
  let tempDir: string;

  beforeEach(() => {
    resolver = new LinkResolver({ caseInsensitive: true });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-resolver-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('buildIndex', () => {
    it('should index markdown files', async () => {
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'note1.md'), '');
      fs.writeFileSync(path.join(tempDir, 'note2.md'), '');
      fs.mkdirSync(path.join(tempDir, 'folder'));
      fs.writeFileSync(path.join(tempDir, 'folder', 'note3.md'), '');

      await resolver.buildIndex([tempDir]);

      const files = resolver.getIndexedFiles();
      expect(files).toHaveLength(3);
      expect(files.map(f => f.basename)).toContain('note1');
      expect(files.map(f => f.basename)).toContain('note2');
      expect(files.map(f => f.basename)).toContain('note3');
    });

    it('should skip hidden directories', async () => {
      fs.writeFileSync(path.join(tempDir, 'visible.md'), '');
      fs.mkdirSync(path.join(tempDir, '.hidden'));
      fs.writeFileSync(path.join(tempDir, '.hidden', 'file.md'), '');

      await resolver.buildIndex([tempDir]);

      const files = resolver.getIndexedFiles();
      expect(files).toHaveLength(1);
      expect(files[0].basename).toBe('visible');
    });

    it('should skip .obsidian directory', async () => {
      fs.writeFileSync(path.join(tempDir, 'note.md'), '');
      fs.mkdirSync(path.join(tempDir, '.obsidian'));
      fs.writeFileSync(path.join(tempDir, '.obsidian', 'config.md'), '');

      await resolver.buildIndex([tempDir]);

      const files = resolver.getIndexedFiles();
      expect(files).toHaveLength(1);
    });

    it('should handle Chinese filenames', async () => {
      fs.writeFileSync(path.join(tempDir, '知识库.md'), '');
      fs.writeFileSync(path.join(tempDir, '玩法设计.md'), '');

      await resolver.buildIndex([tempDir]);

      const files = resolver.getIndexedFiles();
      expect(files).toHaveLength(2);
      expect(files.map(f => f.basename)).toContain('知识库');
      expect(files.map(f => f.basename)).toContain('玩法设计');
    });
  });

  describe('resolve', () => {
    beforeEach(async () => {
      // Create test structure
      fs.writeFileSync(path.join(tempDir, 'note1.md'), '');
      fs.writeFileSync(path.join(tempDir, 'Knowledge.md'), '');
      fs.mkdirSync(path.join(tempDir, 'folder'));
      fs.writeFileSync(path.join(tempDir, 'folder', 'note2.md'), '');
      fs.writeFileSync(path.join(tempDir, '知识库.md'), '');

      await resolver.buildIndex([tempDir]);
    });

    it('should resolve exact match', () => {
      const result = resolver.resolve('note1', path.join(tempDir, 'test.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.file?.basename).toBe('note1');
    });

    it('should resolve with case-insensitive matching', () => {
      const result = resolver.resolve('knowledge', path.join(tempDir, 'test.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.file?.basename).toBe('Knowledge');
    });

    it('should resolve Chinese filename', () => {
      const result = resolver.resolve('知识库', path.join(tempDir, 'test.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.file?.basename).toBe('知识库');
    });

    it('should resolve file in subdirectory', () => {
      const result = resolver.resolve('note2', path.join(tempDir, 'test.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.file?.relativePath).toBe('folder/note2.md');
    });

    it('should return broken for missing file', () => {
      const result = resolver.resolve('nonexistent', path.join(tempDir, 'test.md'), tempDir);
      expect(result.found).toBe(false);
      expect(result.isBroken).toBe(true);
    });

    it('should calculate relative path correctly', () => {
      const result = resolver.resolve('note1', path.join(tempDir, 'folder', 'test.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.relativePath).toBe('../note1.md');
    });
  });
});