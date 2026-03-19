import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a file in the vault index
 */
export interface IndexedFile {
  /** Absolute path to the file */
  absolutePath: string;
  /** Relative path from source root */
  relativePath: string;
  /** Filename without extension */
  basename: string;
  /** Filename with extension */
  filename: string;
}

/**
 * Result of resolving a link
 */
export interface LinkResolutionResult {
  /** Whether the link was found */
  found: boolean;
  /** The resolved file if found */
  file?: IndexedFile;
  /** Relative path to use for the link */
  relativePath?: string;
  /** Whether this is a broken link */
  isBroken: boolean;
}

/**
 * Options for the LinkResolver
 */
export interface LinkResolverOptions {
  /** Case insensitive matching (default: true) */
  caseInsensitive?: boolean;
  /** Warn on broken links */
  warnOnBroken?: boolean;
}

/**
 * Resolves WikiLinks to actual file paths
 */
export class LinkResolver {
  private fileIndex: Map<string, IndexedFile> = new Map();
  private lowercaseIndex: Map<string, string> = new Map();
  private readonly caseInsensitive: boolean;
  private readonly warnOnBroken: boolean;

  constructor(options: LinkResolverOptions = {}) {
    this.caseInsensitive = options.caseInsensitive ?? true;
    this.warnOnBroken = options.warnOnBroken ?? false;
  }

  /**
   * Build an index of all markdown files in the source directories
   */
  async buildIndex(sourceDirs: string[]): Promise<void> {
    this.fileIndex.clear();
    this.lowercaseIndex.clear();

    for (const sourceDir of sourceDirs) {
      await this.indexDirectory(sourceDir, sourceDir);
    }
  }

  /**
   * Resolve a WikiLink target to an indexed file
   * @param target - The WikiLink target (e.g., "MyNote", "folder/MyNote")
   * @param currentFilePath - Path to the current file (for relative resolution)
   * @param sourceRoot - Root source directory
   */
  resolve(target: string, currentFilePath: string, sourceRoot: string): LinkResolutionResult {
    // Normalize target - remove .md extension if present
    let normalizedTarget = target.endsWith('.md') ? target.slice(0, -3) : target;

    // Try exact match first
    let indexedFile = this.findFile(normalizedTarget);

    // Try with .md extension
    if (!indexedFile) {
      indexedFile = this.findFile(normalizedTarget + '.md');
    }

    // Try matching by basename (filename without path)
    if (!indexedFile) {
      indexedFile = this.findByBasename(normalizedTarget);
    }

    if (indexedFile) {
      // Calculate relative path from current file to target
      const currentDir = path.dirname(currentFilePath);
      const relativePath = this.calculateRelativePath(currentDir, indexedFile.absolutePath, sourceRoot);

      return {
        found: true,
        file: indexedFile,
        relativePath,
        isBroken: false,
      };
    }

    // Link not found
    if (this.warnOnBroken) {
      console.warn(`Broken link: [[${target}]] in ${currentFilePath}`);
    }

    return {
      found: false,
      isBroken: true,
    };
  }

  /**
   * Get all indexed files
   */
  getIndexedFiles(): IndexedFile[] {
    return Array.from(this.fileIndex.values());
  }

  /**
   * Get broken links encountered during resolution
   */
  getBrokenLinks(): string[] {
    // This could be expanded to track all broken links
    return [];
  }

  private async indexDirectory(dir: string, rootDir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden and common non-content directories
        if (!entry.name.startsWith('.') &&
            !['node_modules', '.obsidian'].includes(entry.name)) {
          await this.indexDirectory(fullPath, rootDir);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        const filename = entry.name;
        const basename = filename.slice(0, -3); // Remove .md extension

        const indexedFile: IndexedFile = {
          absolutePath: fullPath,
          relativePath,
          basename,
          filename,
        };

        // Index by relative path (without .md)
        const key = relativePath.slice(0, -3); // Remove .md extension
        this.fileIndex.set(key, indexedFile);

        // Build lowercase index for case-insensitive matching
        if (this.caseInsensitive) {
          this.lowercaseIndex.set(key.toLowerCase(), key);
          // Also index by basename
          this.lowercaseIndex.set(`basename:${basename.toLowerCase()}`, key);
        }
      }
    }
  }

  private findFile(key: string): IndexedFile | undefined {
    // Try exact match
    let file = this.fileIndex.get(key);
    if (file) return file;

    // Try case-insensitive match
    if (this.caseInsensitive) {
      const actualKey = this.lowercaseIndex.get(key.toLowerCase());
      if (actualKey) {
        return this.fileIndex.get(actualKey);
      }
    }

    return undefined;
  }

  private findByBasename(basename: string): IndexedFile | undefined {
    if (!this.caseInsensitive) {
      // Search through all files
      for (const file of this.fileIndex.values()) {
        if (file.basename === basename) {
          return file;
        }
      }
      return undefined;
    }

    // Use lowercase index
    const key = this.lowercaseIndex.get(`basename:${basename.toLowerCase()}`);
    if (key) {
      return this.fileIndex.get(key);
    }
    return undefined;
  }

  private calculateRelativePath(fromDir: string, toFile: string, sourceRoot: string): string {
    // Get relative path from source root
    const relativeToRoot = path.relative(sourceRoot, toFile).replace(/\\/g, '/');

    // For fumadocs/standard markdown, we want paths relative to the file structure
    // Use ./ prefix for same-directory links, or relative path for cross-directory
    const fromRelative = path.relative(sourceRoot, fromDir).replace(/\\/g, '/');

    if (fromRelative === '' || fromRelative === '.') {
      // From root, just use the relative path
      return './' + relativeToRoot;
    }

    // Calculate relative path from current file's directory to target
    const relativePath = path.relative(fromRelative, relativeToRoot).replace(/\\/g, '/');

    // Ensure it starts with ./ or ../
    if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
      return './' + relativePath;
    }

    return relativePath;
  }
}