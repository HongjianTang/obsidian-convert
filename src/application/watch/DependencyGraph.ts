import * as fs from 'fs';
import * as path from 'path';
import { WikiLink } from '../../domain/link';

/**
 * Represents a node in the dependency graph
 */
interface DependencyNode {
  filePath: string;
  absolutePath: string;
  referencedBy: Set<string>;  // Files that reference this file
  references: Set<string>;    // Files that this file references
}

/**
 * Dependency graph that tracks which files reference which other files
 */
export class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();
  private readonly sourceRoot: string;

  constructor(sourceRoot: string) {
    this.sourceRoot = sourceRoot;
  }

  /**
   * Build the dependency graph from all markdown files in the source directory
   */
  async build(files: string[]): Promise<void> {
    this.nodes.clear();

    // Create nodes for all files
    for (const filePath of files) {
      const relativePath = path.relative(this.sourceRoot, filePath);
      this.nodes.set(filePath, {
        filePath,
        absolutePath: filePath,
        referencedBy: new Set(),
        references: new Set(),
      });
    }

    // Parse each file to find references
    for (const filePath of files) {
      await this.parseFileReferences(filePath);
    }
  }

  /**
   * Parse a file and extract all WikiLink references
   */
  private async parseFileReferences(filePath: string): Promise<void> {
    const node = this.nodes.get(filePath);
    if (!node) return;

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const matches = content.matchAll(WikiLink.pattern);

      for (const match of matches) {
        const wikiLink = WikiLink.parse(match[0]);
        if (!wikiLink) continue;

        // Skip attachments
        if (wikiLink.isAttachment()) continue;

        // Normalize target (remove .md extension if present)
        let target = wikiLink.target.endsWith('.md')
          ? wikiLink.target.slice(0, -3)
          : wikiLink.target;

        // Resolve the target to an absolute path
        const resolvedPath = this.resolveTarget(target, filePath);
        if (resolvedPath && this.nodes.has(resolvedPath)) {
          node.references.add(resolvedPath);

          // Add reverse reference
          const targetNode = this.nodes.get(resolvedPath);
          if (targetNode) {
            targetNode.referencedBy.add(filePath);
          }
        }
      }
    } catch {
      // Ignore files that can't be read
    }
  }

  /**
   * Resolve a WikiLink target to an absolute file path
   */
  private resolveTarget(target: string, currentFilePath: string): string | null {
    // Get the basename of the target
    const basename = target.includes('/')
      ? target.substring(target.lastIndexOf('/') + 1)
      : target;

    // Try to find a file with matching basename
    for (const [filePath, node] of this.nodes) {
      const fileBasename = path.basename(filePath, '.md');
      if (fileBasename.toLowerCase() === basename.toLowerCase()) {
        return filePath;
      }
    }

    // Try to find by relative path from current file's directory
    const currentDir = path.dirname(currentFilePath);
    const relativeTarget = path.resolve(currentDir, target + '.md');

    if (this.nodes.has(relativeTarget)) {
      return relativeTarget;
    }

    return null;
  }

  /**
   * Get all files that depend on the given file (files that reference it)
   */
  getDependentFiles(filePath: string): string[] {
    const node = this.nodes.get(filePath);
    if (!node) return [];
    return Array.from(node.referencedBy);
  }

  /**
   * Get all files that the given file depends on (files it references)
   */
  getReferencedFiles(filePath: string): string[] {
    const node = this.nodes.get(filePath);
    if (!node) return [];
    return Array.from(node.references);
  }

  /**
   * Get all files that need to be re-converted when the given file changes
   * This includes the file itself and all files that depend on it
   */
  getFilesToReconvert(filePath: string): string[] {
    const result = new Set<string>();

    // Add the file itself
    result.add(filePath);

    // Add all files that reference this file (directly or indirectly)
    const toProcess = [filePath];
    while (toProcess.length > 0) {
      const current = toProcess.pop()!;
      const node = this.nodes.get(current);
      if (!node) continue;

      for (const dependent of node.referencedBy) {
        if (!result.has(dependent)) {
          result.add(dependent);
          toProcess.push(dependent);
        }
      }
    }

    return Array.from(result);
  }

  /**
   * Update a single file's references in the graph
   */
  async updateFile(filePath: string): Promise<void> {
    // Remove old references
    const node = this.nodes.get(filePath);
    if (node) {
      for (const referenced of node.references) {
        const referencedNode = this.nodes.get(referenced);
        if (referencedNode) {
          referencedNode.referencedBy.delete(filePath);
        }
      }
      node.references.clear();
    }

    // Re-parse the file
    await this.parseFileReferences(filePath);
  }

  /**
   * Remove a file from the graph
   */
  removeFile(filePath: string): void {
    const node = this.nodes.get(filePath);
    if (!node) return;

    // Remove this file from all files that reference it
    for (const referenced of node.references) {
      const referencedNode = this.nodes.get(referenced);
      if (referencedNode) {
        referencedNode.referencedBy.delete(filePath);
      }
    }

    this.nodes.delete(filePath);
  }

  /**
   * Add a new file to the graph
   */
  async addFile(filePath: string): Promise<void> {
    if (this.nodes.has(filePath)) return;

    const relativePath = path.relative(this.sourceRoot, filePath);
    this.nodes.set(filePath, {
      filePath,
      absolutePath: filePath,
      referencedBy: new Set(),
      references: new Set(),
    });

    await this.parseFileReferences(filePath);
  }

  /**
   * Get statistics about the dependency graph
   */
  getStatistics(): {
    totalFiles: number;
    totalReferences: number;
    mostReferenced: { filePath: string; count: number }[];
    mostReferences: { filePath: string; count: number }[];
  } {
    let totalReferences = 0;
    let mostReferenced: { filePath: string; count: number }[] = [];
    let mostReferences: { filePath: string; count: number }[] = [];

    for (const [filePath, node] of this.nodes) {
      totalReferences += node.references.size;

      mostReferenced.push({ filePath, count: node.referencedBy.size });
      mostReferences.push({ filePath, count: node.references.size });
    }

    // Sort and take top 10
    mostReferenced.sort((a, b) => b.count - a.count);
    mostReferences.sort((a, b) => b.count - a.count);

    return {
      totalFiles: this.nodes.size,
      totalReferences,
      mostReferenced: mostReferenced.slice(0, 10),
      mostReferences: mostReferences.slice(0, 10),
    };
  }
}