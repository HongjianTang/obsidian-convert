/**
 * E2E Test Case Definition
 */
export interface E2ETestCase {
  /** Unique test case identifier */
  id: string;
  /** Descriptive name of the test case */
  name: string;
  /** Path to the input vault file (relative to fixtures/vault/) */
  inputPath: string;
  /** Path to the expected output file (relative to fixtures/expected/) */
  expectedPath: string;
  /** Whether to process this file in isolation (no link resolution) */
  isolated?: boolean;
  /** Tags describing what this test case covers */
  tags: string[];
}

/**
 * Result of comparing actual output with expected output
 */
export interface ComparisonResult {
  /** Whether the test passed */
  passed: boolean;
  /** The test case that was run */
  testCase: E2ETestCase;
  /** Actual output content */
  actualContent: string;
  /** Expected output content */
  expectedContent: string;
  /** List of differences found */
  differences: string[];
  /** Any error that occurred during conversion */
  error?: string;
}

/**
 * Summary of all test results
 */
export interface E2ETestSummary {
  /** Total number of test cases */
  total: number;
  /** Number of passing test cases */
  passed: number;
  /** Number of failing test cases */
  failed: number;
  /** Detailed results for each test case */
  results: ComparisonResult[];
}
