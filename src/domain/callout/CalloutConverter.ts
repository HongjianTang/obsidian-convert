/**
 * Callout types supported by Obsidian
 */
export type CalloutType =
  | 'note'
  | 'warning'
  | 'tip'
  | 'info'
  | 'success'
  | 'failure'
  | 'danger'
  | 'bug'
  | 'example'
  | 'quote';

/**
 * Parsed callout structure
 */
export interface ParsedCallout {
  /** Callout type */
  type: CalloutType;
  /** Optional title */
  title: string | null;
  /** Content lines */
  content: string[];
  /** Original start line in document */
  startLine: number;
  /** Original end line in document */
  endLine: number;
}

/**
 * Options for callout conversion
 */
export interface CalloutConverterOptions {
  /** Output format */
  format: 'fumadocs' | 'mdx' | 'markdown';
  /** Default title when not specified */
  defaultTitle?: string;
}

/**
 * Converts Obsidian callouts to fumadocs-compatible format
 */
export class CalloutConverter {
  private static readonly CALLOUT_PATTERN = /^>\s*\[!(\w+)\]\s*(.*)$/;

  /**
   * Parse all callouts in a markdown document
   */
  parseCallouts(content: string): ParsedCallout[] {
    const lines = content.split('\n');
    const callouts: ParsedCallout[] = [];

    let i = 0;
    while (i < lines.length) {
      const match = lines[i].match(CalloutConverter.CALLOUT_PATTERN);
      if (match) {
        const type = match[1].toLowerCase() as CalloutType;
        const title = match[2].trim() || null;
        const content: string[] = [];
        const startLine = i;

        // Collect subsequent lines that are part of the callout
        i++;
        while (i < lines.length && lines[i].startsWith('>')) {
          // Remove the '> ' prefix
          const calloutLine = lines[i].slice(1).replace(/^\s?/, '');
          content.push(calloutLine);
          i++;
        }

        callouts.push({
          type: this.normalizeType(type),
          title,
          content,
          startLine,
          endLine: i - 1,
        });
      } else {
        i++;
      }
    }

    return callouts;
  }

  /**
   * Convert all callouts in content to the specified format
   */
  convert(content: string, options: CalloutConverterOptions): string {
    const callouts = this.parseCallouts(content);

    if (callouts.length === 0) {
      return content;
    }

    // Process from end to start to preserve line positions
    let result = content;
    const lines = result.split('\n');

    for (let i = callouts.length - 1; i >= 0; i--) {
      const callout = callouts[i];
      const converted = this.convertCallout(callout, options);

      // Replace lines from startLine to endLine
      lines.splice(callout.startLine, callout.endLine - callout.startLine + 1, ...converted);
    }

    return lines.join('\n');
  }

  /**
   * Convert a single callout to the output format
   */
  private convertCallout(callout: ParsedCallout, options: CalloutConverterOptions): string[] {
    switch (options.format) {
      case 'fumadocs':
      case 'mdx':
        return this.convertToFumadocs(callout);
      case 'markdown':
      default:
        return this.convertToMarkdown(callout);
    }
  }

  /**
   * Convert to fumadocs Callout component format
   */
  private convertToFumadocs(callout: ParsedCallout): string[] {
    const lines: string[] = [];
    const title = callout.title || this.getDefaultTitle(callout.type);

    lines.push(`<Callout type="${callout.type}" title="${this.escapeHtml(title)}">`);

    for (const line of callout.content) {
      lines.push(line);
    }

    lines.push('</Callout>');

    return lines;
  }

  /**
   * Convert to standard markdown blockquote format
   */
  private convertToMarkdown(callout: ParsedCallout): string[] {
    const lines: string[] = [];
    const title = callout.title || this.getDefaultTitle(callout.type);
    const emoji = this.getEmoji(callout.type);

    lines.push(`> **${emoji} ${title}**`);

    for (const line of callout.content) {
      lines.push(`> ${line}`);
    }

    return lines;
  }

  /**
   * Normalize callout type to standard types
   */
  private normalizeType(type: string): CalloutType {
    const typeMap: Record<string, CalloutType> = {
      'note': 'note',
      'warning': 'warning',
      'tip': 'tip',
      'info': 'info',
      'success': 'success',
      'failure': 'failure',
      'danger': 'danger',
      'bug': 'bug',
      'example': 'example',
      'quote': 'quote',
      // Common aliases
      'warn': 'warning',
      'todo': 'note',
      'check': 'success',
      'fail': 'failure',
      'error': 'danger',
      'question': 'tip',
    };

    return typeMap[type.toLowerCase()] || 'note';
  }

  /**
   * Get default title for a callout type
   */
  private getDefaultTitle(type: CalloutType): string {
    const titles: Record<CalloutType, string> = {
      'note': 'Note',
      'warning': 'Warning',
      'tip': 'Tip',
      'info': 'Info',
      'success': 'Success',
      'failure': 'Failure',
      'danger': 'Danger',
      'bug': 'Bug',
      'example': 'Example',
      'quote': 'Quote',
    };
    return titles[type];
  }

  /**
   * Get emoji for callout type (for markdown format)
   */
  private getEmoji(type: CalloutType): string {
    const emojis: Record<CalloutType, string> = {
      'note': 'ℹ️',
      'warning': '⚠️',
      'tip': '💡',
      'info': 'ℹ️',
      'success': '✅',
      'failure': '❌',
      'danger': '🔥',
      'bug': '🐛',
      'example': '📝',
      'quote': '💬',
    };
    return emojis[type];
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}