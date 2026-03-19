import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LinkVerificationService } from '../../../../src/domain/link/LinkVerificationService';

describe('LinkVerificationService', () => {
  let service: LinkVerificationService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-verification-test-'));
    service = new LinkVerificationService({
      outputDir: tempDir,
      verbose: false,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('verifyLinks', () => {
    it('should verify valid links in converted files', async () => {
      // Create output structure
      fs.mkdirSync(path.join(tempDir, 'folder1'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'folder2'), { recursive: true });

      // Create markdown files
      fs.writeFileSync(path.join(tempDir, 'folder1', 'note1.md'), 'Content 1');
      fs.writeFileSync(path.join(tempDir, 'folder2', 'note2.md'), 'Content 2');

      // Create a file with valid links
      const content = `This is a [link to note1](./folder1/note1.md) and another [link](./folder2/note2.md).`;
      fs.writeFileSync(path.join(tempDir, 'index.md'), content);

      const result = await service.verifyLinks();

      expect(result.totalCount).toBe(2);
      expect(result.validCount).toBe(2);
      expect(result.invalidCount).toBe(0);
    });

    it('should detect invalid links', async () => {
      // Create output structure with one missing file
      fs.mkdirSync(path.join(tempDir, 'folder1'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'folder1', 'note1.md'), 'Content 1');

      // Create a file with one valid and one invalid link
      const content = `This is a [valid link](./folder1/note1.md) and [invalid link](./missing/file.md).`;
      fs.writeFileSync(path.join(tempDir, 'index.md'), content);

      const result = await service.verifyLinks();

      expect(result.totalCount).toBe(2);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(1);
      expect(result.links.find(l => !l.isValid)?.filePath).toBe('./missing/file.md');
    });

    it('should skip external URLs', async () => {
      const content = `Check out [Google](https://google.com) for more info.`;
      fs.writeFileSync(path.join(tempDir, 'index.md'), content);

      const result = await service.verifyLinks();

      expect(result.totalCount).toBe(0);
    });

    it('should skip anchor links', async () => {
      const content = `Go to [section](#section) for details.`;
      fs.writeFileSync(path.join(tempDir, 'index.md'), content);

      const result = await service.verifyLinks();

      expect(result.totalCount).toBe(0);
    });

    it('should handle mdx files', async () => {
      fs.mkdirSync(path.join(tempDir, 'docs'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'docs', 'target.md'), 'Content');

      const content = `Link to [target](./docs/target.md)`;
      fs.writeFileSync(path.join(tempDir, 'page.mdx'), content);

      const result = await service.verifyLinks();

      expect(result.totalCount).toBe(1);
      expect(result.validCount).toBe(1);
    });
  });

  describe('verifyFile', () => {
    it('should verify links in a single file', async () => {
      fs.mkdirSync(path.join(tempDir, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'sub', 'target.md'), 'Content');

      // Note: ./sub/target.md is the correct relative path from tempDir/source.md to tempDir/sub/target.md
      const content = `Link to [target](./sub/target.md)`;
      const filePath = path.join(tempDir, 'source.md');
      fs.writeFileSync(filePath, content);

      const result = await service.verifyFile(filePath);

      expect(result.totalCount).toBe(1);
      expect(result.validCount).toBe(1);
      expect(result.invalidCount).toBe(0);
    });

    it('should report invalid links in single file', async () => {
      const content = `Link to [missing](./nonexistent.md)`;
      const filePath = path.join(tempDir, 'source.md');
      fs.writeFileSync(filePath, content);

      const result = await service.verifyFile(filePath);

      expect(result.totalCount).toBe(1);
      expect(result.validCount).toBe(0);
      expect(result.invalidCount).toBe(1);
      expect(result.links[0].isValid).toBe(false);
    });
  });

  describe('handle links with anchors', () => {
    it('should verify links with anchors', async () => {
      fs.writeFileSync(path.join(tempDir, 'note.md'), 'Content');

      const content = `Link to [section](./note.md#section)`;
      fs.writeFileSync(path.join(tempDir, 'index.md'), content);

      const result = await service.verifyLinks();

      expect(result.totalCount).toBe(1);
      expect(result.validCount).toBe(1);
    });
  });

  describe('verbose mode', () => {
    it('should log invalid links when verbose is true', async () => {
      fs.mkdirSync(path.join(tempDir, 'folder'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'folder', 'target.md'), 'Content');

      const content = `Link to [valid](./folder/target.md) and [invalid](./missing.md)`;
      fs.writeFileSync(path.join(tempDir, 'index.md'), content);

      const verboseService = new LinkVerificationService({
        outputDir: tempDir,
        verbose: true,
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await verboseService.verifyLinks();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});