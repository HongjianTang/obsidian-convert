/**
 * MarkdownLink value object representing standard Markdown link syntax
 */
export class MarkdownLink {
  private constructor(
    public readonly text: string,
    public readonly url: string,
    public readonly title: string | null,
    public readonly isImage: boolean
  ) {}

  /**
   * Parse a markdown link from text
   * Formats: [text](url) or ![alt](url) or [text](url "title")
   */
  static parse(linkText: string): MarkdownLink | null {
    // Match ![alt](url) or [text](url)
    const imageMatch = linkText.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    const linkMatch = linkText.match(/^\[([^\]]*)\]\(([^)]+)\)$/);

    const match = imageMatch || linkMatch;
    if (!match) return null;

    const isImage = !!imageMatch;
    const text = match[1];
    let url = match[2];
    let title: string | null = null;

    // Check for title: url "title"
    const titleMatch = url.match(/^([^\s]+)\s+"([^"]+)"$/);
    if (titleMatch) {
      url = titleMatch[1];
      title = titleMatch[2];
    }

    return new MarkdownLink(text, url, title, isImage);
  }

  /**
   * Check if this link points to an attachment (image, pdf, etc.)
   */
  isAttachment(): boolean {
    // Skip external URLs and anchors
    if (this.url.startsWith('http://') ||
        this.url.startsWith('https://') ||
        this.url.startsWith('#')) {
      return false;
    }

    const attachmentExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp',
      '.pdf', '.mp3', '.mp4', '.wav', '.ogg', '.webm',
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.rar'
    ];
    const lowerUrl = this.url.toLowerCase();
    return attachmentExtensions.some(ext => lowerUrl.endsWith(ext));
  }

  /**
   * Get the file extension of the URL
   */
  getExtension(): string | null {
    const cleanUrl = this.url.split('#')[0].split('?')[0];
    const lastDot = cleanUrl.lastIndexOf('.');
    // Return null if no dot, or dot is at the start (hidden file like .gitignore or relative path ./)
    if (lastDot === -1 || lastDot === 0) return null;
    return cleanUrl.slice(lastDot + 1).toLowerCase();
  }

  /**
   * Get the filename from the URL
   */
  getFilename(): string {
    const cleanUrl = this.url.split('#')[0].split('?')[0];
    const lastSlash = cleanUrl.lastIndexOf('/');
    if (lastSlash === -1) return cleanUrl;
    return cleanUrl.slice(lastSlash + 1);
  }

  /**
   * Convert to Markdown format with new URL
   */
  toMarkdown(newUrl: string): string {
    const titlePart = this.title ? ` "${this.title}"` : '';
    if (this.isImage) {
      return `![${this.text}](${newUrl}${titlePart})`;
    }
    return `[${this.text}](${newUrl}${titlePart})`;
  }

  /**
   * Regex pattern for finding markdown links in content
   */
  static get pattern(): RegExp {
    // Match ![alt](url) or [text](url) - non-greedy
    return /!\[[^\]]*\]\([^)]+\)|\[[^\]]*\]\([^)]+\)/g;
  }
}