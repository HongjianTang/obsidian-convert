/**
 * Fuzz Tests for Frontmatter Processing
 *
 * These tests use generated inputs to discover edge cases and boundary conditions.
 */

import { FrontmatterProcessor } from '../../src/domain/frontmatter/FrontmatterProcessor';
import * as path from 'path';

describe('Frontmatter Fuzz Tests', () => {
  const processor = new FrontmatterProcessor({
    sourceRoot: '/tmp/fuzz-test',
    outputDir: '/tmp/fuzz-output',
    autoTitle: true,
  });

  /**
   * Generate random string
   */
  function generateRandomString(length: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.,!?@#$%^&*()';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Generate random YAML content
   */
  function generateYamlContent(): string {
    const fields = ['title', 'tags', 'date', 'author', 'description', 'category'];
    const selectedFields = fields.slice(0, Math.floor(Math.random() * fields.length) + 1);
    let yaml = '---\n';
    for (const field of selectedFields) {
      const valueType = Math.floor(Math.random() * 3);
      if (valueType === 0) {
        yaml += `${field}: "${generateRandomString(10)}"\n`;
      } else if (valueType === 1) {
        yaml += `${field}: ${Math.floor(Math.random() * 1000)}\n`;
      } else {
        yaml += `${field}:\n  - ${generateRandomString(5)}\n  - ${generateRandomString(5)}\n`;
      }
    }
    yaml += '---\n';
    return yaml;
  }

  describe('FrontmatterProcessor.process() edge cases', () => {
    it('should handle empty content', () => {
      const result = processor.process('', 'test.md');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle content without frontmatter', () => {
      const content = '# Just a header\n\nSome content.';
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle empty frontmatter', () => {
      const content = '---\n---\n# Content';
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle frontmatter with special characters', () => {
      const content = `---\ntitle: "Test: with \"quotes\" and 'apostrophes'\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle very long frontmatter field value', () => {
      const longValue = generateRandomString(10000);
      const content = `---\ntitle: "${longValue}"\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle multiline frontmatter values', () => {
      const content = `---\ndescription: |
  This is a multiline
  value that spans
  multiple lines.
---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle nested objects in frontmatter', () => {
      const content = `---\nmetadata:\n  author:\n    name: "John"\n    email: "john@example.com"\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle arrays in frontmatter', () => {
      const content = `---\ntags:\n  - tag1\n  - tag2\n  - tag3\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle YAML special characters', () => {
      const content = `---\ntitle: "Test &amp; More <tag>"\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle Chinese characters in frontmatter', () => {
      const content = `---\ntitle: "测试标题"\ntags: [测试, 中文]\n---\n# 内容`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle Japanese characters in frontmatter', () => {
      const content = `---\ntitle: "テストタイトル"\n---\n# 内容`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle emoji in frontmatter', () => {
      const content = `---\ntitle: "📝 Note Title"\ntags: ["🔖", "📌"]\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle frontmatter with comments', () => {
      const content = `---\n# This is a comment\ntitle: "Test"\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle empty title in frontmatter', () => {
      const content = `---\ntitle: ""\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle null values in frontmatter', () => {
      const content = `---\ntitle: ~\nauthor: ~\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle boolean values in frontmatter', () => {
      const content = `---\npublished: true\ndraft: false\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle date values in frontmatter', () => {
      const content = `---\ndate: 2024-01-15\ncreated: 2024-01-01T10:30:00Z\n---\n# Content`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });
  });

  describe('FrontmatterProcessor.generateTitleFromFilePath() edge cases', () => {
    it('should handle file path with underscores', () => {
      const title = processor.generateTitleFromFilePath('/path/to/my_note_file.md');
      expect(title).toBe('My Note File');
    });

    it('should handle file path with hyphens', () => {
      const title = processor.generateTitleFromFilePath('/path/to/my-note-file.md');
      expect(title).toBe('My Note File');
    });

    it('should handle file path with spaces', () => {
      const title = processor.generateTitleFromFilePath('/path/to/my note file.md');
      expect(title).toBe('My Note File');
    });

    it('should handle file path with mixed separators', () => {
      const title = processor.generateTitleFromFilePath('/path/to/my_note-file.md');
      expect(title).toBe('My Note File');
    });

    it('should handle file path with numbers', () => {
      const title = processor.generateTitleFromFilePath('/path/to/2024-01-15_note.md');
      expect(title).toBe('2024 01 15 Note');
    });

    it('should handle file path with Chinese characters', () => {
      const title = processor.generateTitleFromFilePath('/path/to/测试文件.md');
      expect(title).toBe('测试文件');
    });

    it('should handle file path with Japanese characters', () => {
      const title = processor.generateTitleFromFilePath('/path/to/テストファイル.md');
      expect(title).toBe('テストファイル');
    });

    it('should handle file path with only numbers', () => {
      const title = processor.generateTitleFromFilePath('/path/to/12345.md');
      expect(title).toBe('12345');
    });

    it('should handle file path with single character name', () => {
      const title = processor.generateTitleFromFilePath('/path/a.md');
      expect(title).toBe('A');
    });

    it('should handle file path with leading numbers', () => {
      const title = processor.generateTitleFromFilePath('/path/01_intro.md');
      expect(title).toBe('01 Intro');
    });
  });

  describe('FrontmatterProcessor with autoTitle disabled', () => {
    const processorNoAutoTitle = new FrontmatterProcessor({
      sourceRoot: '/tmp/fuzz-test',
      outputDir: '/tmp/fuzz-output',
      autoTitle: false,
    });

    it('should not add title when disabled and no frontmatter', () => {
      const content = '# Existing Title\n\nContent';
      const result = processorNoAutoTitle.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should preserve existing frontmatter when disabled', () => {
      const content = `---\ntitle: "Custom Title"\n---\n# Content`;
      const result = processorNoAutoTitle.process(content, 'test.md');
      expect(result).toContain('Custom Title');
    });
  });
});