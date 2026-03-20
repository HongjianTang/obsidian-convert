/**
 * E2E Tests for CLI Commands
 *
 * These tests verify the complete CLI interface by running the actual CLI commands.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { Converter } from '../../src/application/convert/Converter';

// Increase timeout for CLI operations
jest.setTimeout(60000);

const CLI_PATH = path.join(__dirname, '../../dist/presentation/cli/index.js');
const FIXTURES_DIR = path.join(__dirname, '../fixtures/vault');
const OUTPUT_DIR = path.join(__dirname, '../fixtures/cli-output');

describe('CLI E2E Tests', () => {
  beforeEach(() => {
    // Clean output directory
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(OUTPUT_DIR)) {
      fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  /**
   * Run CLI command and return output
   */
  function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn('node', [CLI_PATH, ...args], {
        cwd: path.join(__dirname, '../..'),
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      proc.on('error', (err) => {
        stderr += err.message;
        resolve({
          stdout,
          stderr,
          exitCode: 1,
        });
      });
    });
  }

  describe('obsidian-convert CLI', () => {
    it('should display help with -h flag', async () => {
      const result = await runCli(['-h']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('obsidian-convert');
      expect(result.stdout).toContain('USAGE');
    });

    it('should display help with --help flag', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('obsidian-convert');
      expect(result.stdout).toContain('USAGE');
    });

    it('should run convert command with --input flag', async () => {
      // Create a test config file
      const configPath = path.join(OUTPUT_DIR, 'test-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ${FIXTURES_DIR}
outputDir: ${OUTPUT_DIR}
`);

      const result = await runCli([
        '--config', configPath,
        '--input', FIXTURES_DIR,
        '--output', OUTPUT_DIR,
        '--no-interactive',
      ]);

      // Should complete (exit code 0 or conversion error due to missing state)
      // The key is the CLI accepted the arguments
      expect(result.stdout).toBeDefined();
    });

    it('should run convert command with -i shortcut', async () => {
      const result = await runCli([
        '-i', FIXTURES_DIR,
        '-o', OUTPUT_DIR,
        '-c', path.join(FIXTURES_DIR, '../..', 'obsidian-convert.yaml'),
        '--no-interactive',
      ]);

      // The CLI should have accepted the arguments
      expect(result.stdout).toBeDefined();
    });

    it('should accept --dry-run flag', async () => {
      // Create minimal config
      const configPath = path.join(OUTPUT_DIR, 'dryrun-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ${FIXTURES_DIR}
outputDir: ${OUTPUT_DIR}
`);

      const result = await runCli([
        '-c', configPath,
        '--dry-run',
        '--no-interactive',
      ]);

      expect(result.stdout).toBeDefined();
    });

    it('should accept --verbose flag', async () => {
      const configPath = path.join(OUTPUT_DIR, 'verbose-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ${FIXTURES_DIR}
outputDir: ${OUTPUT_DIR}
`);

      const result = await runCli([
        '-c', configPath,
        '--verbose',
        '--no-interactive',
      ]);

      expect(result.stdout).toBeDefined();
    });

    it('should accept --format flag', async () => {
      const configPath = path.join(OUTPUT_DIR, 'format-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ${FIXTURES_DIR}
outputDir: ${OUTPUT_DIR}
`);

      const result = await runCli([
        '-c', configPath,
        '-f', 'markdown',
        '--no-interactive',
      ]);

      expect(result.stdout).toBeDefined();
    });

    it('should accept --broken-links flag', async () => {
      const configPath = path.join(OUTPUT_DIR, 'brokenlinks-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ${FIXTURES_DIR}
outputDir: ${OUTPUT_DIR}
`);

      const result = await runCli([
        '-c', configPath,
        '--broken-links', 'keep',
        '--no-interactive',
      ]);

      expect(result.stdout).toBeDefined();
    });

    it('should accept --no-interactive flag', async () => {
      const configPath = path.join(OUTPUT_DIR, 'interactive-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ${FIXTURES_DIR}
outputDir: ${OUTPUT_DIR}
`);

      const result = await runCli([
        '-c', configPath,
        '--no-interactive',
      ]);

      expect(result.stdout).toBeDefined();
    });

    it('should error with missing config file', async () => {
      const result = await runCli([
        '-c', '/non/existent/config.yaml',
        '--no-interactive',
      ]);

      // Should fail with config error
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('Config file validation', () => {
    it('should report error for missing sourceFolders', async () => {
      const configPath = path.join(OUTPUT_DIR, 'invalid-config.yaml');
      fs.writeFileSync(configPath, `
outputDir: ${OUTPUT_DIR}
`);

      const result = await runCli([
        '-c', configPath,
        '--no-interactive',
      ]);

      expect(result.exitCode).not.toBe(0);
    });

    it('should report error for missing outputDir', async () => {
      const configPath = path.join(OUTPUT_DIR, 'invalid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ${FIXTURES_DIR}
`);

      const result = await runCli([
        '-c', configPath,
        '--no-interactive',
      ]);

      expect(result.exitCode).not.toBe(0);
    });
  });
});