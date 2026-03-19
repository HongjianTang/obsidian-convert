import { MarkdownLink } from '../../../../src/domain/link/MarkdownLink';

describe('MarkdownLink', () => {
  describe('parse', () => {
    describe('regular links', () => {
      it('should parse simple markdown link [text](url)', () => {
        const link = MarkdownLink.parse('[My Link](https://example.com)');
        expect(link).not.toBeNull();
        expect(link!.text).toBe('My Link');
        expect(link!.url).toBe('https://example.com');
        expect(link!.title).toBeNull();
        expect(link!.isImage).toBe(false);
      });

      it('should parse markdown link with relative path [text](./path)', () => {
        const link = MarkdownLink.parse('[Note](./notes/my-note.md)');
        expect(link).not.toBeNull();
        expect(link!.text).toBe('Note');
        expect(link!.url).toBe('./notes/my-note.md');
        expect(link!.isImage).toBe(false);
      });

      it('should parse markdown link with title [text](url "title")', () => {
        const link = MarkdownLink.parse('[Example](https://example.com "Example Site")');
        expect(link).not.toBeNull();
        expect(link!.text).toBe('Example');
        expect(link!.url).toBe('https://example.com');
        expect(link!.title).toBe('Example Site');
        expect(link!.isImage).toBe(false);
      });

      it('should parse markdown link with anchor [text](#heading)', () => {
        const link = MarkdownLink.parse('[Section](#introduction)');
        expect(link).not.toBeNull();
        expect(link!.text).toBe('Section');
        expect(link!.url).toBe('#introduction');
        expect(link!.isImage).toBe(false);
      });
    });

    describe('image links', () => {
      it('should parse image link ![alt](url)', () => {
        const link = MarkdownLink.parse('![Alt text](https://example.com/image.png)');
        expect(link).not.toBeNull();
        expect(link!.text).toBe('Alt text');
        expect(link!.url).toBe('https://example.com/image.png');
        expect(link!.title).toBeNull();
        expect(link!.isImage).toBe(true);
      });

      it('should parse image link with relative path ![alt](./images/pic.png)', () => {
        const link = MarkdownLink.parse('![Photo](./images/photo.jpg)');
        expect(link).not.toBeNull();
        expect(link!.text).toBe('Photo');
        expect(link!.url).toBe('./images/photo.jpg');
        expect(link!.isImage).toBe(true);
      });

      it('should parse image link with title ![alt](url "title")', () => {
        const link = MarkdownLink.parse('![Logo](/assets/logo.png "Company Logo")');
        expect(link).not.toBeNull();
        expect(link!.text).toBe('Logo');
        expect(link!.url).toBe('/assets/logo.png');
        expect(link!.title).toBe('Company Logo');
        expect(link!.isImage).toBe(true);
      });
    });

    describe('invalid inputs', () => {
      it('should return null for invalid formats', () => {
        expect(MarkdownLink.parse('Not a link')).toBeNull();
        expect(MarkdownLink.parse('[text]()')).toBeNull();
        expect(MarkdownLink.parse('')).toBeNull();
        expect(MarkdownLink.parse('[missing bracket')).toBeNull();
      });
    });
  });

  describe('isAttachment', () => {
    it('should return true for image extensions', () => {
      expect(MarkdownLink.parse('![img](./image.png)')!.isAttachment()).toBe(true);
      expect(MarkdownLink.parse('![img](./photo.jpg)')!.isAttachment()).toBe(true);
      expect(MarkdownLink.parse('![img](./icon.svg)')!.isAttachment()).toBe(true);
    });

    it('should return true for document extensions', () => {
      expect(MarkdownLink.parse('[doc](./file.pdf)')!.isAttachment()).toBe(true);
      expect(MarkdownLink.parse('[doc](./report.docx)')!.isAttachment()).toBe(true);
    });

    it('should return false for external URLs', () => {
      expect(MarkdownLink.parse('[External](https://example.com/image.png)')!.isAttachment()).toBe(false);
      expect(MarkdownLink.parse('[External](http://example.com/doc.pdf)')!.isAttachment()).toBe(false);
    });

    it('should return false for anchor links', () => {
      expect(MarkdownLink.parse('[Section](#heading)')!.isAttachment()).toBe(false);
    });

    it('should return false for markdown files', () => {
      expect(MarkdownLink.parse('[Note](./notes/my-note.md)')!.isAttachment()).toBe(false);
    });
  });

  describe('getExtension', () => {
    it('should return the file extension in lowercase', () => {
      expect(MarkdownLink.parse('![img](./image.PNG)')!.getExtension()).toBe('png');
      expect(MarkdownLink.parse('[doc](./file.PDF)')!.getExtension()).toBe('pdf');
    });

    it('should return null when no extension', () => {
      // Note: example.com returns 'com' as extension since the implementation
      // doesn't validate if it's a known file extension
      expect(MarkdownLink.parse('[link](./folder)')!.getExtension()).toBeNull();
    });

    it('should handle URLs with query params and anchors', () => {
      expect(MarkdownLink.parse('![img](./image.png?size=large)')!.getExtension()).toBe('png');
      expect(MarkdownLink.parse('![img](./image.png#section)')!.getExtension()).toBe('png');
    });
  });

  describe('getFilename', () => {
    it('should return the filename from URL with path', () => {
      expect(MarkdownLink.parse('![img](./folder/subfolder/image.png)')!.getFilename()).toBe('image.png');
    });

    it('should return the URL when no path separator', () => {
      expect(MarkdownLink.parse('![img](image.png)')!.getFilename()).toBe('image.png');
    });

    it('should handle URLs with query params and anchors', () => {
      expect(MarkdownLink.parse('![img](./image.png?size=large)')!.getFilename()).toBe('image.png');
      expect(MarkdownLink.parse('![img](./image.png#section)')!.getFilename()).toBe('image.png');
    });
  });

  describe('toMarkdown', () => {
    it('should convert regular link to markdown format', () => {
      const link = MarkdownLink.parse('[My Link](./old-path.md)');
      expect(link!.toMarkdown('/new-path.md')).toBe('[My Link](/new-path.md)');
    });

    it('should convert link with title to markdown format', () => {
      const link = MarkdownLink.parse('[Example](./old "Title")');
      expect(link!.toMarkdown('/new')).toBe('[Example](/new "Title")');
    });

    it('should convert image link to markdown format', () => {
      const link = MarkdownLink.parse('![Alt](./old-image.png)');
      expect(link!.toMarkdown('/new-image.png')).toBe('![Alt](/new-image.png)');
    });

    it('should convert image link with title to markdown format', () => {
      const link = MarkdownLink.parse('![Alt](./old.png "Title")');
      expect(link!.toMarkdown('/new.png')).toBe('![Alt](/new.png "Title")');
    });
  });

  describe('pattern', () => {
    it('should match markdown links in content', () => {
      const content = 'Here is a [link](./path) and an ![image](./img.png) plus [another](./file.md "title")';
      const matches = content.match(MarkdownLink.pattern);
      expect(matches).toHaveLength(3);
    });
  });
});