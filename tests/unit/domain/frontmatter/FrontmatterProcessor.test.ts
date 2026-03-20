import { FrontmatterProcessor } from '../../../../src/domain/frontmatter';

describe('FrontmatterProcessor', () => {
  let processor: FrontmatterProcessor;

  beforeEach(() => {
    processor = new FrontmatterProcessor();
  });

  describe('constructor', () => {
    it('should default autoTitle to true', () => {
      const defaultProcessor = new FrontmatterProcessor();
      const content = '# No frontmatter\n\nContent';
      const result = defaultProcessor.processContent(content, {}, '/path/to/my_note.md');
      expect(result).toContain('title: My Note');
    });

    it('should accept autoTitle: false in constructor', () => {
      const disabledProcessor = new FrontmatterProcessor({ autoTitle: false });
      const content = '# No frontmatter\n\nContent';
      const result = disabledProcessor.processContent(content, {}, '/path/to/my_note.md');
      expect(result).not.toContain('title:');
    });
  });

  describe('auto-title generation', () => {
    // AC1: File without frontmatter - auto-generate frontmatter with title
    it('AC1: should auto-generate frontmatter with title when file has no frontmatter', () => {
      const content = '# Hello World\n\nContent here';
      const result = processor.processContent(content, {}, '/path/to/my_note.md');

      expect(result).toMatch(/^---\ntitle: My Note\n---\n/);
      expect(result).toContain('# Hello World');
    });

    // AC2: File with frontmatter but no title - add title
    it('AC2: should add title to existing frontmatter when title is missing', () => {
      const content = `---
tags:
  - note
---
# Content`;
      const result = processor.processContent(content, {}, '/path/to/my_note.md');

      expect(result).toContain('title: My Note');
      expect(result).toContain('tags:');
    });

    // AC3: File with title - keep original title
    it('AC3: should preserve existing title without modification', () => {
      const content = `---
title: Existing Title
tags:
  - note
---
# Content`;
      const result = processor.processContent(content, {}, '/path/to/my_note.md');

      expect(result).toContain('title: Existing Title');
      expect(result).not.toContain('title: My Note');
    });

    // AC4: Filename conversion (underscores, spaces, hyphens)
    it('AC4: should convert underscores to spaces in filename for title', () => {
      const content = '# Content';
      const result = processor.processContent(content, {}, '/path/to/my_note.md');
      expect(result).toContain('title: My Note');
    });

    it('AC4: should convert hyphens to spaces in filename for title', () => {
      const content = '# Content';
      const result = processor.processContent(content, {}, '/path/to/hello-world.md');
      expect(result).toContain('title: Hello World');
    });

    it('AC4: should handle multiple underscores and spaces', () => {
      const content = '# Content';
      const result = processor.processContent(content, {}, '/path/to/my__note___file.md');
      expect(result).toContain('title: My Note File');
    });

    it('AC4: should capitalize first letter of each word', () => {
      const content = '# Content';
      const result = processor.processContent(content, {}, '/path/to/lowercase-note.md');
      expect(result).toContain('title: Lowercase Note');
    });

    // AC5: Config can disable the feature via processContent options
    it('AC5: should respect autoTitle: false in processContent options', () => {
      const content = '# No frontmatter\n\nContent';
      const result = processor.processContent(content, { autoTitle: false }, '/path/to/my_note.md');
      expect(result).not.toContain('title:');
    });

    it('AC5: should generate title when autoTitle: true even if constructor is false', () => {
      const disabledProcessor = new FrontmatterProcessor({ autoTitle: false });
      const content = '# No frontmatter\n\nContent';
      const result = disabledProcessor.processContent(content, { autoTitle: true }, '/path/to/my_note.md');
      expect(result).toContain('title: My Note');
    });
  });

  describe('generateTitleFromFilePath', () => {
    it('should convert underscores to spaces', () => {
      const title = processor.generateTitleFromFilePath('/path/to/my_note.md');
      expect(title).toBe('My Note');
    });

    it('should convert hyphens to spaces', () => {
      const title = processor.generateTitleFromFilePath('/path/to/hello-world.md');
      expect(title).toBe('Hello World');
    });

    it('should handle multiple separators', () => {
      const title = processor.generateTitleFromFilePath('my__note---file.md');
      expect(title).toBe('My Note File');
    });

    it('should trim whitespace', () => {
      const title = processor.generateTitleFromFilePath('  my note  ');
      expect(title).toBe('My Note');
    });

    it('should capitalize first letter of each word', () => {
      const title = processor.generateTitleFromFilePath('hello world');
      expect(title).toBe('Hello World');
    });
  });

  describe('parse', () => {
    it('should parse basic frontmatter', () => {
      const content = `---
title: My Note
description: A description
---
# Content`;

      const result = processor.parse(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.frontmatter.title).toBe('My Note');
      expect(result.frontmatter.description).toBe('A description');
    });

    it('should parse frontmatter with arrays', () => {
      const content = `---
title: Note
tags:
  - tag1
  - tag2
aliases:
  - alias1
  - alias2
---
Content`;

      const result = processor.parse(content);

      expect(result.frontmatter.tags).toEqual(['tag1', 'tag2']);
      expect(result.frontmatter.aliases).toEqual(['alias1', 'alias2']);
    });

    it('should parse frontmatter with WikiLinks', () => {
      const content = `---
title: Note
parents:
  - "[[玩法设计]]"
  - "[[游戏设计]]"
children:
  - "[[子页面1]]"
---
Content`;

      const result = processor.parse(content);

      expect(result.frontmatter.parents).toEqual(['[[玩法设计]]', '[[游戏设计]]']);
      expect(result.frontmatter.children).toEqual(['[[子页面1]]']);
    });

    it('should parse frontmatter with custom fields', () => {
      const content = `---
title: Note
form: "[[MOC]]"
layout: gallery
ignore-children: true
games:
  - "[[Game1]]"
---
Content`;

      const result = processor.parse(content);

      expect(result.frontmatter.form).toBe('[[MOC]]');
      expect(result.frontmatter.layout).toBe('gallery');
      expect(result.frontmatter.ignoreChildren).toBe(true);
      expect(result.frontmatter.games).toEqual(['[[Game1]]']);
    });

    it('should handle empty frontmatter', () => {
      const content = `---
---

Content`;

      const result = processor.parse(content);

      expect(result.hasFrontmatter).toBe(true);
      expect(result.frontmatter.raw).toEqual({});
    });

    it('should handle content without frontmatter', () => {
      const content = `# No frontmatter here

Just content`;

      const result = processor.parse(content);

      expect(result.hasFrontmatter).toBe(false);
    });

    it('should handle single quotes in frontmatter', () => {
      const content = `---
title: Note
parents:
  - '[[Parent]]'
---
Content`;

      const result = processor.parse(content);

      // YAML parser removes the single quotes
      expect(result.frontmatter.parents).toEqual(['[[Parent]]']);
    });
  });

  describe('convert', () => {
    it('should convert basic frontmatter', () => {
      const frontmatter = {
        raw: {},
        title: 'My Note',
        description: 'Description',
      };

      const result = processor.convert(frontmatter);

      expect(result).toContain('title: My Note');
      expect(result).toContain('description: Description');
      expect(result).toMatch(/^---\n[\s\S]*\n---\n$/);
    });

    it('should convert WikiLinks in arrays', () => {
      const frontmatter = {
        raw: {},
        parents: ['[[玩法设计]]', '[[游戏设计]]'],
        children: ['[[Child]]'],
      };

      const result = processor.convert(frontmatter, { convertWikiLinks: true });

      expect(result).toContain('- 玩法设计');
      expect(result).toContain('- 游戏设计');
      expect(result).toContain('- Child');
    });

    it('should not convert WikiLinks when option is false', () => {
      const frontmatter = {
        raw: {},
        parents: ['[[玩法设计]]'],
      };

      const result = processor.convert(frontmatter, { convertWikiLinks: false });

      expect(result).toContain('[[玩法设计]]');
    });

    it('should handle tags', () => {
      const frontmatter = {
        raw: {},
        tags: ['tag1', 'tag2'],
      };

      const result = processor.convert(frontmatter);

      expect(result).toContain('tags:');
      expect(result).toContain('- tag1');
      expect(result).toContain('- tag2');
    });

    it('should omit undefined fields', () => {
      const frontmatter = {
        raw: {},
        title: 'Note',
      };

      const result = processor.convert(frontmatter);

      expect(result).not.toContain('description:');
      expect(result).not.toContain('tags:');
    });
  });

  describe('processContent', () => {
    it('should process content with frontmatter', () => {
      const content = `---
title: Original
parents:
  - "[[Parent]]"
---
# Content`;

      const result = processor.processContent(content, { convertWikiLinks: true });

      expect(result).toContain('title: Original');
      expect(result).toContain('- Parent');
      expect(result).toContain('# Content');
    });

    it('should preserve content without frontmatter', () => {
      const content = `# No frontmatter

Content here`;

      const result = processor.processContent(content);

      expect(result).toBe(content);
    });
  });

  describe('extractWikiLinkTarget', () => {
    it('should extract target from WikiLink', () => {
      expect(processor.extractWikiLinkTarget('[[Target]]')).toBe('Target');
      expect(processor.extractWikiLinkTarget('"[[Target]]"')).toBe('Target');
      expect(processor.extractWikiLinkTarget("'[[Target]]'")).toBe('Target');
    });

    it('should extract target from WikiLink with display text', () => {
      expect(processor.extractWikiLinkTarget('[[Target|Display]]')).toBe('Target');
      expect(processor.extractWikiLinkTarget('"[[Target|Display]]"')).toBe('Target');
    });

    it('should return original value if not WikiLink', () => {
      expect(processor.extractWikiLinkTarget('Plain Text')).toBe('Plain Text');
      expect(processor.extractWikiLinkTarget('123')).toBe('123');
    });
  });
});