import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StreamingConverter, StreamConversionOptions } from '../../../src/application/convert/StreamingConverter';
import { LinkResolver } from '../../../src/domain/link/LinkResolver';

describe('StreamingConverter', () => {
  let streamingConverter: StreamingConverter;
  let linkResolver: LinkResolver;
  let tempDir: string;
  let attachmentDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streaming-converter-test-'));
    attachmentDir = path.join(tempDir, 'attachments');
    fs.mkdirSync(attachmentDir, { recursive: true });

    linkResolver = new LinkResolver({ caseInsensitive: true });
    streamingConverter = new StreamingConverter(linkResolver, attachmentDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('convertFileStream', () => {
    it('should convert a small file using streaming', async () => {
      const testFile = path.join(tempDir, 'test.md');
      const content = `---
title: Test Note
---

# Hello World

This is a test note with a [[WikiLink]] and a callout:

> [!note] Note Title
> This is a callout content.

[[AnotherLink]]
`;
      fs.writeFileSync(testFile, content);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
        highWaterMark: 64 * 1024,
      };

      const result = await streamingConverter.convertFileStream(testFile, options);

      expect(result.success).toBe(true);
      expect(result.content).toContain('Hello World');
      expect(result.content).toContain('callout');
    });

    it('should handle large files with streaming', async () => {
      const testFile = path.join(tempDir, 'large.md');

      // Create a file larger than 10MB to test streaming
      const largeContent = '# Large File\n\n' + 'x'.repeat(11 * 1024 * 1024);
      fs.writeFileSync(testFile, largeContent);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
        highWaterMark: 64 * 1024,
      };

      const result = await streamingConverter.convertFileStream(testFile, options);

      expect(result.success).toBe(true);
      expect(result.content.length).toBeGreaterThan(10 * 1024 * 1024);
    });

    it('should handle frontmatter correctly', async () => {
      const testFile = path.join(tempDir, 'frontmatter.md');
      const content = `---
title: Frontmatter Test
tags: [test, sample]
aliases: ["test-alias"]
---

# Content
`;
      fs.writeFileSync(testFile, content);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
      };

      const result = await streamingConverter.convertFileStream(testFile, options);

      expect(result.success).toBe(true);
      expect(result.content).toContain('title:');
      expect(result.content).toContain('tags:');
    });

    it('should handle WikiLinks', async () => {
      // Create a note that the link will reference
      const targetFile = path.join(tempDir, 'target.md');
      fs.writeFileSync(targetFile, '# Target Note');

      const testFile = path.join(tempDir, 'source.md');
      fs.writeFileSync(testFile, '# Source\n\nLink to [[target]]');

      // Build index for link resolution
      await linkResolver.buildIndex([tempDir]);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
      };

      const result = await streamingConverter.convertFileStream(testFile, options);

      expect(result.success).toBe(true);
      expect(result.wikiLinkCount).toBe(1);
    });

    it('should handle callouts', async () => {
      const testFile = path.join(tempDir, 'callouts.md');
      const content = `---
---

# Callout Test

> [!tip] Tip Title
> This is a tip.

> [!warning] Warning
> This is a warning.

> [!danger] Danger
> This is danger.
`;
      fs.writeFileSync(testFile, content);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
      };

      const result = await streamingConverter.convertFileStream(testFile, options);

      expect(result.success).toBe(true);
      expect(result.calloutCount).toBe(3);
    });

    it('should handle files with special characters in frontmatter', async () => {
      const testFile = path.join(tempDir, 'special.md');
      const content = `---
title: "Special: Characters"
description: 'Test with "quotes" and : colons'
---

# Content
`;
      fs.writeFileSync(testFile, content);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
      };

      const result = await streamingConverter.convertFileStream(testFile, options);

      expect(result.success).toBe(true);
    });

    it('should handle Chinese characters in filenames and content', async () => {
      const testFile = path.join(tempDir, '中文笔记.md');
      const content = `---
title: 中文标题
---

# 中文内容

链接到 [[中文笔记]]。
`;
      fs.writeFileSync(testFile, content);

      // Build index
      await linkResolver.buildIndex([tempDir]);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
      };

      const result = await streamingConverter.convertFileStream(testFile, options);

      expect(result.success).toBe(true);
    });
  });

  describe('streamConvert async generator', () => {
    it('should yield chunks for large files', async () => {
      const testFile = path.join(tempDir, 'chunk-test.md');
      const content = '# Chunk Test\n\n' + 'y'.repeat(500 * 1024);
      fs.writeFileSync(testFile, content);

      const options: StreamConversionOptions = {
        sourcePath: testFile,
        sourceRoot: tempDir,
        outputFormat: 'markdown',
        highWaterMark: 64 * 1024,
      };

      const chunks: string[] = [];
      for await (const chunk of streamingConverter.streamConvert(testFile, options)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});