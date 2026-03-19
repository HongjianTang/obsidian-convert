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

  describe('conflict resolution', () => {
    beforeEach(async () => {
      // Create conflicting file structure
      fs.mkdirSync(path.join(tempDir, 'folder1'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'folder2'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'folder1', 'sub'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'folder1', 'common.md'), '');
      fs.writeFileSync(path.join(tempDir, 'folder2', 'common.md'), '');
      fs.writeFileSync(path.join(tempDir, 'folder1', 'sub', 'common.md'), '');
      fs.writeFileSync(path.join(tempDir, 'target.md'), '');
    });

    it('should detect conflict when multiple files match', async () => {
      const conflictResolver = new LinkResolver({ caseInsensitive: true, conflictStrategy: 'nearest' });
      await conflictResolver.buildIndex([tempDir]);

      // Try to resolve 'common' from folder1/sub - there are 3 files with basename "common"
      const result = conflictResolver.resolve('common', path.join(tempDir, 'folder1', 'sub', 'test.md'), tempDir);

      expect(result.found).toBe(true);
      expect(result.hasConflict).toBe(true);
      expect(result.conflictingFiles).toHaveLength(3);
    });

    it('should resolve conflict with nearest strategy', async () => {
      const conflictResolver = new LinkResolver({ caseInsensitive: true, conflictStrategy: 'nearest' });
      await conflictResolver.buildIndex([tempDir]);

      // From folder1/sub/test.md, the nearest 'common' is folder1/sub/common.md
      // So the relative path should be './common.md' (same directory)
      const result = conflictResolver.resolve('common', path.join(tempDir, 'folder1', 'sub', 'test.md'), tempDir);

      expect(result.found).toBe(true);
      // result.relativePath is the calculated relative path from the source file's directory
      expect(result.relativePath).toBe('./common.md');
      // result.file?.relativePath is the path relative to source root
      expect(result.file?.relativePath).toBe('folder1/sub/common.md');
    });

    it('should resolve conflict with first strategy', async () => {
      const conflictResolver = new LinkResolver({ caseInsensitive: true, conflictStrategy: 'first' });
      await conflictResolver.buildIndex([tempDir]);

      const result = conflictResolver.resolve('common', path.join(tempDir, 'folder1', 'sub', 'test.md'), tempDir);

      expect(result.found).toBe(true);
      // First strategy should return first match found
      expect(result.hasConflict).toBe(true);
    });

    it('should throw error with error strategy', async () => {
      const conflictResolver = new LinkResolver({ caseInsensitive: true, conflictStrategy: 'error' });
      await conflictResolver.buildIndex([tempDir]);

      expect(() => {
        conflictResolver.resolve('common', path.join(tempDir, 'folder1', 'sub', 'test.md'), tempDir);
      }).toThrow('Link resolution conflict');
    });
  });

  describe('calculateRelativePath', () => {
    beforeEach(async () => {
      fs.mkdirSync(path.join(tempDir, 'level1', 'level2', 'level3'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'root.md'), '');
      fs.writeFileSync(path.join(tempDir, 'level1', 'level2', 'level3', 'deep.md'), '');
      fs.writeFileSync(path.join(tempDir, 'level1', 'sibling.md'), '');

      await resolver.buildIndex([tempDir]);
    });

    it('should calculate relative path from deep directory', () => {
      const result = resolver.resolve('root', path.join(tempDir, 'level1', 'level2', 'level3', 'deep.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.relativePath).toBe('../../../root.md');
    });

    it('should calculate relative path to sibling', () => {
      const result = resolver.resolve('sibling', path.join(tempDir, 'level1', 'level2', 'level3', 'deep.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.relativePath).toBe('../../sibling.md');
    });

    it('should calculate relative path across directories', () => {
      // level1/sibling.md exists, so we can resolve 'sibling' from root
      const result = resolver.resolve('sibling', path.join(tempDir, 'root.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.relativePath).toBe('./level1/sibling.md');
    });
  });

  describe('verbose mode', () => {
    it('should log resolution details in verbose mode', async () => {
      const verboseResolver = new LinkResolver({ caseInsensitive: true, verbose: true });
      fs.writeFileSync(path.join(tempDir, 'test.md'), '');

      await verboseResolver.buildIndex([tempDir]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      verboseResolver.resolve('test', path.join(tempDir, 'source.md'), tempDir);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('strict mode', () => {
    it('should throw error on broken link in strict mode', async () => {
      const strictResolver = new LinkResolver({ caseInsensitive: true, strictMode: true });
      await strictResolver.buildIndex([tempDir]);

      expect(() => {
        strictResolver.resolve('nonexistent', path.join(tempDir, 'test.md'), tempDir);
      }).toThrow('Strict mode: broken link');
    });

    it('should not throw error on broken link when strictMode is false', () => {
      const nonStrictResolver = new LinkResolver({ caseInsensitive: true, strictMode: false });
      // No buildIndex called, so no files indexed

      const result = nonStrictResolver.resolve('nonexistent', path.join(tempDir, 'test.md'), tempDir);

      expect(result.found).toBe(false);
      expect(result.isBroken).toBe(true);
    });
  });

  describe('getResolutionDetail', () => {
    it('should return detailed resolution info', async () => {
      fs.writeFileSync(path.join(tempDir, 'target.md'), '');
      await resolver.buildIndex([tempDir]);

      const detail = resolver.getResolutionDetail('target', path.join(tempDir, 'source.md'), tempDir);

      expect(detail.target).toBe('target');
      expect(detail.hasConflict).toBe(false);
      expect(detail.matchedFile?.basename).toBe('target');
    });
  });

  describe('verifyLinkPath', () => {
    it('should verify existing link path', async () => {
      fs.writeFileSync(path.join(tempDir, 'target.md'), '');
      fs.mkdirSync(path.join(tempDir, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'sub', 'source.md'), '');

      await resolver.buildIndex([tempDir]);

      // Verify a relative path that points to existing file
      const relativePath = '../target.md';
      const currentFilePath = path.join(tempDir, 'sub', 'source.md');

      const isValid = resolver.verifyLinkPath(relativePath, currentFilePath);

      expect(isValid).toBe(true);
    });

    it('should return false for non-existing link path', () => {
      const relativePath = '../nonexistent.md';
      const currentFilePath = path.join(tempDir, 'source.md');

      const isValid = resolver.verifyLinkPath(relativePath, currentFilePath);

      expect(isValid).toBe(false);
    });
  });

  describe('broken links tracking', () => {
    it('should track broken links', async () => {
      const trackingResolver = new LinkResolver({ caseInsensitive: true, warnOnBroken: true });
      fs.writeFileSync(path.join(tempDir, 'existing.md'), '');

      await trackingResolver.buildIndex([tempDir]);

      trackingResolver.resolve('existing', path.join(tempDir, 'test.md'), tempDir);
      trackingResolver.resolve('nonexistent1', path.join(tempDir, 'test.md'), tempDir);
      trackingResolver.resolve('nonexistent2', path.join(tempDir, 'test.md'), tempDir);

      const brokenLinks = trackingResolver.getBrokenLinks();

      expect(brokenLinks).toHaveLength(2);
      expect(brokenLinks).toContain(`${path.join(tempDir, 'test.md')}:nonexistent1`);
      expect(brokenLinks).toContain(`${path.join(tempDir, 'test.md')}:nonexistent2`);
    });

    it('should clear broken links', async () => {
      const trackingResolver = new LinkResolver({ caseInsensitive: true, warnOnBroken: true });
      fs.writeFileSync(path.join(tempDir, 'existing.md'), '');

      await trackingResolver.buildIndex([tempDir]);

      trackingResolver.resolve('nonexistent', path.join(tempDir, 'test.md'), tempDir);
      expect(trackingResolver.getBrokenLinks()).toHaveLength(1);

      trackingResolver.clearBrokenLinks();
      expect(trackingResolver.getBrokenLinks()).toHaveLength(0);
    });
  });

  describe('fuzzy matching', () => {
    beforeEach(async () => {
      // Create test files with similar names
      fs.writeFileSync(path.join(tempDir, 'introduction.md'), '');
      fs.mkdirSync(path.join(tempDir, 'notes'));
      fs.writeFileSync(path.join(tempDir, 'notes', 'introduction.md'), '');
      fs.mkdirSync(path.join(tempDir, 'sub'));
      fs.writeFileSync(path.join(tempDir, 'sub', 'note.md'), '');
    });

    it('should not use fuzzy match by default', async () => {
      const resolver = new LinkResolver({ caseInsensitive: true });
      await resolver.buildIndex([tempDir]);

      // 'intruction' does NOT exist, 'introduction' does - without fuzzy, this should fail
      const result = resolver.resolve('intruction', path.join(tempDir, 'test.md'), tempDir);
      expect(result.found).toBe(false);
      expect(result.isBroken).toBe(true);
    });

    it('should find fuzzy match when enabled', async () => {
      const fuzzyResolver = new LinkResolver({
        caseInsensitive: true,
        fuzzyMatch: true,
        fuzzyMaxDistance: 3,
        warnOnFuzzyMatch: false,
      });
      await fuzzyResolver.buildIndex([tempDir]);

      // 'introdution' (missing 'c') is distance 1 from 'introduction'
      // introdution vs introduction: missing 'c' at position 8
      const result = fuzzyResolver.resolve('introdution', path.join(tempDir, 'test.md'), tempDir);
      expect(result.found).toBe(true);
      expect(result.hasFuzzyMatch).toBe(true);
      expect(result.fuzzyMatchDistance).toBe(1);
      expect(result.file?.basename).toBe('introduction');
    });

    it('should prefer nearest file when multiple basename matches exist', async () => {
      const resolver = new LinkResolver({
        caseInsensitive: true,
        conflictStrategy: 'nearest',
      });
      await resolver.buildIndex([tempDir]);

      // 'introduction' exists in both root and notes folder
      // From notes/test.md, the nearest 'introduction' is notes/introduction.md
      const result = resolver.resolve('introduction', path.join(tempDir, 'notes', 'test.md'), tempDir);

      expect(result.found).toBe(true);
      // The nearest match should be notes/introduction.md
      expect(result.file?.relativePath).toBe('notes/introduction.md');
    });

    it('should not match if distance exceeds max', async () => {
      const fuzzyResolver = new LinkResolver({
        caseInsensitive: true,
        fuzzyMatch: true,
        fuzzyMaxDistance: 1, // Only allow distance of 1
        warnOnFuzzyMatch: false,
      });
      await fuzzyResolver.buildIndex([tempDir]);

      // 'intruction' vs 'introduction' is distance 1, should match
      // But 'introdction' vs 'introduction' is distance 2 (substitution + extra char)
      // Actually let's use 'introductio' (missing n at end) - distance 1
      const result = fuzzyResolver.resolve('introductio', path.join(tempDir, 'test.md'), tempDir);

      expect(result.found).toBe(true);
      expect(result.hasFuzzyMatch).toBe(true);
      expect(result.fuzzyMatchDistance).toBe(1);
    });

    it('should not match when distance exceeds max', async () => {
      const fuzzyResolver = new LinkResolver({
        caseInsensitive: true,
        fuzzyMatch: true,
        fuzzyMaxDistance: 1, // Only allow distance of 1
        warnOnFuzzyMatch: false,
      });
      await fuzzyResolver.buildIndex([tempDir]);

      // 'intruction' vs 'introduction' is distance 2, exceeds max of 1
      // introdction: i-n-t-r-o-d-c-t-i-o-n (11 chars, missing u, wrong order)
      // introduction: i-n-t-r-o-d-u-c-t-i-o-n (12 chars)
      // This is about 3+ edits, definitely > 1
      const result = fuzzyResolver.resolve('intruction', path.join(tempDir, 'test.md'), tempDir);

      expect(result.found).toBe(false);
      expect(result.isBroken).toBe(true);
    });

    it('should warn when fuzzy match is used', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const fuzzyResolver = new LinkResolver({
        caseInsensitive: true,
        fuzzyMatch: true,
        fuzzyMaxDistance: 3,
        warnOnFuzzyMatch: true,
      });
      await fuzzyResolver.buildIndex([tempDir]);

      // 'introdution' doesn't exist but 'introduction' does (distance 1)
      fuzzyResolver.resolve('introdution', path.join(tempDir, 'test.md'), tempDir);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('fuzzy match')
      );

      warnSpy.mockRestore();
    });

    it('should not warn when warnOnFuzzyMatch is false', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const fuzzyResolver = new LinkResolver({
        caseInsensitive: true,
        fuzzyMatch: true,
        fuzzyMaxDistance: 3,
        warnOnFuzzyMatch: false,
      });
      await fuzzyResolver.buildIndex([tempDir]);

      fuzzyResolver.resolve('introdution', path.join(tempDir, 'test.md'), tempDir);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it('should handle Chinese characters in fuzzy matching', async () => {
      // Create files with similar Chinese names
      fs.writeFileSync(path.join(tempDir, '知识库.md'), '');
      fs.mkdirSync(path.join(tempDir, 'chinese'));
      // '知诓库' (typo) does NOT exist as a file

      const fuzzyResolver = new LinkResolver({
        caseInsensitive: true,
        fuzzyMatch: true,
        fuzzyMaxDistance: 3,
        warnOnFuzzyMatch: false,
      });
      await fuzzyResolver.buildIndex([tempDir]);

      // '知诓库' is 1 edit away from '知识库' (诓 vs 识)
      const result = fuzzyResolver.resolve('知诓库', path.join(tempDir, 'chinese', 'test.md'), tempDir);

      expect(result.found).toBe(true);
      expect(result.hasFuzzyMatch).toBe(true);
      expect(result.file?.basename).toBe('知识库');
    });

    it('should use exact match over fuzzy match when available', async () => {
      fs.writeFileSync(path.join(tempDir, 'exact.md'), '');
      fs.writeFileSync(path.join(tempDir, 'exactt.md'), '');

      const fuzzyResolver = new LinkResolver({
        caseInsensitive: true,
        fuzzyMatch: true,
        fuzzyMaxDistance: 3,
        warnOnFuzzyMatch: false,
      });
      await fuzzyResolver.buildIndex([tempDir]);

      // 'exact' should match exactly, not fuzzy to 'exactt'
      const result = fuzzyResolver.resolve('exact', path.join(tempDir, 'test.md'), tempDir);

      expect(result.found).toBe(true);
      expect(result.hasFuzzyMatch).toBeUndefined();
      expect(result.file?.basename).toBe('exact');
    });

    it('should prefer subdirectory file when resolving from same subdir', async () => {
      // 'note.md' exists in 'sub/' directory
      const resolver = new LinkResolver({
        caseInsensitive: true,
        conflictStrategy: 'nearest',
      });
      await resolver.buildIndex([tempDir]);

      // From sub/test.md, resolve 'note' - should get sub/note.md
      // (note.md doesn't exist in root, only in sub/)
      const result = resolver.resolve('note', path.join(tempDir, 'sub', 'test.md'), tempDir);

      expect(result.found).toBe(true);
      expect(result.file?.relativePath).toBe('sub/note.md');
    });
  });
});