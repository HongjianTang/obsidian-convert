import * as yaml from 'yaml';

/**
 * Parsed frontmatter structure
 */
export interface Frontmatter {
  /** Raw frontmatter data */
  raw: Record<string, unknown>;
  /** Title */
  title?: string;
  /** Description */
  description?: string;
  /** Tags */
  tags?: string[];
  /** Aliases */
  aliases?: string[];
  /** Parent WikiLinks */
  parents?: string[];
  /** Children WikiLinks */
  children?: string[];
  /** Custom layout */
  layout?: string;
  /** Form type (e.g., MOC) */
  form?: string;
  /** Ignore children flag */
  ignoreChildren?: boolean;
  /** Games references */
  games?: string[];
  /** Other custom fields */
  [key: string]: unknown;
}

/**
 * Options for frontmatter processor
 */
export interface FrontmatterProcessorOptions {
  /** Convert WikiLinks in frontmatter values */
  convertWikiLinks?: boolean;
  /** Custom field mappings */
  fieldMappings?: Record<string, string>;
  /** Fields to remove from output */
  removeFields?: string[];
}

/**
 * Result of processing frontmatter
 */
export interface FrontmatterResult {
  /** Processed frontmatter */
  frontmatter: Frontmatter;
  /** Original frontmatter string (including --- delimiters) */
  originalString: string;
  /** Whether frontmatter was present */
  hasFrontmatter: boolean;
  /** Start position in content (0 if no frontmatter) */
  start: number;
  /** End position in content (0 if no frontmatter) */
  end: number;
}

/**
 * Processes YAML frontmatter in Obsidian notes
 */
export class FrontmatterProcessor {
  private static readonly FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
  private static readonly EMPTY_FRONTMATTER_REGEX = /^---\r?\n---\r?\n/;

  /**
   * Parse frontmatter from content
   */
  parse(content: string): FrontmatterResult {
    // Check for empty frontmatter first
    const emptyMatch = content.match(FrontmatterProcessor.EMPTY_FRONTMATTER_REGEX);
    if (emptyMatch) {
      return {
        frontmatter: { raw: {} },
        originalString: emptyMatch[0],
        hasFrontmatter: true,
        start: 0,
        end: emptyMatch[0].length,
      };
    }

    const match = content.match(FrontmatterProcessor.FRONTMATTER_REGEX);

    if (!match) {
      return {
        frontmatter: { raw: {} },
        originalString: '',
        hasFrontmatter: false,
        start: 0,
        end: 0,
      };
    }

    const frontmatterString = match[1];
    const raw = this.parseYaml(frontmatterString);

    return {
      frontmatter: this.normalizeFrontmatter(raw),
      originalString: match[0],
      hasFrontmatter: true,
      start: 0,
      end: match[0].length,
    };
  }

  /**
   * Convert frontmatter to fumadocs-compatible format
   */
  convert(frontmatter: Frontmatter, options: FrontmatterProcessorOptions = {}): string {
    const output: Record<string, unknown> = {};

    // Copy standard fields
    if (frontmatter.title) {
      output.title = frontmatter.title;
    }
    if (frontmatter.description) {
      output.description = frontmatter.description;
    }

    // Convert tags
    if (frontmatter.tags && frontmatter.tags.length > 0) {
      output.tags = frontmatter.tags;
    }

    // Handle aliases
    if (frontmatter.aliases && frontmatter.aliases.length > 0) {
      output.aliases = frontmatter.aliases;
    }

    // Convert parents/children for navigation
    if (frontmatter.parents && frontmatter.parents.length > 0) {
      const parents = options.convertWikiLinks
        ? frontmatter.parents.map(p => this.extractWikiLinkTarget(p))
        : frontmatter.parents;
      output.parents = parents;
    }

    if (frontmatter.children && frontmatter.children.length > 0) {
      const children = options.convertWikiLinks
        ? frontmatter.children.map(c => this.extractWikiLinkTarget(c))
        : frontmatter.children;
      output.children = children;
    }

    // Copy layout if present
    if (frontmatter.layout) {
      output.layout = frontmatter.layout;
    }

    // Copy games if present
    if (frontmatter.games && frontmatter.games.length > 0) {
      const games = options.convertWikiLinks
        ? frontmatter.games.map(g => this.extractWikiLinkTarget(g))
        : frontmatter.games;
      output.games = games;
    }

    // Apply custom field mappings
    if (options.fieldMappings) {
      for (const [from, to] of Object.entries(options.fieldMappings)) {
        if (frontmatter[from] !== undefined) {
          output[to] = frontmatter[from];
        }
      }
    }

    // Remove specified fields
    if (options.removeFields) {
      for (const field of options.removeFields) {
        delete output[field];
      }
    }

    // Generate YAML string
    const yamlString = yaml.stringify(output, { lineWidth: 0 });
    return `---\n${yamlString}---\n`;
  }

  /**
   * Process content: parse frontmatter and convert it
   */
  processContent(content: string, options: FrontmatterProcessorOptions = {}): string {
    const result = this.parse(content);

    if (!result.hasFrontmatter) {
      return content;
    }

    const convertedFrontmatter = this.convert(result.frontmatter, options);
    return convertedFrontmatter + content.slice(result.end);
  }

  /**
   * Extract the WikiLink target from a frontmatter value
   * Handles formats: "[[target]]", '[[target]]', "[[target|display]]", etc.
   */
  extractWikiLinkTarget(value: string): string {
    // Remove surrounding quotes if present
    let cleaned = value.trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1);
    }

    // Extract from WikiLink format [[target]] or [[target|display]]
    const wikiMatch = cleaned.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/);
    if (wikiMatch) {
      return wikiMatch[1];
    }

    return cleaned;
  }

  /**
   * Parse YAML string with error handling
   */
  private parseYaml(yamlString: string): Record<string, unknown> {
    try {
      const parsed = yaml.parse(yamlString);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      console.warn('Failed to parse frontmatter YAML');
      return {};
    }
  }

  /**
   * Normalize parsed frontmatter to our structure
   */
  private normalizeFrontmatter(raw: Record<string, unknown>): Frontmatter {
    return {
      raw,
      title: this.extractString(raw.title),
      description: this.extractString(raw.description),
      tags: this.extractArray(raw.tags),
      aliases: this.extractArray(raw.aliases),
      parents: this.extractArray(raw.parents),
      children: this.extractArray(raw.children),
      layout: this.extractString(raw.layout),
      form: this.extractString(raw.form),
      ignoreChildren: this.extractBoolean(raw['ignore-children']),
      games: this.extractArray(raw.games),
    };
  }

  private extractString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    return undefined;
  }

  private extractArray(value: unknown): string[] | undefined {
    if (Array.isArray(value)) {
      return value.map(v => String(v));
    }
    return undefined;
  }

  private extractBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }
}