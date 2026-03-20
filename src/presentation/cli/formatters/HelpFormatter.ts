/**
 * Formatter for help output
 */
export class HelpFormatter {
  format(): string {
    return `obsidian-convert - Convert Obsidian notes to Fumadocs-friendly files

USAGE:
  obsidian-convert [options]
  obsidian-convert convert [options]

OPTIONS:
  -i, --input <path>     Source file or directory path (can be used without config file)
  -c, --config <path>   Path to config file (default: ./obsidian-convert.yaml)
  -o, --output <dir>    Output directory (overrides config)
  -f, --format <fmt>    Output format: markdown, mdx, fumadocs (default: markdown)
  --dry-run             Preview conversion without writing files
  -v, --verbose         Show detailed output
  --no-interactive     Disable interactive progress bars and colors
  --broken-links <action> How to handle broken links: keep, remove, placeholder (default: keep)
  --report <format>     Generate report: json or html
  --report-output <path> Output path for report file
  -h, --help            Show this help message

EXIT CODES:
  0   Success
  1   Configuration error
  2   Source path error
  3   Conversion error

EXAMPLES:
  # Use config file
  obsidian-convert -c ./my-config.yaml

  # Convert vault directory directly (no config needed)
  obsidian-convert --input ./vault --output ./docs

  # Single file conversion
  obsidian-convert --input ./notes/intro.md --output ./docs

  # With additional options
  obsidian-convert -i ./vault -o ./docs -f mdx --verbose

  # Preview mode
  obsidian-convert -i ./vault -o ./docs --dry-run

  # Non-interactive mode (no progress bars)
  obsidian-convert -i ./vault -o ./docs --no-interactive

  # Generate report
  obsidian-convert -i ./vault -o ./docs --report json --report-output ./report.json

For more information, see: https://github.com/limit/obsidian-convert
`;
  }
}