/**
 * WikiLink value object representing Obsidian [[link]] syntax
 */
export class WikiLink {
  private constructor(
    public readonly target: string,
    public readonly displayText: string | null,
    public readonly heading: string | null,
    public readonly isEmbed: boolean
  ) {}

  /**
   * Parse a wiki link from text
   * Formats: [[target]], [[target|display]], [[target#heading]], [[target#heading|display]]
   * Embeds: ![[target]], ![[target|display]], etc.
   */
  static parse(text: string): WikiLink | null {
    // Match both [[...]] and ![[...]] patterns
    const embedMatch = text.match(/^!\[\[([^\]]+)\]\]$/);
    const linkMatch = text.match(/^\[\[([^\]]+)\]\]$/);

    const match = embedMatch || linkMatch;
    if (!match) return null;

    const isEmbed = !!embedMatch;
    const content = match[1];

    // Parse: target#heading|display or target|display or target#heading
    let target = content;
    let displayText: string | null = null;
    let heading: string | null = null;

    // Check for display text (|display)
    const pipeIndex = content.indexOf('|');
    if (pipeIndex !== -1) {
      displayText = content.slice(pipeIndex + 1);
      target = content.slice(0, pipeIndex);
    }

    // Check for heading (#heading)
    const hashIndex = target.indexOf('#');
    if (hashIndex !== -1) {
      heading = target.slice(hashIndex + 1);
      target = target.slice(0, hashIndex);
    }

    return new WikiLink(target, displayText, heading, isEmbed);
  }

  /**
   * Check if this wiki link points to an attachment (image, pdf, etc.)
   */
  isAttachment(): boolean {
    const attachmentExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp',
      '.pdf', '.mp3', '.mp4', '.wav', '.ogg', '.webm',
      '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.rar'
    ];
    const lowerTarget = this.target.toLowerCase();
    return attachmentExtensions.some(ext => lowerTarget.endsWith(ext));
  }

  /**
   * Get the file extension of the target
   */
  getExtension(): string | null {
    const lastDot = this.target.lastIndexOf('.');
    if (lastDot === -1) return null;
    return this.target.slice(lastDot + 1).toLowerCase();
  }

  /**
   * Convert to Markdown format
   */
  toMarkdown(newPath: string): string {
    const text = this.displayText || this.getFilename();
    if (this.isEmbed) {
      return `![${text}](${newPath})`;
    }
    return `[${text}](${newPath})`;
  }

  /**
   * Get the filename from the target
   */
  getFilename(): string {
    const lastSlash = this.target.lastIndexOf('/');
    if (lastSlash === -1) return this.target;
    return this.target.slice(lastSlash + 1);
  }

  /**
   * Convert back to original WikiLink format
   */
  toOriginal(): string {
    let content = this.target;
    if (this.heading) {
      content += `#${this.heading}`;
    }
    if (this.displayText) {
      content += `|${this.displayText}`;
    }
    if (this.isEmbed) {
      return `![[${content}]]`;
    }
    return `[[${content}]]`;
  }

  /**
   * Regex pattern for finding wiki links in content
   */
  static get pattern(): RegExp {
    // Match [[...]] or ![[...]]
    return /!\[\[[^\]]+\]\]|\[\[[^\]]+\]\]/g;
  }
}