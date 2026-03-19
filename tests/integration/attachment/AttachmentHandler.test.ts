import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AttachmentHandler } from '../../../src/infrastructure/attachment/AttachmentHandler';

describe('AttachmentHandler', () => {
  let handler: AttachmentHandler;
  let tempDir: string;
  let attachmentDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-test-'));
    sourceDir = path.join(tempDir, 'source');
    attachmentDir = path.join(tempDir, 'attachments');

    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(attachmentDir, { recursive: true });

    handler = new AttachmentHandler({
      attachmentDir,
      attachmentPath: '/attachments/',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('processContent', () => {
    it('should process wiki link attachments', async () => {
      const imageContent = Buffer.from('fake image data');
      const imagePath = path.join(sourceDir, 'image.png');
      fs.writeFileSync(imagePath, imageContent);

      const content = 'Here is an image: ![[image.png]]';
      const result = await handler.processContent(content, path.join(sourceDir, 'note.md'), sourceDir);

      expect(result).toContain('![image.png](/attachments/image.png)');
      expect(result).not.toContain('![[image.png]]');
    });

    it('should process wiki link attachments with display text', async () => {
      const imageContent = Buffer.from('fake image data');
      const imagePath = path.join(sourceDir, 'photo.jpg');
      fs.writeFileSync(imagePath, imageContent);

      const content = '![Photo|My Photo]]';
      const correctedContent = '![[photo.jpg|My Photo]]';
      fs.writeFileSync(imagePath, imageContent);

      const result = await handler.processContent(correctedContent, path.join(sourceDir, 'note.md'), sourceDir);

      expect(result).toContain('![My Photo](/attachments/photo.jpg)');
    });

    it('should process markdown image attachments', async () => {
      const imageContent = Buffer.from('fake image data');
      const imagePath = path.join(sourceDir, 'logo.svg');
      fs.writeFileSync(imagePath, imageContent);

      const content = '![Logo](./logo.svg)';
      const result = await handler.processContent(content, path.join(sourceDir, 'note.md'), sourceDir);

      expect(result).toContain('![Logo](/attachments/logo.svg)');
    });

    it('should process markdown image with title', async () => {
      const imageContent = Buffer.from('fake image data');
      const imagePath = path.join(sourceDir, 'banner.png');
      fs.writeFileSync(imagePath, imageContent);

      const content = '![Banner](./banner.png "Site Banner")';
      const result = await handler.processContent(content, path.join(sourceDir, 'note.md'), sourceDir);

      expect(result).toContain('![Banner](/attachments/banner.png "Site Banner")');
    });

    it('should not modify non-attachment wiki links', async () => {
      const content = 'This links to [[MyNote]] and [[AnotherNote|Display]]';
      const result = await handler.processContent(content, path.join(sourceDir, 'note.md'), sourceDir);

      expect(result).toBe(content);
    });

    it('should not modify non-attachment markdown links', async () => {
      const content = 'Check out [my note](./note.md) and [another](./other.md)';
      const result = await handler.processContent(content, path.join(sourceDir, 'note.md'), sourceDir);

      expect(result).toBe(content);
    });

    it('should skip missing attachments', async () => {
      const content = '![[missing.png]] and ![Missing](./missing.jpg)';
      const result = await handler.processContent(content, path.join(sourceDir, 'note.md'), sourceDir);

      expect(result).toContain('![[missing.png]]');
      expect(result).toContain('![Missing](./missing.jpg)');
    });

    it('should handle attachments in subdirectories', async () => {
      const subDir = path.join(sourceDir, 'notes');
      fs.mkdirSync(subDir, { recursive: true });

      const imageDir = path.join(sourceDir, 'images');
      fs.mkdirSync(imageDir, { recursive: true });

      const imagePath = path.join(imageDir, 'diagram.png');
      fs.writeFileSync(imagePath, Buffer.from('diagram data'));

      const content = '![[diagram.png]]';
      const result = await handler.processContent(content, path.join(subDir, 'note.md'), sourceDir);

      expect(result).toContain('![diagram.png](/attachments/diagram.png)');
    });
  });

  describe('copyAttachment', () => {
    it('should copy file to attachment directory', async () => {
      const imagePath = path.join(sourceDir, 'test.png');
      fs.writeFileSync(imagePath, Buffer.from('test data'));

      const result = await handler.copyAttachment(imagePath);

      expect(result.originalPath).toBe(imagePath);
      expect(result.newPath).toBe('/attachments/test.png');
      expect(result.outputFilename).toBe('test.png');
      expect(fs.existsSync(path.join(attachmentDir, 'test.png'))).toBe(true);
    });

    it('should return cached result for already processed file', async () => {
      const imagePath = path.join(sourceDir, 'cached.png');
      fs.writeFileSync(imagePath, Buffer.from('cached data'));

      const result1 = await handler.copyAttachment(imagePath);
      const result2 = await handler.copyAttachment(imagePath);

      expect(result1).toBe(result2);
    });

    it('should throw error for non-existent file', async () => {
      const imagePath = path.join(sourceDir, 'nonexistent.png');

      await expect(handler.copyAttachment(imagePath)).rejects.toThrow('Attachment not found');
    });

    it('should handle duplicate filenames with hash suffix', async () => {
      const image1Path = path.join(sourceDir, 'dup.png');
      const image2Path = path.join(sourceDir, 'images', 'dup.png');

      fs.mkdirSync(path.dirname(image2Path), { recursive: true });
      fs.writeFileSync(image1Path, Buffer.from('image1 content'));
      fs.writeFileSync(image2Path, Buffer.from('image2 different content'));

      const result1 = await handler.copyAttachment(image1Path);
      const result2 = await handler.copyAttachment(image2Path);

      expect(result1.outputFilename).toBe('dup.png');
      expect(result2.outputFilename).toMatch(/^dup-[a-f0-9]{8}\.png$/);
      expect(result1.outputFilename).not.toBe(result2.outputFilename);
    });
  });

  describe('getProcessedAttachments', () => {
    it('should return empty array when no attachments processed', () => {
      expect(handler.getProcessedAttachments()).toHaveLength(0);
    });

    it('should return all processed attachments', async () => {
      const image1 = path.join(sourceDir, 'img1.png');
      const image2 = path.join(sourceDir, 'img2.jpg');

      fs.writeFileSync(image1, Buffer.from('data1'));
      fs.writeFileSync(image2, Buffer.from('data2'));

      await handler.copyAttachment(image1);
      await handler.copyAttachment(image2);

      const attachments = handler.getProcessedAttachments();

      expect(attachments).toHaveLength(2);
      expect(attachments.map(a => a.outputFilename)).toContain('img1.png');
      expect(attachments.map(a => a.outputFilename)).toContain('img2.jpg');
    });
  });

  describe('reset', () => {
    it('should clear all processed attachments', async () => {
      const image = path.join(sourceDir, 'reset.png');
      fs.writeFileSync(image, Buffer.from('data'));

      await handler.copyAttachment(image);
      expect(handler.getProcessedAttachments()).toHaveLength(1);

      handler.reset();
      expect(handler.getProcessedAttachments()).toHaveLength(0);
    });
  });
});