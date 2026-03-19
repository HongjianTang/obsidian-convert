import { WikiLink } from './WikiLink';
import { LinkResolver } from './LinkResolver';
import { SourceLocation } from '../error';

/**
 * Options for WikiLink processor
 */
export interface WikiLinkProcessorOptions {
  /** How to handle broken links */
  brokenLinkHandling: 'keep' | 'remove' | 'placeholder';
  /** Placeholder text for broken links (use {target} for the link target) */
  brokenLinkPlaceholder?: string;
  /** Whether to add .md extension to links */
  addMdExtension?: boolean;
  /** Whether to track source locations for errors (default: false) */
  trackLocations?: boolean;
}

/**
 * Result of processing WikiLinks
 */
export interface WikiLinkProcessResult {
  /** Processed content */
  content: string;
  /** Number of links converted */
  convertedCount: number;
  /** Number of broken links found */
  brokenCount: number;
  /** List of broken link targets */
  brokenLinks: string[];
}

/**
 * Processes WikiLinks in markdown content
 */
export class WikiLinkProcessor {
  constructor(
    private readonly linkResolver: LinkResolver,
    private readonly options: WikiLinkProcessorOptions = {
      brokenLinkHandling: 'keep',
      addMdExtension: true,
      trackLocations: false,
    }
  ) {}

  /**
   * Process all WikiLinks in content
   * @param content - Markdown content
   * @param currentFilePath - Path to the current file
   * @param sourceRoot - Root source directory
   */
  process(content: string, currentFilePath: string, sourceRoot: string): WikiLinkProcessResult {
    const matches = [...content.matchAll(WikiLink.pattern)];
    let result = content;
    let convertedCount = 0;
    let brokenCount = 0;
    const brokenLinks: string[] = [];

    // Process matches in reverse order to preserve positions
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const wikiLink = WikiLink.parse(match[0]);

      if (!wikiLink) continue;

      // Skip attachments - they're handled by AttachmentHandler
      if (wikiLink.isAttachment()) continue;

      // Calculate source location if tracking is enabled
      let location: SourceLocation | undefined;
      if (this.options.trackLocations && match.index !== undefined) {
        location = this.calculateLocation(content, match.index);
      }

      // Resolve the link
      const resolution = this.linkResolver.resolve(
        wikiLink.target,
        currentFilePath,
        sourceRoot,
        location
      );

      if (resolution.found && resolution.relativePath) {
        // Convert to markdown link
        let linkPath = resolution.relativePath;

        // URL encode for Chinese characters
        linkPath = this.encodePath(linkPath);

        // Add heading if present
        if (wikiLink.heading) {
          linkPath += `#${this.encodeAnchor(wikiLink.heading)}`;
        }

        const markdownLink = wikiLink.toMarkdown(linkPath);
        result = result.slice(0, match.index) + markdownLink + result.slice(match.index! + match[0].length);
        convertedCount++;
      } else {
        // Handle broken link
        brokenCount++;
        brokenLinks.push(wikiLink.target);

        const replacement = this.handleBrokenLink(wikiLink);
        if (replacement !== match[0]) {
          result = result.slice(0, match.index) + replacement + result.slice(match.index! + match[0].length);
        }
      }
    }

    return {
      content: result,
      convertedCount,
      brokenCount,
      brokenLinks,
    };
  }

  /**
   * Calculate line and column from character index
   */
  private calculateLocation(content: string, index: number): SourceLocation {
    const lines = content.substring(0, index).split(/\r?\n/);
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;
    return { line, column };
  }

  /**
   * Handle a broken link according to options
   */
  private handleBrokenLink(wikiLink: WikiLink): string {
    switch (this.options.brokenLinkHandling) {
      case 'remove':
        return '';
      case 'placeholder':
        const placeholder = this.options.brokenLinkPlaceholder || '[{target}]';
        return placeholder.replace('{target}', wikiLink.displayText || wikiLink.target);
      case 'keep':
      default:
        // Keep the original WikiLink format so users can identify broken links
        return wikiLink.toOriginal();
    }
  }

  /**
   * URL encode path segments for Chinese characters
   */
  private encodePath(path: string): string {
    // Split by / to encode each segment separately
    const segments = path.split('/');
    const encodedSegments = segments.map(segment => {
      // Don't encode the ./ or ../ prefix
      if (segment === '.' || segment === '..') {
        return segment;
      }
      // Encode the segment
      return encodeURIComponent(segment);
    });
    return encodedSegments.join('/');
  }

  /**
   * Encode anchor/heading for URL
   */
  private encodeAnchor(anchor: string): string {
    // For anchors, we typically want lowercase and hyphens
    // But for Chinese, we need to encode
    return encodeURIComponent(anchor.toLowerCase().replace(/\s+/g, '-'));
  }
}