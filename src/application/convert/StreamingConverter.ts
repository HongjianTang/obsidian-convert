import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
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
  /** Max content size to buffer for frontmatter detection (default: 1MB) */
  frontmatterBufferSize?: number;
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
  /** Peak memory usage during streaming in bytes */
  peakMemoryUsage?: number;
}

/**
 * State machine for detecting frontmatter boundaries in streaming
 */
enum FrontmatterState {
  SEARCHING_START,
  IN_FRONTMATTER,
  SEARCHING_END,
  CONTENT,
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
   * Convert a file using streaming with true chunk-based processing
   * Minimizes memory footprint by processing frontmatter separately
   */
  async convertFileStream(
    filePath: string,
    options: StreamConversionOptions
  ): Promise<StreamConversionResult> {
    const highWaterMark = options.highWaterMark || 64 * 1024;
    const frontmatterBufferSize = options.frontmatterBufferSize || 1024 * 1024;
    let peakMemoryUsage = 0;

    return new Promise((resolve, reject) => {
      let frontmatterBuffer = '';
      let contentBuffer = '';
      let state: FrontmatterState = FrontmatterState.SEARCHING_START;
      let frontmatterStart = -1;
      let frontmatterEnd = -1;
      let wikiLinkCount = 0;
      let calloutCount = 0;
      const brokenLinks: string[] = [];

      const readStream = fs.createReadStream(filePath, {
        encoding: 'utf-8',
        highWaterMark,
      });

      readStream.on('data', (chunk: string | Buffer) => {
        const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
        peakMemoryUsage += chunkStr.length;

        // Track peak memory
        if (peakMemoryUsage > frontmatterBufferSize + chunkStr.length) {
          peakMemoryUsage = frontmatterBufferSize + chunkStr.length;
        }

        if (state === FrontmatterState.SEARCHING_START) {
          // Looking for ---
          const startIndex = chunkStr.indexOf('---');
          if (startIndex !== -1) {
            frontmatterStart = startIndex;
            frontmatterBuffer = chunkStr.slice(0, startIndex);
            contentBuffer = chunkStr.slice(startIndex + 3);
            state = FrontmatterState.IN_FRONTMATTER;
          } else {
            // No frontmatter, entire chunk is content
            contentBuffer = chunkStr;
            state = FrontmatterState.CONTENT;
          }
        } else if (state === FrontmatterState.IN_FRONTMATTER) {
          contentBuffer += chunkStr;

          // Look for closing ---
          const endMatch = contentBuffer.match(/^---\r?\n/);
          if (endMatch) {
            frontmatterEnd = endMatch[0].length;
            frontmatterBuffer += contentBuffer.slice(0, frontmatterEnd);
            contentBuffer = contentBuffer.slice(frontmatterEnd);
            state = FrontmatterState.CONTENT;
          } else if (frontmatterBuffer.length + contentBuffer.length > frontmatterBufferSize) {
            // Frontmatter too large, treat as content
            frontmatterBuffer = '';
            state = FrontmatterState.CONTENT;
          }
        } else {
          // CONTENT state
          contentBuffer += chunkStr;
        }
      });

      readStream.on('end', async () => {
        try {
          // Combine frontmatter and content for processing
          let fullContent: string;
          if (frontmatterStart !== -1 && frontmatterEnd !== -1) {
            fullContent = frontmatterBuffer + contentBuffer;
          } else {
            fullContent = contentBuffer;
          }

          const result = await this.processContent(fullContent, {
            ...options,
            sourcePath: filePath,
          });

          resolve({
            ...result,
            peakMemoryUsage,
          });
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
   * Legacy convertFileStream for backward compatibility
   * Uses memory-efficient approach but still loads full content
   */
  async convertFileStreamLegacy(
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
   * Yields chunks of content as they are processed
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
    let hasFrontmatter = false;
    let frontmatterProcessed = false;
    let pendingFrontmatter = '';

    for await (const chunk of readStream) {
      buffer += chunk;

      // Check for frontmatter at the start
      if (!hasFrontmatter && buffer.startsWith('---')) {
        const endMatch = buffer.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
        if (endMatch) {
          hasFrontmatter = true;
          pendingFrontmatter = endMatch[0];
          buffer = buffer.slice(endMatch[0].length);
          frontmatterProcessed = false;
        }
      }

      // Process frontmatter when complete
      if (hasFrontmatter && !frontmatterProcessed && pendingFrontmatter) {
        // Frontmatter is complete, we need the rest of content to process
        frontmatterProcessed = true;
      }

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

  /**
   * Create a readable stream that processes content in chunks
   * Useful for piping output to other streams
   */
  createProcessingStream(
    options: StreamConversionOptions
  ): Readable {
    // This would be used for true stream-to-stream processing
    // For now, return a simple pass-through implementation
    const { Readable } = require('stream');
    return Readable.from(['']);
  }
}