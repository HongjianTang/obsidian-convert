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

    it('should convert WikiLink with Chinese display text containing spaces', async () => {
      const content = 'Link to [[note1|显示 文本 带空格]]';
      const result = processor.process(content, path.join(tempDir, 'test.md'), tempDir);

      expect(result.content).toContain('[显示 文本 带空格]');
      expect(result.content).not.toContain('[[');
      expect(result.convertedCount).toBe(1);
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

  describe('brokenLinkTarget strategy', () => {
    describe('url strategy', () => {
      it('should generate link pointing to fixed URL', () => {
        const urlProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'url',
            target: '/404',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = urlProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('[nonexistent](/404)');
        expect(result.brokenCount).toBe(1);
      });

      it('should replace {target} template variable', () => {
        const urlProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'url',
            target: '/missing?page={target}',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[missing-note]]';
        const result = urlProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('[missing-note](/missing?page=missing-note)');
      });

      it('should URL encode target in template variable', () => {
        const urlProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'url',
            target: '/missing?ref={target}',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[中文笔记]]';
        const result = urlProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain(encodeURIComponent('中文笔记'));
      });

      it('should use display text if provided', () => {
        const urlProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'url',
            target: '/404',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent|Custom Text]]';
        const result = urlProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('[Custom Text](/404)');
      });
    });

    describe('page strategy', () => {
      it('should generate link pointing to explanation page', () => {
        const pageProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'page',
            target: '/pages/broken-link',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = pageProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('[nonexistent](/pages/broken-link)');
        expect(result.brokenCount).toBe(1);
      });

      it('should support {target} template in page strategy', () => {
        const pageProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'page',
            target: '/pages/broken-link?target={target}',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[missing-page]]';
        const result = pageProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('[missing-page](/pages/broken-link?target=missing-page)');
      });
    });

    describe('grayed strategy', () => {
      it('should generate gray span with broken-link class', () => {
        const grayedProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'grayed',
            target: '/pages/broken-link',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = grayedProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('<span class="broken-link" data-target="nonexistent">nonexistent</span>');
        expect(result.brokenCount).toBe(1);
      });

      it('should URL encode target in data-target attribute', () => {
        const grayedProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'grayed',
            target: '/pages/broken-link',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[中文笔记]]';
        const result = grayedProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain(`data-target="${encodeURIComponent('中文笔记')}"`);
      });

      it('should use display text if provided', () => {
        const grayedProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'grayed',
            target: '/pages/broken-link',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent|Custom Display]]';
        const result = grayedProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('<span class="broken-link" data-target="nonexistent">Custom Display</span>');
      });

      it('should ignore target URL for grayed strategy', () => {
        const grayedProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          brokenLinkTarget: {
            strategy: 'grayed',
            target: '/unused-url',
          },
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = grayedProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        // Should not include the URL, just the span
        expect(result.content).toContain('<span class="broken-link"');
        expect(result.content).not.toContain('/unused-url');
      });
    });

    describe('backward compatibility', () => {
      it('should fallback to keep when brokenLinkTarget config is missing', () => {
        const fallbackProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'brokenLinkTarget',
          // No brokenLinkTarget provided - should fallback to keep
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = fallbackProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        // Should keep the original WikiLink format
        expect(result.content).toContain('[[nonexistent]]');
      });

      it('should still work with existing keep option', () => {
        const keepProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'keep',
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = keepProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('[[nonexistent]]');
      });

      it('should still work with existing remove option', () => {
        const removeProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'remove',
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = removeProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).not.toContain('nonexistent');
        expect(result.content).not.toContain('[[');
      });

      it('should still work with existing placeholder option', () => {
        const placeholderProcessor = new WikiLinkProcessor(resolver, {
          brokenLinkHandling: 'placeholder',
          brokenLinkPlaceholder: '[{target}]',
          addMdExtension: true,
        });

        const content = 'Link to [[nonexistent]]';
        const result = placeholderProcessor.process(content, path.join(tempDir, 'test.md'), tempDir);

        expect(result.content).toContain('[nonexistent]');
      });
    });
  });
});