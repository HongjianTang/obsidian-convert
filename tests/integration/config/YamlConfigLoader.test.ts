import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { YamlConfigLoader, ConfigError } from '../../../src/infrastructure/config/YamlConfigLoader';

describe('YamlConfigLoader', () => {
  let loader: YamlConfigLoader;
  let tempDir: string;

  beforeEach(() => {
    loader = new YamlConfigLoader();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('should load valid configuration', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./notes
outputDir: ./output
`);
      const config = await loader.load(configPath);

      expect(config.sourceFolders).toHaveLength(1);
      expect(config.sourceFolders[0].path).toBe('./notes');
      expect(config.outputDir).toBe('./output');
      expect(config.attachmentDir).toBe('public/attachments');
    });

    it('should load configuration with all options', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./notes
    include: "*.md"
    exclude: "*.draft.md"
  - path: ./docs
outputDir: ./output
attachmentDir: custom/attachments
`);
      const config = await loader.load(configPath);

      expect(config.sourceFolders).toHaveLength(2);
      expect(config.sourceFolders[0].path).toBe('./notes');
      expect(config.sourceFolders[0].include).toBe('*.md');
      expect(config.sourceFolders[0].exclude).toBe('*.draft.md');
      expect(config.sourceFolders[1].path).toBe('./docs');
      expect(config.outputDir).toBe('./output');
      expect(config.attachmentDir).toBe('custom/attachments');
    });

    it('should throw ConfigError when file not found', async () => {
      const configPath = path.join(tempDir, 'nonexistent.yaml');

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('Configuration file not found');
    });

    it('should throw ConfigError when sourceFolders missing', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('Missing required field: sourceFolders');
    });

    it('should throw ConfigError when sourceFolders is not an array', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  path: ./notes
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow('sourceFolders must be an array');
    });

    it('should throw ConfigError when sourceFolders is empty', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders: []
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow('sourceFolders cannot be empty');
    });

    it('should throw ConfigError when sourceFolder path is missing', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - {}
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow('sourceFolders[0].path is required');
    });

    it('should throw ConfigError when outputDir is missing', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./notes
`);

      await expect(loader.load(configPath)).rejects.toThrow('Missing required field: outputDir');
    });

    it('should throw ConfigError when outputDir is not a string', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./notes
outputDir: 123
`);

      await expect(loader.load(configPath)).rejects.toThrow('Missing required field: outputDir');
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'test');

      const result = await loader.exists(configPath);
      expect(result).toBe(true);
    });

    it('should return false when file does not exist', async () => {
      const configPath = path.join(tempDir, 'nonexistent.yaml');

      const result = await loader.exists(configPath);
      expect(result).toBe(false);
    });

    it('should work with relative paths', async () => {
      const configPath = path.join(tempDir, 'config.yaml');
      fs.writeFileSync(configPath, 'test');

      const originalDir = process.cwd();
      process.chdir(tempDir);

      try {
        const result = await loader.exists('config.yaml');
        expect(result).toBe(true);
      } finally {
        process.chdir(originalDir);
      }
    });
  });
});