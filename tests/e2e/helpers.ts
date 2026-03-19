/**
 * E2E Test Runner for obsidian-convert
 *
 * This module provides utilities for running end-to-end tests
 * on the obsidian-convert tool using test fixtures.
 */

import * as fs from 'fs';
import * as path from 'path';
import { E2ETestCase, ComparisonResult, E2ETestSummary } from './types';

/**
 * Path resolver for test fixtures
 */
export const TestPaths = {
  FIXTURES_DIR: path.join(__dirname, '../fixtures'),
  VAULT_DIR: path.join(__dirname, '../fixtures/vault'),
  EXPECTED_DIR: path.join(__dirname, '../fixtures/expected'),
  OUTPUT_DIR: path.join(__dirname, '../fixtures/output'),

  getVaultPath(relativePath: string): string {
    return path.join(this.VAULT_DIR, relativePath);
  },

  getExpectedPath(relativePath: string): string {
    return path.join(this.EXPECTED_DIR, relativePath);
  },

  getOutputPath(relativePath: string): string {
    return path.join(this.OUTPUT_DIR, relativePath);
  },
};

/**
 * Read file content safely
 */
export function readFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write file content safely
 */
export function writeFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Remove directory recursively
 */
export function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Normalize content for comparison
 * - Removes trailing whitespace
 * - Normalizes line endings
 * - Removes empty lines at end of file
 */
export function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/gm, '')
    .trim();
}

/**
 * Compare two strings and return differences
 */
export function compareContent(actual: string, expected: string): string[] {
  const differences: string[] = [];

  if (actual === expected) {
    return differences;
  }

  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');

  const maxLines = Math.max(actualLines.length, expectedLines.length);

  for (let i = 0; i < maxLines; i++) {
    const actualLine = actualLines[i];
    const expectedLine = expectedLines[i];

    if (actualLine !== expectedLine) {
      if (actualLine === undefined) {
        differences.push(`Line ${i + 1}: Missing actual line - "${expectedLine}"`);
      } else if (expectedLine === undefined) {
        differences.push(`Line ${i + 1}: Extra actual line - "${actualLine}"`);
      } else {
        differences.push(
          `Line ${i + 1}:\n    Expected: "${expectedLine}"\n    Actual:   "${actualLine}"`
        );
      }
    }
  }

  return differences;
}

/**
 * Get all test case files from the vault directory
 */
export function discoverTestCases(): E2ETestCase[] {
  const testCases: E2ETestCase[] = [
    {
      id: '01-simple-frontmatter',
      name: 'Simple Frontmatter',
      inputPath: '01-simple-frontmatter.md',
      expectedPath: '01-simple-frontmatter.md',
      tags: ['frontmatter', 'basic'],
    },
    {
      id: '02-wiki-links',
      name: 'Wiki Links',
      inputPath: '02-wiki-links.md',
      expectedPath: '02-wiki-links.md',
      tags: ['wiki-links', 'links'],
    },
    {
      id: '03-embeds',
      name: 'Embeds',
      inputPath: '03-embeds.md',
      expectedPath: '03-embeds.md',
      tags: ['embeds', 'attachments'],
    },
    {
      id: '04-callouts',
      name: 'Callouts',
      inputPath: '04-callouts.md',
      expectedPath: '04-callouts.md',
      tags: ['callouts', 'blockquote'],
    },
    {
      id: '05-tags',
      name: 'Tags',
      inputPath: '05-tags.md',
      expectedPath: '05-tags.md',
      tags: ['tags'],
    },
    {
      id: '06-codeblocks',
      name: 'Code Blocks',
      inputPath: '06-codeblocks.md',
      expectedPath: '06-codeblocks.md',
      tags: ['codeblocks', 'highlight'],
    },
    {
      id: '07-lists',
      name: 'Lists',
      inputPath: '07-lists.md',
      expectedPath: '07-lists.md',
      tags: ['lists', 'formatting'],
    },
    {
      id: '08-tables',
      name: 'Tables',
      inputPath: '08-tables.md',
      expectedPath: '08-tables.md',
      tags: ['tables', 'data'],
    },
    {
      id: '09-complex-frontmatter',
      name: 'Complex Frontmatter',
      inputPath: '09-complex-frontmatter.md',
      expectedPath: '09-complex-frontmatter.md',
      tags: ['frontmatter', 'complex', 'metadata'],
    },
    {
      id: '10-nested-folder',
      name: 'Nested Folder Note',
      inputPath: 'nested/10-nested-folder.md',
      expectedPath: '10-nested-folder.md',
      tags: ['nested', 'paths'],
    },
    {
      id: '11-deep-nested',
      name: 'Deep Nested Note',
      inputPath: 'nested/deep/11-deep-nested.md',
      expectedPath: '11-deep-nested.md',
      tags: ['nested', 'deep', 'paths'],
    },
    {
      id: '12-edge-cases',
      name: 'Edge Cases',
      inputPath: '12-edge-cases.md',
      expectedPath: '12-edge-cases.md',
      tags: ['edge-cases', 'special-chars'],
    },
  ];

  return testCases;
}

/**
 * Print test summary in a formatted way
 */
export function printSummary(summary: E2ETestSummary): void {
  console.log('\n' + '='.repeat(70));
  console.log('E2E TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total:  ${summary.total}`);
  console.log(`Passed: ${summary.passed}  ✅`);
  console.log(`Failed: ${summary.failed}  ❌`);
  console.log('='.repeat(70));

  if (summary.failed > 0) {
    console.log('\nFAILED TESTS:');
    console.log('-'.repeat(70));
    for (const result of summary.results) {
      if (!result.passed) {
        console.log(`\n[${result.testCase.id}] ${result.testCase.name}`);
        console.log(`  Tags: ${result.testCase.tags.join(', ')}`);
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }
        if (result.differences.length > 0) {
          console.log('  Differences:');
          for (const diff of result.differences.slice(0, 5)) {
            console.log(`    - ${diff}`);
          }
          if (result.differences.length > 5) {
            console.log(`    ... and ${result.differences.length - 5} more differences`);
          }
        }
      }
    }
  }

  console.log('\n');
}

/**
 * Print detailed test result
 */
export function printResult(result: ComparisonResult, verbose: boolean = false): void {
  const status = result.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${result.testCase.id}] ${status}: ${result.testCase.name}`);

  if (verbose && !result.passed) {
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.differences.length > 0) {
      console.log('  Differences:');
      for (const diff of result.differences.slice(0, 3)) {
        console.log(`    - ${diff}`);
      }
    }
  }
}
