import { parentPort, workerData } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Worker script for parallel file conversion
 * This runs in a separate thread to avoid blocking the main thread
 */

// Types for worker communication
interface WorkerTask {
  id: string;
  type: 'convert' | 'index';
  filePath?: string;
  sourceRoot?: string;
  outputDir?: string;
  content?: string;
}

interface WorkerResult {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
  workerId: number;
}

// Get worker ID from workerData
const workerId = workerData.workerId as number;

// Handle messages from main thread
parentPort!.on('message', async (task: WorkerTask) => {
  try {
    let result: unknown;

    switch (task.type) {
      case 'convert':
        result = await processFile(task);
        break;
      case 'index':
        result = await indexDirectory(task);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    parentPort!.postMessage({
      id: task.id,
      success: true,
      result,
      workerId,
    } as WorkerResult);
  } catch (error) {
    parentPort!.postMessage({
      id: task.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      workerId,
    } as WorkerResult);
  }
});

/**
 * Process a single file
 */
async function processFile(task: WorkerTask): Promise<unknown> {
  const { filePath, sourceRoot, outputDir } = task;

  if (!filePath || !sourceRoot || !outputDir) {
    throw new Error('Missing required fields for convert task');
  }

  // Read file content
  const content = await fs.promises.readFile(filePath, 'utf-8');

  // Process frontmatter
  const frontmatterResult = processFrontmatter(content);

  // Process WikiLinks
  const wikiLinkResult = processWikiLinks(frontmatterResult.content, filePath, sourceRoot);

  // Process callouts
  const calloutResult = processCallouts(wikiLinkResult.content);

  // Calculate output path
  const relativePath = path.relative(sourceRoot, filePath);
  let outputPath = path.resolve(outputDir, relativePath);
  outputPath = outputPath.replace(/\.md$/, '.mdx');

  // Ensure output directory exists
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  // Write output
  await fs.promises.writeFile(outputPath, calloutResult.content, 'utf-8');

  return {
    sourcePath: filePath,
    outputPath,
    wikiLinkCount: wikiLinkResult.convertedCount,
    calloutCount: calloutResult.calloutCount,
    brokenLinks: wikiLinkResult.brokenLinks,
  };
}

/**
 * Index a directory for link resolution
 */
async function indexDirectory(task: WorkerTask): Promise<unknown> {
  const { sourceRoot } = task;

  if (!sourceRoot) {
    throw new Error('Missing sourceRoot for index task');
  }

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') &&
            !['node_modules', '.obsidian'].includes(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await walk(sourceRoot);

  return {
    fileCount: files.length,
    files,
  };
}

/**
 * Process frontmatter - simplified version for worker
 */
function processFrontmatter(content: string): { content: string } {
  const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  const match = content.match(FRONTMATTER_REGEX);

  if (!match) {
    return { content };
  }

  // For now, just keep the frontmatter as-is
  // Full YAML processing would be done by the main thread's FrontmatterProcessor
  return { content };
}

/**
 * Process WikiLinks - simplified version for worker
 */
function processWikiLinks(
  content: string,
  currentFilePath: string,
  sourceRoot: string
): { content: string; convertedCount: number; brokenLinks: string[] } {
  const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  const matches = [...content.matchAll(WIKILINK_PATTERN)];

  let result = content;
  let convertedCount = 0;
  const brokenLinks: string[] = [];

  // For simplicity, just count WikiLinks - full resolution done by main thread
  for (const match of matches) {
    const wikiLink = match[0];
    // Skip attachments (files with extensions)
    if (wikiLink.includes('.')) continue;
    convertedCount++;
  }

  return { content: result, convertedCount, brokenLinks };
}

/**
 * Process callouts - simplified version for worker
 */
function processCallouts(content: string): { content: string; calloutCount: number } {
  const CALLOUT_PATTERN = /^>\s*\[!(\w+)\]\s*(.*)$/gm;
  const matches = [...content.matchAll(CALLOUT_PATTERN)];

  return {
    content,
    calloutCount: matches.length,
  };
}