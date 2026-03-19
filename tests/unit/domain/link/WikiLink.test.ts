import { WikiLink } from '../../../../src/domain/link/WikiLink';

describe('WikiLink', () => {
  describe('parse', () => {
    describe('basic wiki links', () => {
      it('should parse simple wiki link [[target]]', () => {
        const link = WikiLink.parse('[[MyNote]]');
        expect(link).not.toBeNull();
        expect(link!.target).toBe('MyNote');
        expect(link!.displayText).toBeNull();
        expect(link!.heading).toBeNull();
        expect(link!.isEmbed).toBe(false);
      });

      it('should parse wiki link with display text [[target|display]]', () => {
        const link = WikiLink.parse('[[MyNote|Custom Display]]');
        expect(link).not.toBeNull();
        expect(link!.target).toBe('MyNote');
        expect(link!.displayText).toBe('Custom Display');
        expect(link!.heading).toBeNull();
        expect(link!.isEmbed).toBe(false);
      });

      it('should parse wiki link with heading [[target#heading]]', () => {
        const link = WikiLink.parse('[[MyNote#Introduction]]');
        expect(link).not.toBeNull();
        expect(link!.target).toBe('MyNote');
        expect(link!.displayText).toBeNull();
        expect(link!.heading).toBe('Introduction');
        expect(link!.isEmbed).toBe(false);
      });

      it('should parse wiki link with heading and display text [[target#heading|display]]', () => {
        const link = WikiLink.parse('[[MyNote#Introduction|Read Intro]]');
        expect(link).not.toBeNull();
        expect(link!.target).toBe('MyNote');
        expect(link!.displayText).toBe('Read Intro');
        expect(link!.heading).toBe('Introduction');
        expect(link!.isEmbed).toBe(false);
      });
    });

    describe('embed wiki links', () => {
      it('should parse embed wiki link ![[target]]', () => {
        const link = WikiLink.parse('![[image.png]]');
        expect(link).not.toBeNull();
        expect(link!.target).toBe('image.png');
        expect(link!.displayText).toBeNull();
        expect(link!.heading).toBeNull();
        expect(link!.isEmbed).toBe(true);
      });

      it('should parse embed wiki link with display text ![[target|display]]', () => {
        const link = WikiLink.parse('![[image.png|Alt Text]]');
        expect(link).not.toBeNull();
        expect(link!.target).toBe('image.png');
        expect(link!.displayText).toBe('Alt Text');
        expect(link!.isEmbed).toBe(true);
      });
    });

    describe('invalid inputs', () => {
      it('should return null for invalid format', () => {
        expect(WikiLink.parse('Not a wiki link')).toBeNull();
        expect(WikiLink.parse('[[]]')).toBeNull();
        expect(WikiLink.parse('[[missing bracket')).toBeNull();
        expect(WikiLink.parse('missing bracket]]')).toBeNull();
        expect(WikiLink.parse('')).toBeNull();
      });
    });
  });

  describe('isAttachment', () => {
    it('should return true for image extensions', () => {
      expect(WikiLink.parse('[[image.png]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[photo.jpg]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[icon.svg]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[pic.gif]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[img.webp]]')!.isAttachment()).toBe(true);
    });

    it('should return true for document extensions', () => {
      expect(WikiLink.parse('[[document.pdf]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[report.docx]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[data.xlsx]]')!.isAttachment()).toBe(true);
    });

    it('should return true for media extensions', () => {
      expect(WikiLink.parse('[[audio.mp3]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[video.mp4]]')!.isAttachment()).toBe(true);
    });

    it('should return true for archive extensions', () => {
      expect(WikiLink.parse('[[archive.zip]]')!.isAttachment()).toBe(true);
      expect(WikiLink.parse('[[backup.tar]]')!.isAttachment()).toBe(true);
    });

    it('should return false for markdown notes', () => {
      expect(WikiLink.parse('[[MyNote]]')!.isAttachment()).toBe(false);
      expect(WikiLink.parse('[[Another Note.md]]')!.isAttachment()).toBe(false);
    });
  });

  describe('getExtension', () => {
    it('should return the file extension in lowercase', () => {
      expect(WikiLink.parse('[[image.PNG]]')!.getExtension()).toBe('png');
      expect(WikiLink.parse('[[document.PDF]]')!.getExtension()).toBe('pdf');
    });

    it('should return null when no extension', () => {
      expect(WikiLink.parse('[[MyNote]]')!.getExtension()).toBeNull();
    });
  });

  describe('getFilename', () => {
    it('should return the filename from target with path', () => {
      expect(WikiLink.parse('[[folder/subfolder/note]]')!.getFilename()).toBe('note');
    });

    it('should return the target when no path separator', () => {
      expect(WikiLink.parse('[[note]]')!.getFilename()).toBe('note');
    });
  });

  describe('toMarkdown', () => {
    it('should convert regular wiki link to markdown link', () => {
      const link = WikiLink.parse('[[MyNote]]');
      expect(link!.toMarkdown('/notes/MyNote.md')).toBe('[MyNote](/notes/MyNote.md)');
    });

    it('should convert wiki link with display text to markdown link', () => {
      const link = WikiLink.parse('[[MyNote|Custom Display]]');
      expect(link!.toMarkdown('/notes/MyNote.md')).toBe('[Custom Display](/notes/MyNote.md)');
    });

    it('should convert embed wiki link to markdown image', () => {
      const link = WikiLink.parse('![[image.png]]');
      expect(link!.toMarkdown('/attachments/image.png')).toBe('![image.png](/attachments/image.png)');
    });

    it('should convert embed wiki link with display text to markdown image', () => {
      const link = WikiLink.parse('![[image.png|Alt Text]]');
      expect(link!.toMarkdown('/attachments/image.png')).toBe('![Alt Text](/attachments/image.png)');
    });
  });

  describe('toOriginal', () => {
    it('should convert back to original wiki link format', () => {
      const link = WikiLink.parse('[[MyNote]]');
      expect(link!.toOriginal()).toBe('[[MyNote]]');
    });

    it('should preserve display text', () => {
      const link = WikiLink.parse('[[MyNote|Custom Display]]');
      expect(link!.toOriginal()).toBe('[[MyNote|Custom Display]]');
    });

    it('should preserve heading', () => {
      const link = WikiLink.parse('[[MyNote#Introduction]]');
      expect(link!.toOriginal()).toBe('[[MyNote#Introduction]]');
    });

    it('should preserve heading and display text', () => {
      const link = WikiLink.parse('[[MyNote#Introduction|Read Intro]]');
      expect(link!.toOriginal()).toBe('[[MyNote#Introduction|Read Intro]]');
    });

    it('should preserve embed format', () => {
      const link = WikiLink.parse('![[image.png]]');
      expect(link!.toOriginal()).toBe('![[image.png]]');
    });

    it('should preserve embed format with display text', () => {
      const link = WikiLink.parse('![[image.png|Alt Text]]');
      expect(link!.toOriginal()).toBe('![[image.png|Alt Text]]');
    });
  });

  describe('pattern', () => {
    it('should match wiki links in content', () => {
      const content = 'This is a [[link]] and another [[link2|display]] plus ![[image.png]]';
      const matches = content.match(WikiLink.pattern);
      expect(matches).toHaveLength(3);
      expect(matches).toContain('[[link]]');
      expect(matches).toContain('[[link2|display]]');
      expect(matches).toContain('![[image.png]]');
    });
  });

  describe('resolvePath', () => {
    it('should resolve wiki link target to file path', () => {
      const link = WikiLink.parse('[[MyNote]]');
      expect(link).not.toBeNull();

      // Create a mock resolver
      const mockResolver = {
        resolve: jest.fn().mockReturnValue({
          found: true,
          file: {
            absolutePath: '/root/MyNote.md',
            relativePath: 'MyNote.md',
            basename: 'MyNote',
            filename: 'MyNote.md',
          },
          relativePath: './MyNote.md',
          isBroken: false,
        }),
      };

      const result = link!.resolvePath(mockResolver as any, '/root/test.md', '/root');

      expect(mockResolver.resolve).toHaveBeenCalledWith('MyNote', '/root/test.md', '/root');
      expect(result.found).toBe(true);
      expect(result.file?.basename).toBe('MyNote');
    });

    it('should handle heading in resolvePath', () => {
      const link = WikiLink.parse('[[MyNote#Introduction]]');
      expect(link).not.toBeNull();
      expect(link!.heading).toBe('Introduction');
      expect(link!.target).toBe('MyNote');

      const mockResolver = {
        resolve: jest.fn().mockReturnValue({
          found: true,
          file: {
            absolutePath: '/root/MyNote.md',
            relativePath: 'MyNote.md',
            basename: 'MyNote',
            filename: 'MyNote.md',
          },
          relativePath: './MyNote.md',
          isBroken: false,
        }),
      };

      link!.resolvePath(mockResolver as any, '/root/test.md', '/root');

      // Note: resolvePath passes the target (without heading) to the resolver
      // The heading is preserved in the WikiLink and handled separately
      expect(mockResolver.resolve).toHaveBeenCalledWith('MyNote', '/root/test.md', '/root');
    });

    it('should handle broken link in resolvePath', () => {
      const link = WikiLink.parse('[[Nonexistent]]');

      const mockResolver = {
        resolve: jest.fn().mockReturnValue({
          found: false,
          isBroken: true,
        }),
      };

      const result = link!.resolvePath(mockResolver as any, '/root/test.md', '/root');

      expect(result.found).toBe(false);
      expect(result.isBroken).toBe(true);
    });
  });
});