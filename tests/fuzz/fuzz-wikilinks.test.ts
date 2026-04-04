/**
 * Fuzz Tests for WikiLink Processing
 *
 * These tests use generated inputs to discover edge cases and boundary conditions.
 */

import { WikiLinkProcessor } from '../../src/domain/link/WikiLinkProcessor';
import { WikiLink } from '../../src/domain/link/WikiLink';
import * as path from 'path';

describe('WikiLink Fuzz Tests', () => {
  const processor = new WikiLinkProcessor({
    sourceRoot: '/tmp/fuzz-test',
    outputDir: '/tmp/fuzz-output',
  });

  /**
   * Generate random wiki link variations
   */
  function generateWikiLink(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
    const length = Math.floor(Math.random() * 20) + 1;
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Generate random display text variations
   */
  function generateDisplayText(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.,!?';
    const length = Math.floor(Math.random() * 30) + 1;
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  /**
   * Generate random wiki link content
   */
  function generateWikiLinkContent(): string {
    const patterns = [
      `[[${generateWikiLink()}]]`,
      `[[${generateWikiLink()}|${generateDisplayText()}]]`,
      `[[${generateWikiLink()}#${generateWikiLink()}]]`,
      `[[${generateWikiLink()}|]]`,
      `[[|${generateDisplayText()}]]`,
      `[[${generateWikiLink()}|${generateWikiLink()}]]`,
      `![[${generateWikiLink()}]]`,
      `![[${generateWikiLink()}|${generateDisplayText()}]]`,
    ];
    return patterns[Math.floor(Math.random() * patterns.length)];
  }

  /**
   * Generate random markdown content
   */
  function generateMarkdownContent(length: number): string {
    let content = '';
    while (content.length < length) {
      const lineTypes = [
        `# ${generateDisplayText()}\n`,
        `\n`,
        `${generateDisplayText()}\n`,
        `${generateWikiLinkContent()}\n`,
        `- ${generateDisplayText()}\n`,
        `> ${generateDisplayText()}\n`,
        `\`\`\`\n${generateDisplayText()}\n\`\`\`\n`,
      ];
      content += lineTypes[Math.floor(Math.random() * lineTypes.length)];
    }
    return content.slice(0, length);
  }

  describe('WikiLink.parse() edge cases', () => {
    it('should handle empty string', () => {
      const result = WikiLink.parse('');
      expect(result).toBeDefined();
    });

    it('should handle single character link', () => {
      const result = WikiLink.parse('[[a]]');
      expect(result).toBeDefined();
      expect(result.target).toBe('a');
    });

    it('should handle very long link target', () => {
      const longTarget = 'a'.repeat(1000);
      const result = WikiLink.parse(`[[${longTarget}]]`);
      expect(result).toBeDefined();
      expect(result.target).toBe(longTarget);
    });

    it('should handle unicode characters', () => {
      const result = WikiLink.parse('[[日本語]]');
      expect(result).toBeDefined();
      expect(result.target).toBe('日本語');
    });

    it('should handle emoji in link', () => {
      const result = WikiLink.parse('[[👨‍👩‍👧‍👦]]');
      expect(result).toBeDefined();
    });

    it('should handle special markdown characters', () => {
      const result = WikiLink.parse('[[**bold**]]');
      expect(result).toBeDefined();
    });

    it('should handle nested brackets edge case', () => {
      const result = WikiLink.parse('[[[[[]]]]]');
      expect(result).toBeDefined();
    });

    it('should handle pipe without display text', () => {
      const result = WikiLink.parse('[[note|]]');
      expect(result).toBeDefined();
      expect(result.target).toBe('note');
      expect(result.displayText).toBe('');
    });

    it('should handle anchor only', () => {
      const result = WikiLink.parse('[[#anchor]]');
      expect(result).toBeDefined();
      expect(result.target).toBe('#anchor');
    });

    it('should handle display text with pipe at end', () => {
      const result = WikiLink.parse('[[note|text]]');
      expect(result).toBeDefined();
      expect(result.displayText).toBe('text');
    });

    it('should handle empty brackets', () => {
      const result = WikiLink.parse('[[]]');
      expect(result).toBeDefined();
      expect(result.target).toBe('');
    });

    it('should handle multiple pipes', () => {
      const result = WikiLink.parse('[[a|b|c]]');
      expect(result).toBeDefined();
      // Should parse up to first pipe as target, rest as display
      expect(result.target).toBe('a');
    });

    it('should handle whitespace variations', () => {
      const result = WikiLink.parse('[[ note | display text ]]');
      expect(result).toBeDefined();
    });

    it('should handle newlines in link', () => {
      const result = WikiLink.parse('[[note\n|dis]]');
      expect(result).toBeDefined();
    });

    it('should handle tabs in link', () => {
      const result = WikiLink.parse('[[note\tdisplay]]');
      expect(result).toBeDefined();
    });
  });

  describe('WikiLinkProcessor.process() fuzz tests', () => {
    it('should handle empty content', () => {
      const result = processor.process('', 'test.md');
      expect(result).toBe('');
    });

    it('should handle content with only wiki links', () => {
      const content = '[[link1]][[link2]][[link3]]';
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle deeply nested wiki links', () => {
      const content = '[[[[[[deep]]]]]]';
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle very long content', () => {
      const content = generateMarkdownContent(100000);
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle content with many wiki links', () => {
      let content = '';
      for (let i = 0; i < 1000; i++) {
        content += `[[link${i}]]`;
      }
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });

    it('should handle mixed wiki links and embeds', () => {
      const content = `
# Header

[[Link1]]

![[Embed1]]

[[Link2|Display]]

![[Embed2|text]]

More content.
`;
      const result = processor.process(content, 'test.md');
      expect(result).toBeDefined();
    });
  });

  describe('WikiLink.toMarkdown() edge cases', () => {
    it('should handle empty target', () => {
      const link = new WikiLink({ target: '', displayText: 'empty' });
      const result = link.toMarkdown();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle empty display text', () => {
      const link = new WikiLink({ target: 'note', displayText: '' });
      const result = link.toMarkdown();
      expect(result).toBe('[note]()');
    });

    it('should handle special characters in markdown', () => {
      const link = new WikiLink({ target: 'note', displayText: '[text](url)' });
      const result = link.toMarkdown();
      expect(result).toContain('[text](url)');
    });

    it('should handle very long display text', () => {
      const longText = 'a'.repeat(10000);
      const link = new WikiLink({ target: 'note', displayText: longText });
      const result = link.toMarkdown();
      expect(result).toContain(longText);
    });

    it('should handle anchor in target', () => {
      const link = new WikiLink({ target: 'note#section', displayText: 'Section' });
      const result = link.toMarkdown();
      expect(result).toContain('note#section');
    });
  });
});