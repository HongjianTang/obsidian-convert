import { CalloutConverter } from '../../../../src/domain/callout';

describe('CalloutConverter', () => {
  let converter: CalloutConverter;

  beforeEach(() => {
    converter = new CalloutConverter();
  });

  describe('parseCallouts', () => {
    it('should parse simple callout', () => {
      const content = `> [!note] This is a note
> Some content here`;

      const callouts = converter.parseCallouts(content);

      expect(callouts).toHaveLength(1);
      expect(callouts[0].type).toBe('note');
      expect(callouts[0].title).toBe('This is a note');
      expect(callouts[0].content).toEqual(['Some content here']);
    });

    it('should parse callout without title', () => {
      const content = `> [!warning]
> Warning content`;

      const callouts = converter.parseCallouts(content);

      expect(callouts).toHaveLength(1);
      expect(callouts[0].type).toBe('warning');
      expect(callouts[0].title).toBeNull();
      expect(callouts[0].content).toEqual(['Warning content']);
    });

    it('should parse multi-line callout', () => {
      const content = `> [!tip] Multi-line tip
> First line
> Second line
> Third line`;

      const callouts = converter.parseCallouts(content);

      expect(callouts).toHaveLength(1);
      expect(callouts[0].content).toHaveLength(3);
      expect(callouts[0].content[0]).toBe('First line');
      expect(callouts[0].content[2]).toBe('Third line');
    });

    it('should parse multiple callouts', () => {
      const content = `> [!note] Note 1
> Content 1

Some text between

> [!warning] Warning 1
> Warning content`;

      const callouts = converter.parseCallouts(content);

      expect(callouts).toHaveLength(2);
      expect(callouts[0].type).toBe('note');
      expect(callouts[1].type).toBe('warning');
    });

    it('should parse all callout types', () => {
      const types = ['note', 'warning', 'tip', 'info', 'success', 'failure', 'danger', 'bug', 'example', 'quote'];

      for (const type of types) {
        const content = `> [!${type}] Title`;
        const callouts = converter.parseCallouts(content);
        expect(callouts[0].type).toBe(type);
      }
    });

    it('should normalize callout type aliases', () => {
      const warnContent = `> [!warn] Warning`;
      const todoContent = `> [!todo] Todo`;

      expect(converter.parseCallouts(warnContent)[0].type).toBe('warning');
      expect(converter.parseCallouts(todoContent)[0].type).toBe('note');
    });

    it('should handle Chinese content in callout', () => {
      const content = `> [!NOTE] 这是一个关于常见玩法设计陷阱的研究
> 详细内容在这里`;

      const callouts = converter.parseCallouts(content);

      expect(callouts).toHaveLength(1);
      expect(callouts[0].title).toBe('这是一个关于常见玩法设计陷阱的研究');
      expect(callouts[0].content[0]).toBe('详细内容在这里');
    });

    it('should return empty array for no callouts', () => {
      const content = `Regular text
No callouts here`;

      const callouts = converter.parseCallouts(content);

      expect(callouts).toHaveLength(0);
    });
  });

  describe('convert', () => {
    it('should convert to fumadocs format', () => {
      const content = `> [!note] My Note
> Content here`;

      const result = converter.convert(content, { format: 'fumadocs' });

      expect(result).toContain('<Callout type="note"');
      expect(result).toContain('title="My Note"');
      expect(result).toContain('Content here');
      expect(result).toContain('</Callout>');
    });

    it('should convert to markdown format', () => {
      const content = `> [!warning] Warning
> Be careful`;

      const result = converter.convert(content, { format: 'markdown' });

      expect(result).toContain('> **⚠️ Warning**');
      expect(result).toContain('> Be careful');
    });

    it('should convert to MDX format', () => {
      const content = `> [!tip] Tip
> Useful info`;

      const result = converter.convert(content, { format: 'mdx' });

      expect(result).toContain('<Callout type="tip"');
    });

    it('should handle multiple callouts', () => {
      const content = `> [!note] First
> Content 1

> [!warning] Second
> Content 2`;

      const result = converter.convert(content, { format: 'fumadocs' });

      expect(result).toContain('<Callout type="note"');
      expect(result).toContain('<Callout type="warning"');
    });

    it('should preserve non-callout content', () => {
      const content = `# Heading

> [!note] Note
> Content

Regular paragraph`;

      const result = converter.convert(content, { format: 'markdown' });

      expect(result).toContain('# Heading');
      expect(result).toContain('Regular paragraph');
    });

    it('should escape HTML in title', () => {
      const content = `> [!note] Title with <script>
> Content`;

      const result = converter.convert(content, { format: 'fumadocs' });

      expect(result).toContain('&lt;script&gt;');
      expect(result).not.toContain('<script>');
    });
  });
});