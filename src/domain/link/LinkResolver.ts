import * as path from 'path';

/**
 * Conflict resolution strategies for when multiple files match a link target
 */
export type ConflictStrategy = 'nearest' | 'first' | 'warn' | 'error';

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
  /** Whether there was a conflict (multiple matches) */
  hasConflict?: boolean;
  /** All matching files if there was a conflict */
  conflictingFiles?: IndexedFile[];
}

/**
 * Options for the LinkResolver
 */
export interface LinkResolverOptions {
  /** Case insensitive matching (default: true) */
  caseInsensitive?: boolean;
  /** Warn on broken links */
  warnOnBroken?: boolean;
  /** Conflict resolution strategy (default: 'nearest') */
  conflictStrategy?: ConflictStrategy;
  /** Strict mode - throw error on broken links (default: false) */
  strictMode?: boolean;
  /** Auto build index (default: true) */
  autoIndex?: boolean;
  /** Verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Detailed result for path resolution with conflict info
 */
export interface PathResolutionDetail {
  target: string;
  currentFilePath: string;
  sourceRoot: string;
  matchedFile?: IndexedFile;
  relativePath?: string;
  hasConflict: boolean;
  conflictingFiles?: IndexedFile[];
  resolutionStrategy: ConflictStrategy;
}

/**
 * Resolves WikiLinks to actual file paths with enhanced conflict resolution
 */
export class LinkResolver {
  private fileIndex: Map<string, IndexedFile> = new Map();
  private lowercaseIndex: Map<string, string> = new Map();
  private basenameIndex: Map<string, IndexedFile[]> = new Map();
  private readonly caseInsensitive: boolean;
  private readonly warnOnBroken: boolean;
  private readonly conflictStrategy: ConflictStrategy;
  private readonly strictMode: boolean;
  private readonly autoIndex: boolean;
  private readonly verbose: boolean;
  private readonly brokenLinks: string[] = [];
  private sourceRoots: string[] = [];

  constructor(options: LinkResolverOptions = {}) {
    this.caseInsensitive = options.caseInsensitive ?? true;
    this.warnOnBroken = options.warnOnBroken ?? false;
    this.conflictStrategy = options.conflictStrategy ?? 'nearest';
    this.strictMode = options.strictMode ?? false;
    this.autoIndex = options.autoIndex ?? true;
    this.verbose = options.verbose ?? false;
  }

  /**
   * Build an index of all markdown files in the source directories
   */
  async buildIndex(sourceDirs: string[]): Promise<void> {
    this.fileIndex.clear();
    this.lowercaseIndex.clear();
    this.basenameIndex.clear();
    this.sourceRoots = sourceDirs;

    for (const sourceDir of sourceDirs) {
      await this.indexDirectory(sourceDir, sourceDir);
    }

    this.log(`Built index with ${this.fileIndex.size} files`);
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

    // Find all matches by basename for conflict detection
    const basename = this.getBasename(normalizedTarget);
    const allMatches = this.findAllByBasename(basename);

    // If no exact match but found basename matches, apply conflict resolution
    if (!indexedFile && allMatches.length > 0) {
      indexedFile = this.resolveConflict(allMatches, currentFilePath, sourceRoot);
    }

    if (indexedFile) {
      // Calculate relative path from current file to target
      const currentDir = path.dirname(currentFilePath);
      const relativePath = this.calculateRelativePath(currentDir, indexedFile.absolutePath, sourceRoot);

      const hasConflict = allMatches.length > 1;
      if (hasConflict) {
        this.log(`Conflict detected for [[${target}]]: ${allMatches.length} matches found`);
        this.handleConflictWarning(target, allMatches);
      }

      return {
        found: true,
        file: indexedFile,
        relativePath,
        isBroken: false,
        hasConflict,
        conflictingFiles: hasConflict ? allMatches : undefined,
      };
    }

    // Link not found
    if (this.strictMode) {
      throw new Error(`Strict mode: broken link [[${target}]] in ${currentFilePath}`);
    }

    if (this.warnOnBroken) {
      console.warn(`Broken link: [[${target}]] in ${currentFilePath}`);
    }

    this.brokenLinks.push(`${currentFilePath}:${target}`);

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
    return [...this.brokenLinks];
  }

  /**
   * Clear broken links tracking
   */
  clearBrokenLinks(): void {
    this.brokenLinks.length = 0;
  }

  /**
   * Get resolution details for verbose logging
   */
  getResolutionDetail(target: string, currentFilePath: string, sourceRoot: string): PathResolutionDetail {
    const normalizedTarget = target.endsWith('.md') ? target.slice(0, -3) : target;
    const basename = this.getBasename(normalizedTarget);
    const allMatches = this.findAllByBasename(basename);

    let matchedFile = this.findFile(normalizedTarget);
    if (!matchedFile && allMatches.length > 0) {
      matchedFile = this.resolveConflict(allMatches, currentFilePath, sourceRoot);
    }

    const relativePath = matchedFile
      ? this.calculateRelativePath(path.dirname(currentFilePath), matchedFile.absolutePath, sourceRoot)
      : undefined;

    return {
      target,
      currentFilePath,
      sourceRoot,
      matchedFile,
      relativePath,
      hasConflict: allMatches.length > 1,
      conflictingFiles: allMatches.length > 1 ? allMatches : undefined,
      resolutionStrategy: this.conflictStrategy,
    };
  }

