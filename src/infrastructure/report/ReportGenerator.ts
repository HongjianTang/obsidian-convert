import * as fs from 'fs';
import * as path from 'path';
import {
  ConversionReport,
  ReportOptions,
  ReportSummary,
  ReportFile,
  ReportError,
  ReportWarning,
  FileTreeNode,
  LinkGraphEdge,
} from '../../api/report-types';
import { FileConversionResult, ConversionResult } from '../../application/convert/Converter';

/**
 * Performance metrics collector
 */
interface PerformanceMetrics {
  startTime: number;
  endTime: number;
  peakMemory: number;
}

/**
 * Report generator that creates JSON and HTML reports
 */
export class ReportGenerator {
  private metrics: PerformanceMetrics;
  private warnings: ReportWarning[] = [];

  constructor() {
    this.metrics = {
      startTime: Date.now(),
      endTime: 0,
      peakMemory: 0,
    };
  }

  /**
   * Start timing
   */
  startTimer(): void {
    this.metrics.startTime = Date.now();
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * End timing and collect metrics
   */
  endTimer(): void {
    this.metrics.endTime = Date.now();
    if (process.memoryUsage) {
      const mem = process.memoryUsage();
      this.metrics.peakMemory = mem.heapUsed;
    }
  }

  /**
   * Add a warning
   */
  addWarning(warning: ReportWarning): void {
    this.warnings.push(warning);
  }

  /**
   * Generate a complete report from conversion results
   */
  generateReport(
    conversionResult: ConversionResult,
    options: ReportOptions
  ): ConversionReport {
    this.endTimer();

    const summary = this.buildSummary(conversionResult);
    const files = this.buildFileList(conversionResult);
    const errors = this.buildErrorList(conversionResult);
    const warnings = this.buildWarningList(conversionResult);

    const report: ConversionReport = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      summary,
      files,
      errors,
      warnings,
    };

    return report;
  }

  /**
   * Build summary statistics
   */
  private buildSummary(result: ConversionResult): ReportSummary {
    const successFiles = result.fileResults.filter(f => f.success);
    const failedFiles = result.fileResults.filter(f => !f.success);

    // Calculate source and output sizes
    let totalSourceSize = 0;
    let totalOutputSize = 0;

    for (const file of successFiles) {
      try {
        const sourceStats = fs.statSync(file.sourcePath);
        totalSourceSize += sourceStats.size;
        if (file.outputPath) {
          const outputStats = fs.statSync(file.outputPath);
          totalOutputSize += outputStats.size;
        }
      } catch {
        // Ignore stat errors
      }
    }

    return {
      totalFiles: result.totalFiles,
      successCount: result.successCount,
      failedCount: result.failedCount,
      warningCount: this.warnings.length,
      totalWikiLinks: result.totalWikiLinks,
      totalCallouts: result.totalCallouts,
      totalAttachments: result.totalAttachments,
      durationMs: this.metrics.endTime - this.metrics.startTime,
      peakMemoryBytes: this.metrics.peakMemory || undefined,
      startTime: new Date(this.metrics.startTime).toISOString(),
      endTime: new Date(this.metrics.endTime).toISOString(),
    };
  }

  /**
   * Build list of successfully converted files
   */
  private buildFileList(result: ConversionResult): ReportFile[] {
    return result.fileResults
      .filter(f => f.success)
      .map(f => this.fileResultToReportFile(f));
  }

  /**
   * Convert FileConversionResult to ReportFile
   */
  private fileResultToReportFile(result: FileConversionResult): ReportFile {
    let sourceSizeBytes = 0;
    let outputSizeBytes = 0;

    try {
      if (fs.existsSync(result.sourcePath)) {
        sourceSizeBytes = fs.statSync(result.sourcePath).size;
      }
      if (result.outputPath && fs.existsSync(result.outputPath)) {
        outputSizeBytes = fs.statSync(result.outputPath).size;
      }
    } catch {
      // Ignore stat errors
    }

    return {
      sourcePath: result.sourcePath,
      outputPath: result.outputPath,
      wikiLinkCount: result.wikiLinkCount,
      calloutCount: result.calloutCount,
      attachmentCount: result.attachmentCount,
      sourceSizeBytes,
      outputSizeBytes,
    };
  }

