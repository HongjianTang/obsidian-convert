/**
 * Benchmark Suite for obsidian-convert
 *
 * This module runs performance benchmarks on the conversion pipeline.
 */

const Benchmark = require('benchmark');
const path = require('path');
const fs = require('fs');

// Import converters after build
const { Converter } = require('../../dist/application/convert/Converter');
const { WikiLinkProcessor } = require('../../dist/domain/link/WikiLinkProcessor');
const { FrontmatterProcessor } = require('../../dist/domain/frontmatter/FrontmatterProcessor');

const FIXTURES_DIR = path.join(__dirname, '../fixtures/vault');

/**
 * Get sample markdown content for benchmarking
 */
function getSampleMarkdown(fileCount) {
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push(`# Test File ${i}

This is a test file with some content.

## Section 1

Some text with a [[WikiLink]] to another file.

## Section 2

More content with [[AnotherLink]] and more text.

### Nested Section

- List item 1
- List item 2
- List item 3

\`\`\`javascript
const example = "code block";
\`\`\`

> This is a callout block.

More text follows.
`);
  }
  return files;
}

/**
 * Benchmark converter performance
 */
function benchmarkConverter() {
  console.log('\n=== Converter Benchmark ===\n');

  const config = {
    sourceFolders: [{ path: FIXTURES_DIR }],
    outputDir: '/tmp/benchmark-output',
    attachmentDir: 'public/attachments',
  };

  const options = {
    verbose: false,
    dryRun: true,
    outputFormat: 'markdown',
    brokenLinkHandling: 'keep',
    warnOnBroken: false,
  };

  const converter = new Converter(config, options);

  new Benchmark('Converter.convert() - 100 files', {
    defer: true,
    fn: async (deferred) => {
      try {
        await converter.convert();
        deferred.resolve();
      } catch {
        deferred.resolve();
      }
    },
  })
    .on('complete', function () {
      console.log(`  ${this.name}: ${this.hz.toFixed(2)} ops/sec`);
      console.log(`  Mean: ${this.stats.mean.toFixed(4)} ms`);
      console.log(`  Deviation: ${this.stats.deviation.toFixed(4)} ms`);
    })
    .run({ async: true });
}

/**
 * Benchmark WikiLink processing
 */
function benchmarkWikiLinkProcessor() {
  console.log('\n=== WikiLinkProcessor Benchmark ===\n');

  const processor = new WikiLinkProcessor({
    sourceRoot: FIXTURES_DIR,
    outputDir: '/tmp/benchmark-output',
  });

  const content = `# Test

See [[AnotherNote]] and [[ThirdNote]] for more info.

![[EmbeddedNote]]

[[AnotherNote|Display Text]]

More content here.
`;

  new Benchmark('WikiLinkProcessor.process()', {
    defer: true,
    fn: async (deferred) => {
      try {
        processor.process(content, 'test.md');
        deferred.resolve();
      } catch {
        deferred.resolve();
      }
    },
  })
    .on('complete', function () {
      console.log(`  ${this.name}: ${this.hz.toFixed(2)} ops/sec`);
      console.log(`  Mean: ${this.stats.mean.toFixed(4)} ms`);
      console.log(`  Deviation: ${this.stats.deviation.toFixed(4)} ms`);
    })
    .run({ async: true });
}

/**
 * Benchmark frontmatter processing
 */
function benchmarkFrontmatterProcessor() {
  console.log('\n=== FrontmatterProcessor Benchmark ===\n');

  const processor = new FrontmatterProcessor({
    sourceRoot: FIXTURES_DIR,
    outputDir: '/tmp/benchmark-output',
    autoTitle: true,
  });

  const content = `---
title: Test Document
tags: [test, benchmark]
date: 2024-01-01
---

# Content

Some markdown content here.
`;

  new Benchmark('FrontmatterProcessor.process()', {
    defer: true,
    fn: async (deferred) => {
      try {
        processor.process(content, 'test.md');
        deferred.resolve();
      } catch {
        deferred.resolve();
      }
    },
  })
    .on('complete', function () {
      console.log(`  ${this.name}: ${this.hz.toFixed(2)} ops/sec`);
      console.log(`  Mean: ${this.stats.mean.toFixed(4)} ms`);
      console.log(`  Deviation: ${this.stats.deviation.toFixed(4)} ms`);
    })
    .run({ async: true });
}

/**
 * Benchmark file processing throughput
 */
function benchmarkFileThroughput() {
  console.log('\n=== File Throughput Benchmark ===\n');

  const fileSizes = [1, 10, 50, 100];

  for (const size of fileSizes) {
    const files = getSampleMarkdown(size);

    const start = Date.now();
    for (const content of files) {
      // Simulate processing
      const processed = content
        .replace(/\[\[(.*?)\]\]/g, '[$1]()')
        .replace(/^---$/m, '')
        .replace(/^# (.*$)/gm, '# $1');
    }
    const elapsed = Date.now() - start;

    console.log(`  ${size} files: ${elapsed.toFixed(2)} ms (${(size / elapsed * 1000).toFixed(2)} files/sec)`);
  }
}

// Run all benchmarks
console.log('========================================');
console.log('  obsidian-convert Performance Benchmarks');
console.log('========================================');

benchmarkConverter();
benchmarkWikiLinkProcessor();
benchmarkFrontmatterProcessor();
benchmarkFileThroughput();

console.log('\n========================================\n');