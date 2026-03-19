import * as fs from 'fs';
import * as path from 'path';
import { FrontmatterProcessor } from '../../domain/frontmatter/FrontmatterProcessor';
import { CalloutConverter } from '../../domain/callout/CalloutConverter';
import { AttachmentHandler } from '../../infrastructure/attachment/AttachmentHandler';
import { LinkResolver } from '../../domain/link/LinkResolver';
import { WikiLink } from '../../domain/link/WikiLink';

/**
 * Options for streaming conversion
 */
export interface StreamConversionOptions {
  /** Chunk size for reading (default: 64KB) */
  highWaterMark?: number;
  /** Source file path for link resolution */
  sourcePath: string;
  /** Source root for link resolution */
  sourceRoot: string;
  /** Output format */
  outputFormat?: 'markdown' | 'mdx' | 'fumadocs';
  /** Broken link handling */
  brokenLinkHandling?: 'keep' | 'remove' | 'placeholder';
}

/**
 * Result of streaming conversion
 */
export interface StreamConversionResult {
  /** Converted content */
  content: string;
  /** Number of WikiLinks processed */
  wikiLinkCount: number;
  /** Number of callouts processed */
  calloutCount: number;
  /** Broken links found */
  brokenLinks: string[];
  /** Whether conversion succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Handles streaming conversion of large markdown files
 * Properly handles chunk boundaries to avoid losing content
 */
export class StreamingConverter {
  private readonly frontmatterProcessor: FrontmatterProcessor;
  private readonly calloutConverter: CalloutConverter;
  private readonly attachmentHandler: AttachmentHandler;

  constructor(linkResolver: LinkResolver, attachmentDir: string) {
    this.frontmatterProcessor = new FrontmatterProcessor();
    this.calloutConverter = new CalloutConverter();

    this.attachmentHandler = new AttachmentHandler({
      attachmentDir,
      attachmentPath: '/attachments/',
    });
  }

  /**
   * Convert a file using streaming
   */
  async convertFileStream(
    filePath: string,
    options: StreamConversionOptions
  ): Promise<StreamConversionResult> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const highWaterMark = options.highWaterMark || 64 * 1024;

      const readStream = fs.createReadStream(filePath, {
        encoding: 'utf-8',
        highWaterMark,
      });

      readStream.on('data', (chunk: string | Buffer) => {
        if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, 'utf-8'));
        } else {
          chunks.push(chunk);
        }
      });

      readStream.on('end', async () => {
        try {
          const fullContent = Buffer.concat(chunks).toString('utf-8');
          const result = await this.processContent(fullContent, {
            ...options,
            sourcePath: filePath,
          });
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      readStream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Process content accumulated from stream
   */
  private async processContent(
    content: string,
    options: StreamConversionOptions
  ): Promise<StreamConversionResult> {
    try {
      let result = content;
      const brokenLinks: string[] = [];

      // 1. Process frontmatter
      result = this.frontmatterProcessor.processContent(result, {
        convertWikiLinks: true,
      });

      // 2. Count and track WikiLinks (simplified for streaming)
      const wikiLinkMatches = [...result.matchAll(WikiLink.pattern)];
      const wikiLinkCount = wikiLinkMatches.length;

      // 3. Process attachments (async)
      result = await this.attachmentHandler.processContent(
        result,
        options.sourcePath,
        options.sourceRoot
      );

      // 4. Process callouts
      const callouts = this.calloutConverter.parseCallouts(result);
      result = this.calloutConverter.convert(result, {
        format: options.outputFormat === 'mdx' ? 'mdx' :
                options.outputFormat === 'fumadocs' ? 'fumadocs' : 'markdown',
      });

      return {
        content: result,
        wikiLinkCount,
        calloutCount: callouts.length,
        brokenLinks,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: '',
        wikiLinkCount: 0,
        calloutCount: 0,
        brokenLinks: [],
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Memory-efficient streaming with backpressure handling
   * This method uses async iteration for better memory control
   */
  async *streamConvert(
    filePath: string,
    options: StreamConversionOptions
  ): AsyncGenerator<string, void, unknown> {
    const highWaterMark = options.highWaterMark || 64 * 1024;
    const readStream = fs.createReadStream(filePath, {
      encoding: 'utf-8',
      highWaterMark,
    });

    let buffer = '';

    for await (const chunk of readStream) {
      buffer += chunk;

      // For large files, yield periodically to prevent memory buildup
      if (buffer.length > highWaterMark * 10) {
        yield buffer;
        buffer = '';
      }
    }

    // Yield remaining content
    if (buffer.length > 0) {
      yield buffer;
    }
  }
}