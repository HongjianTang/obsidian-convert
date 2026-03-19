/**
 * Report types for conversion reporting
 */

/**
 * Summary statistics for the conversion
 */
export interface ReportSummary {
  /** Total files processed */
  totalFiles: number;
  /** Successfully converted files */
  successCount: number;
  /** Failed conversions */
  failedCount: number;
  /** Total warnings generated */
  warningCount: number;
  /** Total WikiLinks converted */
  totalWikiLinks: number;
  /** Total callouts converted */
  totalCallouts: number;
  /** Total attachments processed */
  totalAttachments: number;
  /** Conversion duration in milliseconds */
  durationMs: number;
  /** Memory usage peak in bytes (if available) */
  peakMemoryBytes?: number;
  /** Conversion start time (ISO string) */
  startTime: string;
  /** Conversion end time (ISO string) */
  endTime: string;
}

/**
 * Information about a successfully converted file
 */
export interface ReportFile {
  /** Source file path */
  sourcePath: string;
  /** Output file path */
  outputPath: string;
  /** Number of WikiLinks converted */
  wikiLinkCount: number;
  /** Number of callouts converted */
  calloutCount: number;
  /** Number of attachments processed */
  attachmentCount: number;
  /** File size in bytes (source) */
  sourceSizeBytes: number;
  /** File size in bytes (output) */
  outputSizeBytes: number;
}

/**
 * Information about a failed conversion
 */
export interface ReportError {
  /** Source file path */
  sourcePath: string;
  /** Error message */
  errorMessage: string;
  /** Error stack trace (if available) */
  stackTrace?: string;
  /** Timestamp when the error occurred */
  timestamp: string;
}

/**
 * Warning information
 */
export interface ReportWarning {
  /** Type of warning */
  type: 'broken-link' | 'format-issue' | 'missing-frontmatter' | 'orphan-file' | 'attachment-missing';
  /** File where the warning originated */
  file: string;
  /** Target or subject of the warning */
  target?: string;
  /** Human-readable warning message */
  message: string;
  /** Timestamp when the warning occurred */
  timestamp: string;
}

/**
 * Complete conversion report structure
 */
export interface ConversionReport {
  /** Report format version */
  version: string;
  /** Report generation time */
  generatedAt: string;
  /** Summary statistics */
  summary: ReportSummary;
  /** Successfully converted files */
  files: ReportFile[];
  /** Failed conversions with error details */
  errors: ReportError[];
  /** Warnings generated during conversion */
  warnings: ReportWarning[];
}

/**
 * Report generation options
 */
export interface ReportOptions {
  /** Output format: 'json' or 'html' */
  format: 'json' | 'html';
  /** Output path for the report file */
  outputPath?: string;
  /** Include memory usage statistics */
  includeMemoryStats?: boolean;
  /** Include file tree in HTML report */
  includeFileTree?: boolean;
  /** Include link graph in HTML report */
  includeLinkGraph?: boolean;
}

/**
 * File tree node for HTML report
 */
export interface FileTreeNode {
  /** File or directory name */
  name: string;
  /** Full path */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
  /** Child nodes (for directories) */
  children?: FileTreeNode[];
  /** Conversion status (for files) */
  status?: 'success' | 'failed' | 'warning';
  /** Number of links in this file */
  linkCount?: number;
}

/**
 * Link graph edge for HTML report
 */
export interface LinkGraphEdge {
  /** Source file path */
  source: string;
  /** Target file path */
  target: string;
  /** Link text */
  linkText?: string;
}