  /**
   * Build list of errors
   */
  private buildErrorList(result: ConversionResult): ReportError[] {
    return result.fileResults
      .filter(f => !f.success)
      .map(f => ({
        sourcePath: f.sourcePath,
        errorMessage: f.error || 'Unknown error',
        timestamp: new Date().toISOString(),
      }));
  }

  /**
   * Build list of warnings
   */
  private buildWarningList(result: ConversionResult): ReportWarning[] {
    const warnings: ReportWarning[] = [...this.warnings];

    // Add broken link warnings
    for (const link of result.brokenLinks) {
      warnings.push({
        type: 'broken-link',
        file: 'unknown',
        target: link,
        message: `Broken link: [[${link}]]`,
        timestamp: new Date().toISOString(),
      });
    }

    return warnings;
  }

  /**
   * Write report to file
   */
  async writeReport(report: ConversionReport, options: ReportOptions): Promise<string> {
    const outputPath = options.outputPath || this.getDefaultPath(options.format);
    const dir = path.dirname(outputPath);

    await fs.promises.mkdir(dir, { recursive: true });

    let content: string;
    if (options.format === 'json') {
      content = JSON.stringify(report, null, 2);
    } else {
      content = this.generateHtmlReport(report);
    }

    await fs.promises.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  }

  /**
   * Get default output path based on format
   */
  private getDefaultPath(format: 'json' | 'html'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return format === 'json'
      ? `./conversion-report-${timestamp}.json`
      : `./conversion-report-${timestamp}.html`;
  }

