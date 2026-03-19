/**
 * Unit tests for ReportGenerator
 */

import * as fs from 'fs';
import * as path from 'path';
import { ReportGenerator } from '../../../../src/infrastructure/report/ReportGenerator';
import { ConversionResult, FileConversionResult } from '../../../../src/application/convert/Converter';
import { ReportOptions } from '../../../../src/api/report-types';

describe('ReportGenerator', () => {
  const testOutputDir = path.join(__dirname, '../fixtures/test-output');

  // Mock ConversionResult for testing
  const createMockConversionResult = (): ConversionResult => {
    const fileResults: FileConversionResult[] = [
      {
        sourcePath: '/test/source/file1.md',
        outputPath: '/test/output/file1.md',
        attachmentCount: 2,
        wikiLinkCount: 5,
        calloutCount: 3,
        success: true,
        brokenLinks: ['missing-link'],
      },
      {
        sourcePath: '/test/source/file2.md',
        outputPath: '/test/output/file2.md',
        attachmentCount: 1,
        wikiLinkCount: 2,
        calloutCount: 1,
        success: true,
        brokenLinks: [],
      },
      {
        sourcePath: '/test/source/file3.md',
        outputPath: '',
        attachmentCount: 0,
        wikiLinkCount: 0,
        calloutCount: 0,
        success: false,
        error: 'Failed to parse frontmatter',
        brokenLinks: [],
      },
    ];

    return {
      totalFiles: 3,
      successCount: 2,
      failedCount: 1,
      totalAttachments: 3,
      totalWikiLinks: 7,
      totalCallouts: 4,
      fileResults,
      brokenLinks: ['missing-link'],
    };
  };

  beforeAll(() => {
    // Ensure test output directory exists
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test output
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('startTimer and endTimer', () => {
    it('should collect timing metrics', () => {
      const generator = new ReportGenerator();
      generator.startTimer();

      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait for 10ms
      }

      generator.endTimer();

      // The duration should be at least 10ms
      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      expect(report.summary.durationMs).toBeGreaterThanOrEqual(10);
      expect(report.summary.startTime).toBeDefined();
      expect(report.summary.endTime).toBeDefined();
    });
  });

  describe('generateReport', () => {
    it('should generate a report with all required top-level fields', () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      // Check top-level fields
      expect(report.version).toBe('1.0.0');
      expect(report.generatedAt).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.files).toBeDefined();
      expect(report.errors).toBeDefined();
      expect(report.warnings).toBeDefined();
    });

    it('should have correct summary statistics', () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      expect(report.summary.totalFiles).toBe(3);
      expect(report.summary.successCount).toBe(2);
      expect(report.summary.failedCount).toBe(1);
      expect(report.summary.totalWikiLinks).toBe(7);
      expect(report.summary.totalCallouts).toBe(4);
      expect(report.summary.totalAttachments).toBe(3);
    });

    it('should include successful files in files array', () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      expect(report.files).toHaveLength(2);
      expect(report.files[0].sourcePath).toBe('/test/source/file1.md');
      expect(report.files[0].wikiLinkCount).toBe(5);
      expect(report.files[0].calloutCount).toBe(3);
      expect(report.files[0].attachmentCount).toBe(2);
    });

    it('should include failed conversions in errors array', () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].sourcePath).toBe('/test/source/file3.md');
      expect(report.errors[0].errorMessage).toBe('Failed to parse frontmatter');
    });

    it('should include broken links as warnings', () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      // Should have at least the broken link warning
      const brokenLinkWarnings = report.warnings.filter(
        w => w.type === 'broken-link' && w.target === 'missing-link'
      );
      expect(brokenLinkWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('writeReport (JSON)', () => {
    it('should write a valid JSON report to file', async () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      const outputPath = path.join(testOutputDir, 'test-report.json');
      const writtenPath = await generator.writeReport(report, {
        format: 'json',
        outputPath,
      });

      expect(writtenPath).toBe(outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify the JSON is valid
      const content = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.summary).toBeDefined();
      expect(parsed.files).toBeDefined();
      expect(parsed.errors).toBeDefined();
      expect(parsed.warnings).toBeDefined();
    });
  });

  describe('writeReport (HTML)', () => {
    it('should write a valid HTML report to file', async () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'html' });

      const outputPath = path.join(testOutputDir, 'test-report.html');
      const writtenPath = await generator.writeReport(report, {
        format: 'html',
        outputPath,
      });

      expect(writtenPath).toBe(outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify the HTML contains key elements
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('Obsidian Convert Report');
      expect(content).toContain('Summary');
      expect(content).toContain('Files');
      expect(content).toContain('Errors');
      expect(content).toContain('Warnings');
      expect(content).toContain('/test/source/file1.md'); // Source path from mock data
    });
  });

  describe('JSON Schema compliance', () => {
    it('should produce output that matches the JSON schema structure', () => {
      const generator = new ReportGenerator();
      generator.startTimer();
      generator.endTimer();

      const result = createMockConversionResult();
      const report = generator.generateReport(result, { format: 'json' });

      // Validate top-level structure
      expect(typeof report.version).toBe('string');
      expect(typeof report.generatedAt).toBe('string');

      // Validate summary structure
      expect(typeof report.summary.totalFiles).toBe('number');
      expect(typeof report.summary.successCount).toBe('number');
      expect(typeof report.summary.failedCount).toBe('number');
      expect(typeof report.summary.warningCount).toBe('number');
      expect(typeof report.summary.totalWikiLinks).toBe('number');
      expect(typeof report.summary.totalCallouts).toBe('number');
      expect(typeof report.summary.totalAttachments).toBe('number');
      expect(typeof report.summary.durationMs).toBe('number');
      expect(typeof report.summary.startTime).toBe('string');
      expect(typeof report.summary.endTime).toBe('string');

      // Validate arrays
      expect(Array.isArray(report.files)).toBe(true);
      expect(Array.isArray(report.errors)).toBe(true);
      expect(Array.isArray(report.warnings)).toBe(true);

      // Validate file entries
      for (const file of report.files) {
        expect(typeof file.sourcePath).toBe('string');
        expect(typeof file.outputPath).toBe('string');
        expect(typeof file.wikiLinkCount).toBe('number');
        expect(typeof file.calloutCount).toBe('number');
        expect(typeof file.attachmentCount).toBe('number');
        expect(typeof file.sourceSizeBytes).toBe('number');
        expect(typeof file.outputSizeBytes).toBe('number');
      }

      // Validate error entries
      for (const error of report.errors) {
        expect(typeof error.sourcePath).toBe('string');
        expect(typeof error.errorMessage).toBe('string');
        expect(typeof error.timestamp).toBe('string');
      }

      // Validate warning entries
      for (const warning of report.warnings) {
        expect(typeof warning.type).toBe('string');
        expect(typeof warning.file).toBe('string');
        expect(typeof warning.message).toBe('string');
        expect(typeof warning.timestamp).toBe('string');
      }
    });
  });
});
