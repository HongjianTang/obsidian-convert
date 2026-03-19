import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WikiLinkProcessor, LinkResolver } from '../../../../src/domain/link';

describe('WikiLinkProcessor', () => {
  let processor: WikiLinkProcessor;
  let resolver: LinkResolver;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikilink-processor-test-'));
    resolver = new LinkResolver({ caseInsensitive: true });
    processor = new WikiLinkProcessor(resolver, {
      brokenLinkHandling: 'keep',
      addMdExtension: true,
    });

    // Create test files
    fs.writeFileSync(path.join(tempDir, 'note1.md'), '');
    fs.writeFileSync(path.join(tempDir, '知识库.md'), '');
    fs.mkdirSync(path.join(tempDir, 'folder'));
    fs.writeFileSync(path.join(tempDir, 'folder', 'note2.md'), '');

    await resolver.buildIndex([tempDir]);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('process', () => {
    it('should convert basic WikiLink to markdown link', () => {
      const content = 'This links to [[note1]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('[note1]');
      expect(result.content).toContain('.md');
      expect(result.content).not.toContain('[[');
      expect(result.convertedCount).toBe(1);
    });

    it('should convert WikiLink with display text', () => {
      const content = 'Link to [[note1|Custom Display]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('[Custom Display]');
      expect(result.content).not.toContain('[[');
    });

    it('should convert WikiLink with heading', () => {
      const content = 'Link to [[note1#Introduction]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('#introduction');
    });

    it('should convert Chinese WikiLinks', () => {
      const content = 'Link to [[知识库]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('[知识库]');
      expect(result.content).toContain(encodeURIComponent('知识库'));
      expect(result.convertedCount).toBe(1);
    });

    it('should convert WikiLink with Chinese display text', async () => {
      const content = 'Link to [[Thinking|思考]]';
      // Create the Thinking file
      fs.writeFileSync(path.join(tempDir, 'Thinking.md'), '');
      await resolver.buildIndex([tempDir]);

      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('[思考]');
    });

    it('should skip attachment WikiLinks', () => {
      const content = 'Image: ![[image.png]] and link [[note1]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('![[image.png]]');
      expect(result.content).toContain('[note1]');
      expect(result.convertedCount).toBe(1);
    });

    it('should handle broken links with keep option', () => {
      const content = 'Link to [[nonexistent]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.brokenCount).toBe(1);
      expect(result.brokenLinks).toContain('nonexistent');
      // Keep should preserve the original WikiLink format
      expect(result.content).toContain('[[nonexistent]]');
    });

    it('should handle broken links with remove option', () => {
      const removeProcessor = new WikiLinkProcessor(resolver, {
        brokenLinkHandling: 'remove',
        addMdExtension: true,
      });

      const content = 'Link to [[nonexistent]] and [[note1]]';
      const result = removeProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).not.toContain('nonexistent');
      expect(result.content).toContain('[note1]');
    });

    it('should handle broken links with placeholder option', () => {
      const placeholderProcessor = new WikiLinkProcessor(resolver, {
        brokenLinkHandling: 'placeholder',
        brokenLinkPlaceholder: '[{target}](#)',
        addMdExtension: true,
      });

      const content = 'Link to [[nonexistent]]';
      const result = placeholderProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('[nonexistent](#)');
    });

    it('should handle multiple WikiLinks', () => {
      const content = 'Links: [[note1]], [[知识库]], [[folder/note2]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.convertedCount).toBe(3);
      expect(result.content).not.toContain('[[');
    });

    it('should calculate relative paths correctly', () => {
      const content = 'Link to [[note1]]';
      const result = processor.process(content, path.join(tempDir, 'folder', 'test.md'), tempDir);

      expect(result.content).toContain('../note1.md');
    });
  });

  describe('URL encoding', () => {
    it('should URL encode Chinese characters in paths', () => {
      const content = 'Link to [[知识库]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      // The path should be URL encoded
      expect(result.content).toContain(encodeURIComponent('知识库'));
    });

    it('should URL encode heading anchors', () => {
      const content = 'Link to [[note1#中文标题]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('#' + encodeURIComponent('中文标题'));
    });
  });
});