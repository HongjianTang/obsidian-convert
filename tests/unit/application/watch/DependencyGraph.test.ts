import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DependencyGraph } from '../../../../src/application/watch/DependencyGraph';

describe('DependencyGraph', () => {
  let tempDir: string;
  let graph: DependencyGraph;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'depgraph-test-'));
    graph = new DependencyGraph(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('build', () => {
    it('should build graph from markdown files', async () => {
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'index.md'), '# Index');
      fs.writeFileSync(path.join(tempDir, 'about.md'), '# About');

      const files = [
        path.join(tempDir, 'index.md'),
        path.join(tempDir, 'about.md'),
      ];

      await graph.build(files);

      const stats = graph.getStatistics();
      expect(stats.totalFiles).toBe(2);
    });

    it('should track wiki links between files', async () => {
      // Create files with links
      fs.writeFileSync(
        path.join(tempDir, 'index.md'),
        '# Index\nSee [[About]] for more info.'
      );
      fs.writeFileSync(path.join(tempDir, 'about.md'), '# About');

      const files = [
        path.join(tempDir, 'index.md'),
        path.join(tempDir, 'about.md'),
      ];

      await graph.build(files);

      // index.md references About.md
      const references = graph.getReferencedFiles(path.join(tempDir, 'index.md'));
      expect(references.length).toBe(1);
    });
  });

  describe('getFilesToReconvert', () => {
    it('should return the changed file and its dependents', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'index.md'),
        '# Index\nSee [[About]] and [[Contact]].'
      );
      fs.writeFileSync(path.join(tempDir, 'about.md'), '# About');
      fs.writeFileSync(path.join(tempDir, 'contact.md'), '# Contact');

      const files = [
        path.join(tempDir, 'index.md'),
        path.join(tempDir, 'about.md'),
        path.join(tempDir, 'contact.md'),
      ];

      await graph.build(files);

      // When about.md changes, files that reference it should also be re-converted
      const filesToConvert = graph.getFilesToReconvert(path.join(tempDir, 'about.md'));
      expect(filesToConvert).toContain(path.join(tempDir, 'about.md'));
      expect(filesToConvert).toContain(path.join(tempDir, 'index.md'));
    });

    it('should handle transitive dependencies', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'index.md'),
        '# Index\nSee [[Level1]].'
      );
      fs.writeFileSync(
        path.join(tempDir, 'level1.md'),
        '# Level1\nSee [[Level2]].'
      );
      fs.writeFileSync(path.join(tempDir, 'level2.md'), '# Level2');

      const files = [
        path.join(tempDir, 'index.md'),
        path.join(tempDir, 'level1.md'),
        path.join(tempDir, 'level2.md'),
      ];

      await graph.build(files);

      // When level2.md changes, all three should be re-converted
      const filesToConvert = graph.getFilesToReconvert(path.join(tempDir, 'level2.md'));
      expect(filesToConvert.length).toBe(3);
      expect(filesToConvert).toContain(path.join(tempDir, 'level2.md'));
      expect(filesToConvert).toContain(path.join(tempDir, 'level1.md'));
      expect(filesToConvert).toContain(path.join(tempDir, 'index.md'));
    });
  });

  describe('removeFile', () => {
    it('should remove file and update references', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'index.md'),
        '# Index\nSee [[About]].'
      );
      fs.writeFileSync(path.join(tempDir, 'about.md'), '# About');

      const files = [
        path.join(tempDir, 'index.md'),
        path.join(tempDir, 'about.md'),
      ];

      await graph.build(files);

      // Remove about.md
      graph.removeFile(path.join(tempDir, 'about.md'));

      const stats = graph.getStatistics();
      expect(stats.totalFiles).toBe(1);
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'index.md'),
        '# Index\nSee [[About]] and [[Contact]].'
      );
      fs.writeFileSync(
        path.join(tempDir, 'about.md'),
        '# About\nSee [[Contact]].'
      );
      fs.writeFileSync(path.join(tempDir, 'contact.md'), '# Contact');

      const files = [
        path.join(tempDir, 'index.md'),
        path.join(tempDir, 'about.md'),
        path.join(tempDir, 'contact.md'),
      ];

      await graph.build(files);

      const stats = graph.getStatistics();
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalReferences).toBe(3);
    });
  });
});