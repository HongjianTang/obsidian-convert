import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { Config, ConfigLoader, SourceFolderConfig } from './Config';

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

    return {
      sourceFolders,
      outputDir: raw.outputDir,
      attachmentDir: (raw.attachmentDir as string) || DEFAULT_ATTACHMENT_DIR,
    };
  }
}