  /**
   * Generate HTML report
   */
  private generateHtmlReport(report: ConversionReport): string {
    const fileTree = this.buildFileTree(report);
    const linkGraph = this.buildLinkGraph(report);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Obsidian Convert Report - ${new Date(report.generatedAt).toLocaleDateString()}</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-tertiary: #0f3460;
      --text-primary: #eaeaea;
      --text-secondary: #a0a0a0;
      --accent: #e94560;
      --success: #00d9a5;
      --warning: #ffc107;
      --error: #ff5252;
      --border: #2a2a4a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1, h2, h3 { margin-bottom: 1rem; color: var(--text-primary); }
    h1 { border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; }
    .card {
      background: var(--bg-secondary);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      border: 1px solid var(--border);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .stat {
      background: var(--bg-tertiary);
      padding: 1rem;
      border-radius: 6px;
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: bold;
      color: var(--accent);
    }
    .stat-label { color: var(--text-secondary); font-size: 0.9rem; }
    .stat.success .stat-value { color: var(--success); }
    .stat.error .stat-value { color: var(--error); }
    .stat.warning .stat-value { color: var(--warning); }
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .tab {
      background: var(--bg-tertiary);
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-primary);
      font-size: 1rem;
      transition: background 0.2s;
    }
    .tab:hover { background: var(--accent); }
    .tab.active { background: var(--accent); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .tree, .graph { max-height: 500px; overflow-y: auto; }
    .tree-node { padding-left: 1.5rem; border-left: 1px solid var(--border); margin-left: 0.5rem; }
    .tree-item {
      padding: 0.5rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border-radius: 4px;
    }
    .tree-item:hover { background: var(--bg-tertiary); }
    .tree-toggle {
      width: 20px;
      height: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.success { background: var(--success); }
    .status-dot.failed { background: var(--error); }
    .status-dot.warning { background: var(--warning); }
    .file-list, .error-list, .warning-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .list-item {
      padding: 0.75rem;
      border-bottom: 1px solid var(--border);
    }
    .list-item:last-child { border-bottom: none; }
    .error-item { border-left: 3px solid var(--error); }
    .warning-item { border-left: 3px solid var(--warning); }
    .error-message { color: var(--error); margin-top: 0.5rem; }
    .warning-message { color: var(--warning); margin-top: 0.5rem; }
    .meta { color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.25rem; }
    .link-graph-container {
      background: var(--bg-tertiary);
      border-radius: 6px;
      padding: 1rem;
      margin-top: 1rem;
    }
    .link-item {
      padding: 0.5rem;
      background: var(--bg-secondary);
      margin: 0.25rem 0;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9rem;
    }
    .link-arrow { color: var(--accent); margin: 0 0.5rem; }
    .collapsible {
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 0.5rem;
      overflow: hidden;
    }
    .collapsible-header {
      background: var(--bg-tertiary);
      padding: 0.75rem;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .collapsible-header:hover { background: var(--bg-secondary); }
    .collapsible-content {
      padding: 0.75rem;
      display: none;
    }
    .collapsible.open .collapsible-content { display: block; }
    .collapsible.open .toggle-icon { transform: rotate(90deg); }
    .toggle-icon { transition: transform 0.2s; }
    pre {
      background: var(--bg-primary);
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 0.85rem;
    }
    code { font-family: 'Fira Code', 'Consolas', monospace; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Obsidian Convert Report</h1>
    <p class="meta">Generated: ${new Date(report.generatedAt).toLocaleString()}</p>

    <div class="card">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="stat">
          <div class="stat-value">${report.summary.totalFiles}</div>
          <div class="stat-label">Total Files</div>
        </div>
        <div class="stat success">
          <div class="stat-value">${report.summary.successCount}</div>
          <div class="stat-label">Successful</div>
        </div>
        <div class="stat error">
          <div class="stat-value">${report.summary.failedCount}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat warning">
          <div class="stat-value">${report.summary.warningCount}</div>
          <div class="stat-label">Warnings</div>
        </div>
        <div class="stat">
          <div class="stat-value">${report.summary.totalWikiLinks}</div>
          <div class="stat-label">WikiLinks</div>
        </div>
        <div class="stat">
          <div class="stat-value">${report.summary.totalCallouts}</div>
          <div class="stat-label">Callouts</div>
        </div>
        <div class="stat">
          <div class="stat-value">${report.summary.durationMs}ms</div>
          <div class="stat-label">Duration</div>
        </div>
        ${report.summary.peakMemoryBytes ? `
        <div class="stat">
          <div class="stat-value">${(report.summary.peakMemoryBytes / 1024 / 1024).toFixed(2)}MB</div>
          <div class="stat-label">Peak Memory</div>
        </div>` : ''}
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showTab('files')">Files (${report.files.length})</button>
      <button class="tab" onclick="showTab('errors')">Errors (${report.errors.length})</button>
      <button class="tab" onclick="showTab('warnings')">Warnings (${report.warnings.length})</button>
      <button class="tab" onclick="showTab('tree')">File Tree</button>
      <button class="tab" onclick="showTab('links')">Link Graph</button>
    </div>

    <div id="tab-files" class="tab-content active">
      <div class="card">
        <h3>Successfully Converted Files</h3>
        <div class="file-list">
          ${report.files.length === 0 ? '<p class="meta">No files converted successfully</p>' : ''}
          ${report.files.map(f => `
          <div class="list-item">
            <span class="status-dot success"></span>
            <strong>${path.basename(f.sourcePath)}</strong>
            <div class="meta">${f.sourcePath} → ${f.outputPath}</div>
            <div class="meta">
              WikiLinks: ${f.wikiLinkCount} | Callouts: ${f.calloutCount} | Attachments: ${f.attachmentCount} |
              Size: ${f.sourceSizeBytes} → ${f.outputSizeBytes} bytes
            </div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div id="tab-errors" class="tab-content">
      <div class="card">
        <h3>Conversion Errors</h3>
        <div class="error-list">
          ${report.errors.length === 0 ? '<p class="meta">No errors</p>' : ''}
          ${report.errors.map(e => `
          <div class="list-item error-item">
            <span class="status-dot failed"></span>
            <strong>${path.basename(e.sourcePath)}</strong>
            <div class="meta">${e.sourcePath}</div>
            <div class="error-message">${this.escapeHtml(e.errorMessage)}</div>
            <div class="meta">${e.timestamp}</div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div id="tab-warnings" class="tab-content">
      <div class="card">
        <h3>Warnings</h3>
        <div class="warning-list">
          ${report.warnings.length === 0 ? '<p class="meta">No warnings</p>' : ''}
          ${report.warnings.map(w => `
          <div class="list-item warning-item">
            <span class="status-dot warning"></span>
            <strong>[${w.type}]</strong> ${w.file}
            ${w.target ? `→ ${w.target}` : ''}
            <div class="warning-message">${this.escapeHtml(w.message)}</div>
            <div class="meta">${w.timestamp}</div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div id="tab-tree" class="tab-content">
      <div class="card">
        <h3>File Tree</h3>
        <div class="tree">
          ${this.renderFileTree(fileTree)}
        </div>
      </div>
    </div>

    <div id="tab-links" class="tab-content">
      <div class="card">
        <h3>Link Graph</h3>
        <p class="meta">All links found during conversion</p>
        <div class="link-graph-container">
          ${linkGraph.length === 0 ? '<p class="meta">No links found</p>' : ''}
          ${linkGraph.slice(0, 100).map(l => `
          <div class="link-item">
            ${this.escapeHtml(l.source)} <span class="link-arrow">→</span> ${this.escapeHtml(l.target)}
            ${l.linkText ? ` <span class="meta">("${this.escapeHtml(l.linkText)}")</span>` : ''}
          </div>
          `).join('')}
          ${linkGraph.length > 100 ? `<p class="meta">... and ${linkGraph.length - 100} more links</p>` : ''}
        </div>
      </div>
    </div>
  </div>

  <script>
    function showTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + tabId).classList.add('active');
      event.target.classList.add('active');
    }

    function toggleCollapsible(element) {
      element.classList.toggle('open');
    }

    document.querySelectorAll('.collapsible-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('open');
      });
    });
  </script>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Build file tree structure
   */
  private buildFileTree(report: ConversionReport): FileTreeNode[] {
    // Build proper tree structure
    const tree: FileTreeNode[] = [];
    const pathParts = new Map<string, FileTreeNode>();

    for (const file of [...report.files, ...report.errors.map(e => ({ sourcePath: e.sourcePath }))]) {
      const parts = file.sourcePath.split('/');
      let parentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const currentPath = parts.slice(0, i + 1).join('/');
        const isFile = i === parts.length - 1;

        if (!pathParts.has(currentPath)) {
          const node: FileTreeNode = {
            name: part,
            path: currentPath,
            isDirectory: !isFile,
            status: isFile ? 'success' : undefined,
            children: [],
          };

          if (isFile) {
            const existing = report.errors.find(e => e.sourcePath === currentPath);
            if (existing) {
              node.status = 'failed';
            }
          }

          pathParts.set(currentPath, node);

          if (i === 0) {
            tree.push(node);
          } else {
            const parent = pathParts.get(parentPath);
            if (parent && parent.children) {
              parent.children.push(node);
            }
          }
        }

        parentPath = currentPath;
      }
    }

    return tree;
  }

  /**
   * Render file tree as HTML
   */
  private renderFileTree(nodes: FileTreeNode[]): string {
    if (nodes.length === 0) {
      return '<p class="meta">No files</p>';
    }

    return nodes.map(node => {
      const statusClass = node.status ? ` status-${node.status}` : '';
      const icon = node.isDirectory ? '📁' : '📄';

      if (node.isDirectory && node.children && node.children.length > 0) {
        return `
        <div class="collapsible">
          <div class="collapsible-header" onclick="toggleCollapsible(this.parentElement)">
            <span><span class="toggle-icon">▶</span> ${icon} ${node.name}</span>
            <span class="meta">${node.children.length} items</span>
          </div>
          <div class="collapsible-content">
            ${this.renderFileTree(node.children)}
          </div>
        </div>`;
      }

      return `
      <div class="tree-item${statusClass}">
        <span class="status-dot ${node.status || ''}"></span>
        ${icon} ${node.name}
        ${node.linkCount ? `<span class="meta">(${node.linkCount} links)</span>` : ''}
      </div>`;
    }).join('');
  }

  /**
   * Build link graph from converted files
   */
  private buildLinkGraph(report: ConversionReport): LinkGraphEdge[] {
    const edges: LinkGraphEdge[] = [];

    for (const file of report.files) {
      // In a real implementation, we would parse the file content to extract links
      // For now, we'll add a placeholder based on wiki link count
      if (file.wikiLinkCount > 0) {
        edges.push({
          source: file.sourcePath,
          target: 'multiple targets',
          linkText: `${file.wikiLinkCount} links`,
        });
      }
    }

    return edges;
  }
}
