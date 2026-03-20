import * as path from 'path';
import { ErrorReporter, ErrorLevel, ErrorCategory, SourceLocation } from '../error';

/**
 * Conflict resolution strategies for when multiple files match a link target
 */
export type ConflictStrategy = 'nearest' | 'first' | 'warn' | 'error';

/**
 * Enhanced broken link with location info
 */
export interface BrokenLinkInfo {
  /** The link target that wasn't found */
  target: string;
  /** The file where the link was found */
  sourceFile: string;
  /** Location of the link in the source file */
  location: SourceLocation;
  /** Full WikiLink text for context */
  fullLink?: string;
}

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
  /** Whether fuzzy matching was used to find this file */
  hasFuzzyMatch?: boolean;
  /** Levenshtein distance if fuzzy match was used */
  fuzzyMatchDistance?: number;
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
  /** Enable fuzzy matching when exact match fails (default: false) */
  fuzzyMatch?: boolean;
  /** Maximum Levenshtein distance for fuzzy matching (default: 3) */
  fuzzyMaxDistance?: number;
  /** Warn when fuzzy match is used (default: true) */
  warnOnFuzzyMatch?: boolean;
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
  private readonly fuzzyMatch: boolean;
  private readonly fuzzyMaxDistance: number;
  private readonly warnOnFuzzyMatch: boolean;
  private readonly brokenLinks: string[] = [];
  private readonly enhancedBrokenLinks: BrokenLinkInfo[] = [];
  private sourceRoots: string[] = [];
  private errorReporter: ErrorReporter;

  constructor(options: LinkResolverOptions = {}) {
    this.caseInsensitive = options.caseInsensitive ?? true;
    this.warnOnBroken = options.warnOnBroken ?? false;
    this.conflictStrategy = options.conflictStrategy ?? 'nearest';
    this.strictMode = options.strictMode ?? false;
    this.autoIndex = options.autoIndex ?? true;
    this.verbose = options.verbose ?? false;
    this.errorReporter = new ErrorReporter(options.verbose ?? false);
    this.fuzzyMatch = options.fuzzyMatch ?? false;
    this.fuzzyMaxDistance = options.fuzzyMaxDistance ?? 3;
    this.warnOnFuzzyMatch = options.warnOnFuzzyMatch ?? true;
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
   * @param location - Optional source location for error tracking
   */
  resolve(
    target: string,
    currentFilePath: string,
    sourceRoot: string,
    location?: SourceLocation
  ): LinkResolutionResult {
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

    // If there are multiple files with same basename, apply conflict resolution
    // even if an exact path match was found - to ensure we pick the nearest one
    if (allMatches.length > 1) {
      indexedFile = this.resolveConflict(allMatches, currentFilePath, sourceRoot);
    } else if (!indexedFile && allMatches.length === 1) {
      // Single match by basename, use it
      indexedFile = allMatches[0];
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

    // Link not found - try fuzzy matching if enabled
    let fuzzyMatchedFile: IndexedFile | undefined;
    let fuzzyDistance: number | undefined;

    if (this.fuzzyMatch) {
      const fuzzyResult = this.findFuzzyMatch(normalizedTarget, currentFilePath, sourceRoot);
      if (fuzzyResult) {
        fuzzyMatchedFile = fuzzyResult.file;
        fuzzyDistance = fuzzyResult.distance;
      }
    }

    if (fuzzyMatchedFile) {
      this.handleFuzzyMatchWarning(target, fuzzyMatchedFile, fuzzyDistance!);

      const currentDir = path.dirname(currentFilePath);
      const relativePath = this.calculateRelativePath(currentDir, fuzzyMatchedFile.absolutePath, sourceRoot);

      return {
        found: true,
        file: fuzzyMatchedFile,
        relativePath,
        isBroken: false,
        hasConflict: false,
        hasFuzzyMatch: true,
        fuzzyMatchDistance: fuzzyDistance,
      };
    }

    // Link not found
    if (this.strictMode) {
      throw new Error(`Strict mode: broken link [[${target}]] in ${currentFilePath}`);
    }

    if (this.warnOnBroken) {
      console.warn(`Broken link: [[${target}]] in ${currentFilePath}`);
    }

    // Track with enhanced info if location provided
    if (location) {
      this.trackBrokenLink(target, currentFilePath, location);
    } else {
      this.brokenLinks.push(`${currentFilePath}:${target}`);
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
    return [...this.brokenLinks];
  }

  /**
   * Get broken links with enhanced location info
   */
  getEnhancedBrokenLinks(): BrokenLinkInfo[] {
    return [...this.enhancedBrokenLinks];
  }

  /**
   * Track a broken link with full location info
   */
  trackBrokenLink(
    target: string,
    sourceFile: string,
    location: SourceLocation,
    fullLink?: string
  ): void {
    this.brokenLinks.push(`${sourceFile}:${target}`);
    this.enhancedBrokenLinks.push({ target, sourceFile, location, fullLink });

    // Also add to error reporter
    this.errorReporter.addLinkError(
      `Broken link: [[${target}]]`,
      sourceFile,
      location.line,
      location.column,
      target
    );
  }

  /**
   * Get the error reporter for formatted error output
   */
  getErrorReporter(): ErrorReporter {
    return this.errorReporter;
  }

  /**
   * Clear broken links tracking
   */
  clearBrokenLinks(): void {
    this.brokenLinks.length = 0;
    this.enhancedBrokenLinks.length = 0;
    this.errorReporter.clear();
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

  private handleFuzzyMatchWarning(target: string, matchedFile: IndexedFile, distance: number): void {
    if (this.warnOnFuzzyMatch) {
      console.warn(
        `Warning: Link [[${target}]] was resolved using fuzzy match (distance: ${distance}):\n` +
        `  Matched: ${matchedFile.relativePath}`
      );
    }
  }

  /**
   * Find a fuzzy match for the target when exact match fails
   */
  private findFuzzyMatch(target: string, currentFilePath: string, sourceRoot: string): { file: IndexedFile; distance: number } | undefined {
    const targetBasename = this.getBasename(target);
    const targetDir = path.dirname(target);
    const currentDir = path.dirname(currentFilePath);

    let bestMatch: IndexedFile | undefined;
    let bestDistance = Infinity;
    let bestScore = Infinity;

    for (const file of this.fileIndex.values()) {
      // Calculate Levenshtein distance between target basename and file basename
      const distance = this.levenshteinDistance(targetBasename, file.basename);

      // Skip if distance exceeds maximum allowed
      if (distance > this.fuzzyMaxDistance) {
        continue;
      }

      // Calculate path proximity score (lower is better)
      // Prefer files in the same directory or nearby directories
      const fileDir = path.dirname(file.absolutePath);
      const relativeToCurrent = path.relative(currentDir, fileDir);
      const pathProximity = this.calculatePathDistance(relativeToCurrent);

      // Combined score: weighted sum of edit distance and path proximity
      // Path proximity is weighted less (multiplied by 0.5) since it's a secondary factor
      const combinedScore = distance + pathProximity * 0.5;

      if (combinedScore < bestScore) {
        bestScore = combinedScore;
        bestDistance = distance;
        bestMatch = file;
      }
    }

    if (bestMatch) {
      this.log(`Fuzzy match found for [[${target}]]: ${bestMatch.relativePath} (distance: ${bestDistance})`);
      return { file: bestMatch, distance: bestDistance };
    }

    return undefined;
  }

  /**
   * Calculate Levenshtein (edit) distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create a matrix to store distances
    const matrix: number[][] = Array(len1 + 1)
      .fill(null)
      .map(() => Array(len2 + 1).fill(0));

    // Initialize first column
    for (let i = 0; i <= len1; i++) {
      matrix[i][0] = i;
    }

    // Initialize first row
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
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