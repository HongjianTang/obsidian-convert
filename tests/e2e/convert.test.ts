/**
 * E2E Tests for obsidian-convert
 *
 * These tests verify the complete conversion pipeline using real test fixtures.
 * Each test case includes:
 * - Input: An Obsidian note in tests/fixtures/vault/
 * - Expected: The expected output in tests/fixtures/expected/
 *
 * The tests run the full converter and compare output against expected results.
 */

import * as path from 'path';
import * as fs from 'fs';
import { E2ETestCase, ComparisonResult, E2ETestSummary } from './types';
import {
  TestPaths,
  readFile,
  removeDir,
  normalizeContent,
  compareContent,
  discoverTestCases,
} from './helpers';

// Increase timeout for conversion operations
jest.setTimeout(30000);

// Import Converter statically
import { Converter } from '../../src/application/convert/Converter';

/**
 * Create a config for full vault conversion
 */
function createVaultConfig(vaultPath: string, outputDir: string) {
  return {
    sourceFolders: [{ path: vaultPath }],
    outputDir: outputDir,
    attachmentDir: 'public/attachments',
  };
}

/**
 * Run the converter on the entire vault
 */
async function runVaultConversion(): Promise<void> {
  const config = createVaultConfig(TestPaths.VAULT_DIR, TestPaths.OUTPUT_DIR);

  const converter = new Converter(config, {
    verbose: false,
    dryRun: false,
    outputFormat: 'markdown',
    brokenLinkHandling: 'keep',
    warnOnBroken: false,
  });

  await converter.convert();
}

/**
 * Compare a single test case output with expected
 */
function compareTestCase(testCase: E2ETestCase): ComparisonResult {
  const outputPath = TestPaths.getOutputPath(testCase.inputPath);
  const expectedPath = TestPaths.getExpectedPath(testCase.expectedPath);

  // Check if output file exists
  if (!fs.existsSync(outputPath)) {
    return {
      passed: false,
      testCase,
      actualContent: '',
      expectedContent: readFile(expectedPath),
      differences: [`Output file not found: ${outputPath}`],
    };
  }

  // Read and compare content
  const actualContent = normalizeContent(readFile(outputPath));
  const expectedContent = normalizeContent(readFile(expectedPath));

  const differences = compareContent(actualContent, expectedContent);

  return {
    passed: differences.length === 0,
    testCase,
    actualContent,
    expectedContent,
    differences,
  };
}

describe('obsidian-convert E2E Tests', () => {
  const testCases = discoverTestCases();
  let allResults: ComparisonResult[] = [];

  beforeAll(async () => {
    // Clean output directory
    removeDir(TestPaths.OUTPUT_DIR);

    // Run full vault conversion
    await runVaultConversion();

    // Compare all test cases
    allResults = testCases.map(tc => compareTestCase(tc));
  });

  describe('Test Fixture Discovery', () => {
    it('should discover all 12 test cases', () => {
      expect(testCases.length).toBeGreaterThanOrEqual(12);
    });

    it('should have unique IDs for all test cases', () => {
      const ids = testCases.map(tc => tc.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Frontmatter Tests', () => {
    it('should convert Simple Frontmatter correctly', () => {
      const result = allResults.find(r => r.testCase.id === '01-simple-frontmatter');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });

    it('should convert Complex Frontmatter correctly', () => {
      const result = allResults.find(r => r.testCase.id === '09-complex-frontmatter');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('WikiLinks Tests', () => {
    it('should convert Wiki Links correctly', () => {
      const result = allResults.find(r => r.testCase.id === '02-wiki-links');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('Embeds Tests', () => {
    it('should convert Embeds correctly', () => {
      const result = allResults.find(r => r.testCase.id === '03-embeds');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('Callouts Tests', () => {
    it('should convert Callouts correctly', () => {
      const result = allResults.find(r => r.testCase.id === '04-callouts');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('Tags Tests', () => {
    it('should convert Tags correctly', () => {
      const result = allResults.find(r => r.testCase.id === '05-tags');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('CodeBlocks Tests', () => {
    it('should convert Code Blocks correctly', () => {
      const result = allResults.find(r => r.testCase.id === '06-codeblocks');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('Lists Tests', () => {
    it('should convert Lists correctly', () => {
      const result = allResults.find(r => r.testCase.id === '07-lists');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('Tables Tests', () => {
    it('should convert Tables correctly', () => {
      const result = allResults.find(r => r.testCase.id === '08-tables');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('Nested Paths Tests', () => {
    it('should convert Nested Folder Note correctly', () => {
      const result = allResults.find(r => r.testCase.id === '10-nested-folder');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });

    it('should convert Deep Nested Note correctly', () => {
      const result = allResults.find(r => r.testCase.id === '11-deep-nested');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('Edge Cases Tests', () => {
    it('should convert Edge Cases correctly', () => {
      const result = allResults.find(r => r.testCase.id === '12-edge-cases');
      expect(result).toBeDefined();
      expect(result!.passed).toBe(true);
      if (!result!.passed) {
        console.log('Differences:', result!.differences);
      }
    });
  });

  describe('All Test Cases Summary', () => {
    it('should report summary of all test results', () => {
      const summary: E2ETestSummary = {
        total: testCases.length,
        passed: allResults.filter(r => r.passed).length,
        failed: allResults.filter(r => !r.passed).length,
        results: allResults,
      };

      // Log summary
      console.log('\n--- E2E Test Summary ---');
      console.log(`Total:  ${summary.total}`);
      console.log(`Passed: ${summary.passed}`);
      console.log(`Failed: ${summary.failed}`);

      // List failed tests
      if (summary.failed > 0) {
        console.log('\nFailed tests:');
        for (const r of allResults.filter(r => !r.passed)) {
          console.log(`  - ${r.testCase.id}: ${r.testCase.name}`);
          if (r.error) {
            console.log(`    Error: ${r.error}`);
          }
        }
      }

      // This test always passes - it's just for reporting
      expect(summary.total).toBeGreaterThan(0);
    });
  });
});