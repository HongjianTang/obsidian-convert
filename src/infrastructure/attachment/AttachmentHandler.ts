import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { WikiLink } from '../../domain/link/WikiLink';
import { MarkdownLink } from '../../domain/link/MarkdownLink';

/**
 * Result of processing an attachment
 */
export interface AttachmentResult {
  /** Original path in the source */
  originalPath: string;
  /** New path in the output directory */
  newPath: string;
  /** Filename in the output (may include hash suffix for deduplication) */
  outputFilename: string;
}

/**
 * Options for attachment handler
 */
export interface AttachmentHandlerOptions {
  /** Output directory for attachments */
  attachmentDir: string;
  /** Base URL path for attachments in markdown (e.g., "/attachments/") */
  attachmentPath?: string;
}

/**
 * Handles attachment detection, copying, and path transformation
 */
export class AttachmentHandler {
  private readonly attachmentPath: string;
  private readonly processedFiles: Map<string, AttachmentResult> = new Map();
  private readonly filenameCounts: Map<string, number> = new Map();

  constructor(private readonly options: AttachmentHandlerOptions) {
    this.attachmentPath = options.attachmentPath || '/attachments/';
  }

  /**
   * Process all attachments in markdown content
   * @param content - Markdown content
   * @param sourceFilePath - Path to the source file (for resolving relative paths)
   * @param sourceDir - Source directory root
   * @returns Transformed content with updated attachment paths
   */
  async processContent(
    content: string,
    sourceFilePath: string,
    sourceDir: string
  ): Promise<string> {
    const sourceFileDir = path.dirname(sourceFilePath);

    // Process WikiLinks first (Obsidian format)
    content = await this.processWikiLinks(content, sourceFileDir, sourceDir);

    // Then process standard Markdown links
    content = await this.processMarkdownLinks(content, sourceFileDir, sourceDir);

    return content;
  }

  /**
   * Copy an attachment to the output directory
   * @param sourcePath - Absolute path to the source attachment
   * @returns Result with original and new paths
   */
  async copyAttachment(sourcePath: string): Promise<AttachmentResult> {
    // Check if already processed
    const cached = this.processedFiles.get(sourcePath);
    if (cached) return cached;

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Attachment not found: ${sourcePath}`);
    }

    // Generate unique filename
    const originalFilename = path.basename(sourcePath);
    const outputFilename = this.getUniqueFilename(sourcePath, originalFilename);

    // Ensure output directory exists
    const outputDir = this.options.attachmentDir;
    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    // Copy file
    const outputPath = path.join(outputDir, outputFilename);
    await fs.promises.copyFile(sourcePath, outputPath);

    // Create result
    const result: AttachmentResult = {
      originalPath: sourcePath,
      newPath: this.attachmentPath + outputFilename,
      outputFilename,
    };

    this.processedFiles.set(sourcePath, result);
    return result;
  }

  /**
   * Get all processed attachments
   */
  getProcessedAttachments(): AttachmentResult[] {
    return Array.from(this.processedFiles.values());
  }

  /**
   * Reset the handler state
   */
  reset(): void {
    this.processedFiles.clear();
    this.filenameCounts.clear();
  }

  private async processWikiLinks(
    content: string,
    sourceFileDir: string,
    sourceDir: string
  ): Promise<string> {
    const matches = content.matchAll(WikiLink.pattern);
    let result = content;

    for (const match of matches) {
      const wikiLink = WikiLink.parse(match[0]);
      if (!wikiLink || !wikiLink.isAttachment()) continue;

      const resolvedPath = this.resolveWikiLinkPath(wikiLink.target, sourceDir);
      if (!resolvedPath || !fs.existsSync(resolvedPath)) continue;

      const attachment = await this.copyAttachment(resolvedPath);
      const replacement = wikiLink.toMarkdown(attachment.newPath);
      result = result.replace(match[0], replacement);
    }

    return result;
  }

  private async processMarkdownLinks(
    content: string,
    sourceFileDir: string,
    sourceDir: string
  ): Promise<string> {
    const matches = content.matchAll(MarkdownLink.pattern);
    let result = content;

    for (const match of matches) {
      const mdLink = MarkdownLink.parse(match[0]);
      if (!mdLink || !mdLink.isAttachment()) continue;

      const resolvedPath = this.resolveMarkdownLinkPath(
        mdLink.url,
        sourceFileDir,
        sourceDir
      );
      if (!resolvedPath || !fs.existsSync(resolvedPath)) continue;

      const attachment = await this.copyAttachment(resolvedPath);
      const replacement = mdLink.toMarkdown(attachment.newPath);
      result = result.replace(match[0], replacement);
    }

    return result;
  }

  private resolveWikiLinkPath(target: string, sourceDir: string): string | null {
    // Try direct path first
    let resolved = path.resolve(sourceDir, target);
    if (fs.existsSync(resolved)) return resolved;

    // Try common attachment directories
    const attachmentDirs = ['attachments', 'assets', 'images', 'files'];
    for (const subdir of attachmentDirs) {
      resolved = path.resolve(sourceDir, subdir, target);
      if (fs.existsSync(resolved)) return resolved;
    }

    // Try searching for the filename
    const filename = path.basename(target);
    const found = this.findFileInSourceDir(filename, sourceDir);
    if (found) return found;

    return null;
  }

  private resolveMarkdownLinkPath(
    url: string,
    sourceFileDir: string,
    sourceDir: string
  ): string | null {
    // Resolve relative to the current file
    const resolved = path.resolve(sourceFileDir, url);
    if (fs.existsSync(resolved)) return resolved;

    // Try relative to source root
    const rootResolved = path.resolve(sourceDir, url);
    if (fs.existsSync(rootResolved)) return rootResolved;

    return null;
  }

  private findFileInSourceDir(filename: string, sourceDir: string): string | null {
    // Simple recursive search (depth limited)
    const maxDepth = 3;

    const search = (dir: string, depth: number): string | null => {
      if (depth > maxDepth) return null;

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name === filename) {
            return path.join(dir, filename);
          }
          if (entry.isDirectory()) {
            const found = search(path.join(dir, entry.name), depth + 1);
            if (found) return found;
          }
        }
      } catch {
        // Ignore permission errors
      }
      return null;
    };

    return search(sourceDir, 0);
  }

  private getUniqueFilename(sourcePath: string, originalFilename: string): string {
    const count = this.filenameCounts.get(originalFilename) || 0;
    this.filenameCounts.set(originalFilename, count + 1);

    if (count === 0) {
      return originalFilename;
    }

    // Add hash suffix for duplicate filenames
    const hash = this.computeFileHash(sourcePath);
    const ext = path.extname(originalFilename);
    const base = path.basename(originalFilename, ext);
    return `${base}-${hash.slice(0, 8)}${ext}`;
  }

  private computeFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return createHash('md5').update(content).digest('hex');
  }
}