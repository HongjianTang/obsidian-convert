import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { Config, ConfigLoader, SourceFolderConfig } from './Config';
import { TransformerConfig, isValidPattern } from '../../domain/transformer';

/**
 * Error thrown when configuration is invalid
 */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly configPath?: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Default configuration values
 */
const DEFAULT_ATTACHMENT_DIR = 'public/attachments';

/**
 * YAML-based configuration loader
 */
export class YamlConfigLoader implements ConfigLoader {
  async load(configPath: string): Promise<Config> {
    const absolutePath = path.resolve(configPath);

    if (!fs.existsSync(absolutePath)) {
      throw new ConfigError(
        `Configuration file not found: ${absolutePath}`,
        absolutePath
      );
    }

    const content = await fs.promises.readFile(absolutePath, 'utf-8');
    const rawConfig = parseYaml(content) as Record<string, unknown>;

    return this.validateAndBuild(rawConfig, absolutePath);
  }

  async exists(configPath: string): Promise<boolean> {
    const absolutePath = path.resolve(configPath);
    return fs.existsSync(absolutePath);
  }

  private parseTransformerConfig(
    raw: Record<string, unknown>,
    configPath: string
  ): TransformerConfig {
    const transformerConfig: TransformerConfig = {};

    // Parse custom transformers
    if (raw.custom !== undefined) {
      if (!Array.isArray(raw.custom)) {
        throw new ConfigError(
          'transformer.custom must be an array',
          configPath,
          'transformer.custom'
        );
      }

      transformerConfig.custom = raw.custom.map((t: Record<string, unknown>, index: number) => {
        if (!t.name || typeof t.name !== 'string') {
          throw new ConfigError(
            `transformer.custom[${index}].name is required and must be a string`,
            configPath,
            `transformer.custom[${index}].name`
          );
        }

        if (!t.pattern || typeof t.pattern !== 'string') {
          throw new ConfigError(
            `transformer.custom[${index}].pattern is required and must be a string`,
            configPath,
            `transformer.custom[${index}].pattern`
          );
        }

        if (!isValidPattern(t.pattern as string)) {
          throw new ConfigError(
            `transformer.custom[${index}].pattern is not a valid regex`,
            configPath,
            `transformer.custom[${index}].pattern`
          );
        }

        if (!t.transform || typeof t.transform !== 'string') {
          throw new ConfigError(
            `transformer.custom[${index}].transform is required and must be a string`,
            configPath,
            `transformer.custom[${index}].transform`
          );
        }

        return {
          name: t.name as string,
          pattern: t.pattern as string,
          transform: t.transform as string,
          priority: t.priority as number | undefined,
          enabled: t.enabled as boolean | undefined,
          description: t.description as string | undefined,
        };
      });
    }

    // Parse built-in transformer configuration
    if (raw.builtIn !== undefined) {
      if (typeof raw.builtIn !== 'object' || raw.builtIn === null) {
        throw new ConfigError(
          'transformer.builtIn must be an object',
          configPath,
          'transformer.builtIn'
        );
      }

      transformerConfig.builtIn = {};
      const builtInRaw = raw.builtIn as Record<string, unknown>;
      for (const [key, value] of Object.entries(builtInRaw)) {
        if (typeof value !== 'object' || value === null) {
          throw new ConfigError(
            `transformer.builtIn.${key} must be an object`,
            configPath,
            `transformer.builtIn.${key}`
          );
        }
        const builtInItem = value as Record<string, unknown>;
        transformerConfig.builtIn[key as keyof typeof transformerConfig.builtIn] = {
          enabled: builtInItem.enabled !== false,
          options: builtInItem.options as Record<string, unknown> | undefined,
        };
      }
    }

    // Parse default priority
    if (raw.defaultPriority !== undefined) {
      if (typeof raw.defaultPriority !== 'number') {
        throw new ConfigError(
          'transformer.defaultPriority must be a number',
          configPath,
          'transformer.defaultPriority'
        );
      }
      transformerConfig.defaultPriority = raw.defaultPriority;
    }

    // Parse error isolation
    if (raw.errorIsolation !== undefined) {
      if (typeof raw.errorIsolation !== 'boolean') {
        throw new ConfigError(
          'transformer.errorIsolation must be a boolean',
          configPath,
          'transformer.errorIsolation'
        );
      }
      transformerConfig.errorIsolation = raw.errorIsolation;
    }

    return transformerConfig;
  }

  private validateAndBuild(
    raw: Record<string, unknown>,
    configPath: string
  ): Config {
    // Validate sourceFolders
    if (!raw.sourceFolders) {
      throw new ConfigError(
        'Missing required field: sourceFolders',
        configPath,
        'sourceFolders'
      );
    }

    if (!Array.isArray(raw.sourceFolders)) {
      throw new ConfigError(
        'sourceFolders must be an array',
        configPath,
        'sourceFolders'
      );
    }

    if (raw.sourceFolders.length === 0) {
      throw new ConfigError(
        'sourceFolders cannot be empty',
        configPath,
        'sourceFolders'
      );
    }

    const sourceFolders: SourceFolderConfig[] = raw.sourceFolders.map(
      (folder: Record<string, unknown>, index: number) => {
        if (!folder.path || typeof folder.path !== 'string') {
          throw new ConfigError(
            `sourceFolders[${index}].path is required and must be a string`,
            configPath,
            `sourceFolders[${index}].path`
          );
        }

        return {
          path: folder.path,
          include: folder.include as string | undefined,
          exclude: folder.exclude as string | undefined,
        };
      }
    );

    // Validate outputDir
    if (!raw.outputDir || typeof raw.outputDir !== 'string') {
      throw new ConfigError(
        'Missing required field: outputDir',
        configPath,
        'outputDir'
      );
    }

    const config: Config = {
      sourceFolders,
      outputDir: raw.outputDir,
      attachmentDir: (raw.attachmentDir as string) || DEFAULT_ATTACHMENT_DIR,
    };

    // Validate and load transformer configuration
    if (raw.transformer !== undefined) {
      config.transformer = this.parseTransformerConfig(
        raw.transformer as Record<string, unknown>,
        configPath
      );
    }

    return config;
  }
}