  /**
   * Calculate relative path with proper cross-directory handling
   */
  calculateRelativePath(fromDir: string, toFile: string, sourceRoot: string): string {
    // Normalize paths for cross-platform compatibility
    const normalizedFromDir = this.normalizePath(fromDir);
    const normalizedToFile = this.normalizePath(toFile);
    const normalizedSourceRoot = this.normalizePath(sourceRoot);

    // Calculate relative path from current file's directory to target
    const relativePath = path.relative(normalizedFromDir, normalizedToFile);

    // Normalize to forward slashes for URLs
    let normalizedRelativePath = relativePath.replace(/\\/g, '/');

    // Ensure same-directory links start with ./
    if (!normalizedRelativePath.startsWith('.') && !normalizedRelativePath.startsWith('/')) {
      normalizedRelativePath = './' + normalizedRelativePath;
    }

    this.log(`Path calculation: from=${normalizedFromDir}, to=${normalizedToFile}, result=${normalizedRelativePath}`);

    return normalizedRelativePath;
  }

  /**
   * Verify that a resolved link path actually points to an existing file
   */
  verifyLinkPath(relativePath: string, currentFilePath: string): boolean {
    const currentDir = path.dirname(currentFilePath);
    const absolutePath = path.resolve(currentDir, relativePath);

    try {
      const fs = require('fs');
      return fs.existsSync(absolutePath);
    } catch {
      return false;
    }
  }

  private async indexDirectory(dir: string, rootDir: string): Promise<void> {
    const fs = await import('fs');
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

        // Build basename index for conflict detection
        this.addToBasenameIndex(basename, indexedFile);
      }
    }
  }

  private addToBasenameIndex(basename: string, file: IndexedFile): void {
    const lowerBasename = this.caseInsensitive ? basename.toLowerCase() : basename;
    const existing = this.basenameIndex.get(lowerBasename) || [];
    existing.push(file);
    this.basenameIndex.set(lowerBasename, existing);
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

  private findAllByBasename(basename: string): IndexedFile[] {
    const lowerBasename = this.caseInsensitive ? basename.toLowerCase() : basename;
    return this.basenameIndex.get(lowerBasename) || [];
  }

  private getBasename(target: string): string {
    // Get the last path segment
    const lastSlash = target.lastIndexOf('/');
    return lastSlash >= 0 ? target.slice(lastSlash + 1) : target;
  }

  private resolveConflict(
    matches: IndexedFile[],
    currentFilePath: string,
    sourceRoot: string
  ): IndexedFile | undefined {
    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0];

    switch (this.conflictStrategy) {
      case 'first':
        this.log(`Conflict strategy 'first': selecting first match`);
        return matches[0];

      case 'nearest':
      case 'warn':
        // Find the nearest file based on path similarity
        const currentDir = path.dirname(currentFilePath);
        const nearest = this.findNearestMatch(matches, currentDir);
        this.log(`Conflict strategy 'nearest': selected ${nearest?.relativePath}`);
        return nearest;

      case 'error':
        throw new Error(
          `Link resolution conflict: multiple files match the target. ` +
          `Matches: ${matches.map(f => f.relativePath).join(', ')}`
        );

      default:
        return matches[0];
    }
  }

  private findNearestMatch(matches: IndexedFile[], currentDir: string): IndexedFile | undefined {
    let nearest: IndexedFile | undefined;
    let shortestDistance = Infinity;

    const normalizedCurrentDir = this.normalizePath(currentDir);

    for (const match of matches) {
      const matchDir = path.dirname(match.absolutePath);
      const normalizedMatchDir = this.normalizePath(matchDir);

      // Calculate distance as the number of directory levels
      const relativeToCurrent = path.relative(normalizedCurrentDir, normalizedMatchDir);
      const distance = this.calculatePathDistance(relativeToCurrent);

      // Prefer exact same directory, then parent directories
      if (distance < shortestDistance) {
        shortestDistance = distance;
        nearest = match;
      }
    }

    return nearest;
  }

  private calculatePathDistance(relativePath: string): number {
    if (relativePath === '' || relativePath === '.') return 0;
    const parts = relativePath.split('/').filter(p => p !== '.' && p !== '');
    // Going up (../) costs more than going down
    let cost = 0;
    for (const part of parts) {
      if (part === '..') {
        cost += 10; // Penalty for going up directories
      } else {
        cost += 1;
      }
    }
    return cost;
  }

  private handleConflictWarning(target: string, matches: IndexedFile[]): void {
    if (this.conflictStrategy === 'warn') {
      console.warn(
        `Warning: Link [[${target}]] has multiple matches:\n` +
        matches.map(f => `  - ${f.relativePath}`).join('\n') +
        `\nSelected: ${matches[0].relativePath}`
      );
    }
  }

  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
  }

  private log(message: string): void {
    if (this.verbose) {
      console.log(`[LinkResolver] ${message}`);
    }
  }
}