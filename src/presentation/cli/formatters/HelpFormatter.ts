/**
 * Formatter for help output
 */
export class HelpFormatter {
  format(): string {
    return `obsidian-convert - Convert Obsidian notes to Fumadocs-friendly files

USAGE:
  obsidian-convert [options]

OPTIONS:
  -c, --config <path>   Path to config file (default: ./obsidian-convert.yaml)
  -o, --output <dir>    Output directory (overrides config)
  --dry-run             Preview conversion without writing files
  -v, --verbose         Show detailed output
  -h, --help            Show this help message

EXIT CODES:
  0   Success
  1   Configuration error
  2   Source folder error
  3   Conversion error

EXAMPLES:
  obsidian-convert
  obsidian-convert -c ./my-config.yaml
  obsidian-convert -o ./output --verbose
  obsidian-convert --dry-run

For more information, see: https://github.com/limit/obsidian-convert
`;
  }
}