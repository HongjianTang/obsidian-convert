# Obsidian Convert

A command-line tool to convert Obsidian notes into fumadocs-compatible formats.

## Features

- **WikiLink Conversion** — Transform `[[note]]` and `[[note|display]]` links into relative Markdown links
- **Embed Support** — Convert `![[file]]` embeds to standard Markdown image syntax
- **Callout Blocks** — Parse Obsidian callout syntax (`>` blocks) for fumadocs compatibility
- **Frontmatter Processing** — Handle YAML frontmatter with configurable field mapping
- **Attachment Handling** — Copy and reorganize attachment files to the output directory
- **Batch Conversion** — Convert entire vault directories with a single command
- **Dry Run Mode** — Preview conversion results without writing files
- **Configurable Output** — Support for Markdown and MDX output formats

## Quick Start

### Installation

```bash
npm install -g obsidian-convert
```

### Basic Usage

```bash
# Convert a single file
obsidian-convert convert note.md -o ./docs

# Convert an entire vault
obsidian-convert convert ./vault/notes -o ./docs

# Preview conversion without writing files
obsidian-convert convert note.md --dry-run

# Convert with verbose output
obsidian-convert convert ./vault -o ./docs --verbose
```

## CLI Commands

### `convert`

Converts Obsidian notes to fumadocs-compatible format.

```bash
obsidian-convert convert <input> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output directory (default: input directory) |
| `-f, --format <format>` | Output format: `mdx` or `markdown` (default: `markdown`) |
| `--config <path>` | Path to configuration file |
| `--dry-run` | Preview results without writing files |
| `-v, --verbose` | Enable verbose output |
| `--json` | Output results as JSON |

**Examples:**

```bash
# Convert with default settings
obsidian-convert convert ./vault -o ./docs

# Export as MDX
obsidian-convert convert note.md -f mdx -o ./output

# Dry run with JSON output
obsidian-convert convert ./vault --dry-run --json
```

### `validate`

Validates Obsidian notes for potential issues.

```bash
obsidian-convert validate <input> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--check-links` | Verify that links point to existing files |
| `--check-embeds` | Check that embedded files exist |
| `--json` | Output results as JSON |

**Examples:**

```bash
# Validate a single file
obsidian-convert validate note.md

# Validate vault and check all links
obsidian-convert validate ./vault --check-links --check-embeds
```

### `info`

Display parsed information about a note.

```bash
obsidian-convert info <file> [options]
```

**Examples:**

```bash
# Show note metadata
obsidian-convert info note.md

# JSON output for scripting
obsidian-convert info note.md --json
```

## Configuration

Create a `.obsidian-convertrc.json` or `obsidian-convert.config.js` file:

```json
{
  "sourceFolders": [
    { "path": "./vault/notes" }
  ],
  "outputDir": "./docs",
  "format": "mdx",
  "transformers": {
    "wikilinks": true,
    "embeds": true,
    "tags": true,
    "frontmatter": true
  },
  "frontmatterMapping": {
    "title": "title",
    "date": "date",
    "tags": "tags"
  },
  "linkFormat": "relative"
}
```

## Architecture

Obsidian Convert follows Clean Architecture principles with four layers:

```
┌─────────────────────────────────────────────────────────┐
│                    Infrastructure                        │
│  (FileReader, FileWriter, Config, Logger)               │
├─────────────────────────────────────────────────────────┤
│                    Presentation                          │
│  (CLI Commands, Formatters)                              │
├─────────────────────────────────────────────────────────┤
│                    Application                           │
│  (ConvertNote, ConvertBatch, ValidateNote)               │
├─────────────────────────────────────────────────────────┤
│                    Domain                                │
│  (Note, WikiLink, Embed, Transformer)                    │
└─────────────────────────────────────────────────────────┘
```

**Domain Layer** — Core business entities and transformers:
- `Note` — Obsidian note representation
- `WikiLink` — Wiki-style link parsing and conversion
- `Embed` — File embed handling
- `CalloutConverter` — Callout block transformation

**Application Layer** — Use cases and orchestration:
- `Converter` — Main conversion orchestration

**Infrastructure Layer** — External concerns:
- `Config` — Configuration loading
- `AttachmentHandler` — Attachment file management

**Presentation Layer** — CLI interface:
- `ConvertCommand`, `ValidateCommand`, `InfoCommand`

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Watch mode for development
npm run dev
```

## License

ISC
