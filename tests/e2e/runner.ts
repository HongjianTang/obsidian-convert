/**
 * E2E Converter - Runs the converter programmatically for testing
 */

import * as path from 'path';
import { Config } from '../../src/infrastructure/config/Config';
import { Converter } from '../../src/application/convert/Converter';
import { E2ETestCase, ComparisonResult, E2ETestSummary } from './types';
import {
  TestPaths,
  readFile,
  writeFile,
  removeDir,
  normalizeContent,
  compareContent,
  discoverTestCases,
  printSummary,
  printResult,
} from './helpers';

/**
 * Create a config for isolated single-file conversion
 */
function createIsolatedConfig(inputFile: string, outputDir: string): Config {
  return {
    sourceFolders: [
      {
        path: path.dirname(inputFile),
        include: path.basename(inputFile),
      },
    ],
    outputDir: outputDir,
    attachmentDir: 'public/attachments',
  };
}

/**
 * Convert a single file and return the output content
 */
async function convertFile(
  inputPath: string,
  outputDir: string
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  const config = createIsolatedConfig(inputPath, outputDir);

  const converter = new Converter(config, {
    verbose: false,
    dryRun: false,
    outputFormat: 'markdown',
    brokenLinkHandling: 'keep',
    warnOnBroken: false,
  });

  try {
    const result = await converter.convert();

    if (result.fileResults.length > 0) {
      const fileResult = result.fileResults[0];
      if (fileResult.success) {
        return { success: true, outputPath: fileResult.outputPath };
      } else {
        return { success: false, error: fileResult.error };
      }
    }
    return { success: false, error: 'No files processed' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Run a single test case
 */
async function runTestCase(testCase: E2ETestCase): Promise<ComparisonResult> {
  const inputPath = TestPaths.getVaultPath(testCase.inputPath);
  const expectedPath = TestPaths.getExpectedPath(testCase.expectedPath);
  const outputDir = path.join(TestPaths.OUTPUT_DIR, testCase.id);

  // Clean output directory
  removeDir(outputDir);

  // Run conversion
  const convertResult = await convertFile(inputPath, outputDir);

  if (!convertResult.success) {
    return {
      passed: false,
      testCase,
      actualContent: '',
      expectedContent: readFile(expectedPath),
      differences: [`Conversion failed: ${convertResult.error}`],
      error: convertResult.error,
    };
  }

  // Read the output file
  const outputPath = convertResult.outputPath!;
  const actualContent = normalizeContent(readFile(outputPath));
  const expectedContent = normalizeContent(readFile(expectedPath));

  // Compare content
  const differences = compareContent(actualContent, expectedContent);

  return {
    passed: differences.length === 0,
    testCase,
    actualContent,
    expectedContent,
    differences,
  };
}

/**
 * Run all E2E tests
 */
export async function runE2ETests(verbose: boolean = false): Promise<E2ETestSummary> {
  const testCases = discoverTestCases();
  const results: ComparisonResult[] = [];

  console.log('\n🚀 Starting E2E Tests\n');
  console.log(`Found ${testCases.length} test cases\n`);

  for (const testCase of testCases) {
    printResult(await runTestCase(testCase), verbose);
    results.push(await runTestCase(testCase));
  }

  // Re-run to get final results (this is inefficient but ensures clean state)
  const summary: E2ETestSummary = {
    total: testCases.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results,
  };

  printSummary(summary);

  return summary;
}

/**
 * Run a specific test case by ID
 */
export async function runTestById(testId: string, verbose: boolean = false): Promise<ComparisonResult> {
  const testCases = discoverTestCases();
  const testCase = testCases.find(tc => tc.id === testId);

  if (!testCase) {
    throw new Error(`Test case not found: ${testId}`);
  }

  const result = await runTestCase(testCase);
  printResult(result, verbose);
  return result;
}

// Export for use in Jest
export { runTestCase, convertFile };
