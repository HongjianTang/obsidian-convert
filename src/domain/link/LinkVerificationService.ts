import * as path from 'path';
import * as fs from 'fs';

/**
 * Represents a verified link with its status
 */
export interface VerifiedLink {
  /** The link text (e.g., "[text](path)") */
  linkText: string;
  /** The resolved file path */
  filePath: string;
  /** Whether the link is valid */
  isValid: boolean;
  /** The source file containing this link */
  sourceFile: string;
}

/**
 * Result of link verification
 */
export interface LinkVerificationResult {
  /** All verified links */
  links: VerifiedLink[];
  /** Total links checked */
  totalCount: number;
  /** Valid links count */
  validCount: number;
  /** Invalid links count */
  invalidCount: number;
}

/**
 * Options for link verification
 */
export interface LinkVerificationOptions {
  /** Output directory to verify links against */
  outputDir: string;
  /** Whether to fix invalid links (default: false) */
  autoFix?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

/**
 * Service for verifying converted links
 */
export class LinkVerificationService {
  private readonly outputDir: string;
  private readonly autoFix: boolean;
  private readonly verbose: boolean;

  constructor(options: LinkVerificationOptions) {
    this.outputDir = options.outputDir;
    this.autoFix = options.autoFix ?? false;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Verify all links in converted markdown files
   */
  async verifyLinks(): Promise<LinkVerificationResult> {
    const verifiedLinks: VerifiedLink[] = [];
    const markdownFiles = await this.findMarkdownFiles(this.outputDir);

    for (const file of markdownFiles) {
      const links = await this.extractLinks(file);
      for (const link of links) {
        const isValid = await this.verifyLink(link, path.dirname(file));
        verifiedLinks.push({
          ...link,
          isValid,
        });
      }
    }

    const validCount = verifiedLinks.filter(l => l.isValid).length;
    const invalidCount = verifiedLinks.filter(l => !l.isValid).length;

    if (this.verbose && invalidCount > 0) {
      console.log(`\n[LinkVerification] Found ${invalidCount} invalid links:`);
      verifiedLinks
        .filter(l => !l.isValid)
        .forEach(l => {
          console.log(`  - ${l.linkText} in ${l.sourceFile} -> ${l.filePath}`);
        });
    }

    return {
      links: verifiedLinks,
      totalCount: verifiedLinks.length,
      validCount,
      invalidCount,
    };
  }

  /**
   * Verify links in a single file
   */
  async verifyFile(filePath: string): Promise<LinkVerificationResult> {
    const verifiedLinks: VerifiedLink[] = [];
    const links = await this.extractLinks(filePath);
    const fileDir = path.dirname(filePath);

    for (const link of links) {
      const isValid = await this.verifyLink(link, fileDir);
      verifiedLinks.push({
        ...link,
        isValid,
      });
    }

    const validCount = verifiedLinks.filter(l => l.isValid).length;
    const invalidCount = verifiedLinks.filter(l => !l.isValid).length;

    return {
      links: verifiedLinks,
      totalCount: verifiedLinks.length,
      validCount,
      invalidCount,
    };
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    const walk = async (currentDir: string) => {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          }
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdx'))) {
          files.push(fullPath);
        }
      }
    };

    await walk(dir);
    return files;
  }

  private async extractLinks(filePath: string): Promise<Omit<VerifiedLink, 'isValid'>[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const links: Omit<VerifiedLink, 'isValid'>[] = [];

    // Match markdown links: [text](path) and ![text](path)
    const linkPattern = /!?\[([^\]]*)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkPattern.exec(content)) !== null) {
      const linkText = match[0];
      const linkPath = match[2];

      // Skip external URLs
      if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
        continue;
      }

      // Skip anchor links
      if (linkPath.startsWith('#')) {
        continue;
      }

      links.push({
        linkText,
        filePath: linkPath,
        sourceFile: filePath,
      });
    }

    return links;
  }

  private async verifyLink(link: Omit<VerifiedLink, 'isValid'>, fileDir: string): Promise<boolean> {
    try {
      // Remove anchor if present
      const pathWithoutAnchor = link.filePath.split('#')[0];
      if (!pathWithoutAnchor) return true;

      // Resolve relative path
      const absolutePath = path.resolve(fileDir, pathWithoutAnchor);

      // Check if file exists
      return fs.existsSync(absolutePath);
    } catch {
      return false;
    }
  }
}