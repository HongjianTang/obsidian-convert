#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { ConvertCommand } from './commands/ConvertCommand';
import { HelpFormatter } from './formatters/HelpFormatter';

const EXIT_SUCCESS = 0;
const EXIT_CONFIG_ERROR = 1;
const EXIT_SOURCE_ERROR = 2;
const EXIT_CONVERT_ERROR = 3;

interface ParsedOptions {
  config: string;
  input?: string;
  output?: string;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
  interactive: boolean;
  format: 'markdown' | 'mdx' | 'fumadocs';
  brokenLinks: 'keep' | 'remove' | 'placeholder';
  report?: 'json' | 'html';
  'report-output'?: string;
}

function parseCliArgs(): ParsedOptions {
  const { values } = parseArgs({
    options: {
      config: {
        type: 'string',
        short: 'c',
        default: './obsidian-convert.yaml',
      },
      input: {
        type: 'string',
        short: 'i',
      },
      output: {
        type: 'string',
        short: 'o',
      },
      'dry-run': {
        type: 'boolean',
        default: false,
      },
      verbose: {
        type: 'boolean',
        short: 'v',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
      'no-interactive': {
        type: 'boolean',
        default: false,
      },
      format: {
        type: 'string',
        short: 'f',
        default: 'markdown',
      },
      'broken-links': {
        type: 'string',
        default: 'keep',
      },
      report: {
        type: 'string',
      },
      'report-output': {
        type: 'string',
      },
    },
    allowPositionals: false,
  });

  return {
    config: values.config as string,
    input: values.input as string | undefined,
    output: values.output as string | undefined,
    dryRun: values['dry-run'] as boolean,
    verbose: values.verbose as boolean,
    help: values.help as boolean,
    interactive: !values['no-interactive'] as boolean,
    format: values.format as 'markdown' | 'mdx' | 'fumadocs',
    brokenLinks: values['broken-links'] as 'keep' | 'remove' | 'placeholder',
    report: values.report as 'json' | 'html' | undefined,
    'report-output': values['report-output'] as string | undefined,
  };
}

async function main(): Promise<number> {
  const options = parseCliArgs();

  // Show help
  if (options.help) {
    const formatter = new HelpFormatter();
    console.log(formatter.format());
    return EXIT_SUCCESS;
  }

  // Run conversion
  const command = new ConvertCommand({
    configPath: options.config,
    input: options.input,
    outputDir: options.output,
    dryRun: options.dryRun,
    verbose: options.verbose,
    interactive: options.interactive,
    outputFormat: options.format,
    brokenLinkHandling: options.brokenLinks,
    report: options.report,
    reportOutput: options['report-output'],
  });

  const result = await command.execute();

  if (!result.success) {
    if (result.errorType === 'config') {
      return EXIT_CONFIG_ERROR;
    }
    if (result.errorType === 'source') {
      return EXIT_SOURCE_ERROR;
    }
    return EXIT_CONVERT_ERROR;
  }

  return EXIT_SUCCESS;
}

main()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(EXIT_CONVERT_ERROR);
  });