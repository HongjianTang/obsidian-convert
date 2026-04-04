import * as fs from 'fs';
import * as path from 'path';
import { YamlConfigLoader, ConfigError } from '../../../../src/infrastructure/config/YamlConfigLoader';

describe('YamlConfigLoader', () => {
  const loader = new YamlConfigLoader();
  const testConfigDir = path.join(__dirname, '../fixtures');

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test config files
    const testFiles = [
      path.join(testConfigDir, 'valid-config.yaml'),
      path.join(testConfigDir, 'invalid-yaml.yaml'),
      path.join(testConfigDir, 'missing-sourceFolders.yaml'),
      path.join(testConfigDir, 'empty-sourceFolders.yaml'),
      path.join(testConfigDir, 'missing-outputDir.yaml'),
    ];
    for (const file of testFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  });

  describe('load', () => {
    it('should load a valid configuration file', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test-vault
    include: "*.md"
    exclude: "*.tmp.md"
outputDir: ./output
attachmentDir: public/attachments
transformer:
  custom:
    - name: my-transformer
      pattern: '.*'
      transform: "[$1](https://example.com/$1)"
  builtIn:
    wikiLinks:
      enabled: true
  defaultPriority: 100
  errorIsolation: true
`);

      const config = await loader.load(configPath);

      expect(config.sourceFolders).toHaveLength(1);
      expect(config.sourceFolders[0].path).toBe('./test-vault');
      expect(config.outputDir).toBe('./output');
      expect(config.attachmentDir).toBe('public/attachments');
      expect(config.transformer).toBeDefined();
      expect(config.transformer!.custom).toHaveLength(1);
      expect(config.transformer!.builtIn).toBeDefined();
    });

    it('should throw ConfigError when config file not found', async () => {
      const nonExistentPath = path.join(testConfigDir, 'non-existent.yaml');

      await expect(loader.load(nonExistentPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(nonExistentPath)).rejects.toThrow('Configuration file not found');
    });

    it('should throw ConfigError for invalid YAML syntax', async () => {
      const configPath = path.join(testConfigDir, 'invalid-yaml.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
  invalid: this line is improperly indented
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
    });

    it('should throw ConfigError when sourceFolders is missing', async () => {
      const configPath = path.join(testConfigDir, 'missing-sourceFolders.yaml');
      fs.writeFileSync(configPath, `
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('Missing required field: sourceFolders');
    });

    it('should throw ConfigError when sourceFolders is not an array', async () => {
      const configPath = path.join(testConfigDir, 'missing-sourceFolders.yaml');
      fs.writeFileSync(configPath, `
sourceFolders: "./test"
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('sourceFolders must be an array');
    });

    it('should throw ConfigError when sourceFolders is empty', async () => {
      const configPath = path.join(testConfigDir, 'empty-sourceFolders.yaml');
      fs.writeFileSync(configPath, `
sourceFolders: []
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('sourceFolders cannot be empty');
    });

    it('should throw ConfigError when sourceFolders path is missing', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - include: "*.md"
outputDir: ./output
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('sourceFolders[0].path is required and must be a string');
    });

    it('should throw ConfigError when outputDir is missing', async () => {
      const configPath = path.join(testConfigDir, 'missing-outputDir.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('Missing required field: outputDir');
    });

    it('should throw ConfigError when transformer.custom is not an array', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  custom: "not an array"
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.custom must be an array');
    });

    it('should throw ConfigError when transformer custom entry has missing name', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  custom:
    - pattern: 'pattern: "(.*?)"'
      transform: "[$1]"
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.custom[0].name is required and must be a string');
    });

    it('should throw ConfigError when transformer custom entry has missing pattern', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  custom:
    - name: "test"
      transform: "[$1]"
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.custom[0].pattern is required and must be a string');
    });

    it('should throw ConfigError when transformer custom entry has invalid regex', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  custom:
    - name: "test"
      pattern: "[invalid(regex"
      transform: "[$1]"
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.custom[0].pattern is not a valid regex');
    });

    it('should throw ConfigError when transformer custom entry has missing transform', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  custom:
    - name: "test"
      pattern: '.*'
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.custom[0].transform is required and must be a string');
    });

    it('should throw ConfigError when transformer.builtIn is not an object', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  builtIn: "not an object"
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.builtIn must be an object');
    });

    it('should throw ConfigError when transformer.defaultPriority is not a number', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  defaultPriority: "not a number"
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.defaultPriority must be a number');
    });

    it('should throw ConfigError when transformer.errorIsolation is not a boolean', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  errorIsolation: "yes"
`);

      await expect(loader.load(configPath)).rejects.toThrow(ConfigError);
      await expect(loader.load(configPath)).rejects.toThrow('transformer.errorIsolation must be a boolean');
    });

    it('should use default attachmentDir when not specified', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
`);

      const config = await loader.load(configPath);
      expect(config.attachmentDir).toBe('public/attachments');
    });

    it('should parse transformer.builtIn configuration correctly', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  builtIn:
    wikiLinks:
      enabled: false
    callouts:
      enabled: true
      options:
        style: "callout"
`);

      const config = await loader.load(configPath);
      expect(config.transformer).toBeDefined();
      expect(config.transformer!.builtIn).toBeDefined();
    });

    it('should handle transformer entry with all optional fields', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
transformer:
  custom:
    - name: "full-transformer"
      pattern: '.*'
      transform: "[$1]"
      priority: 200
      enabled: false
      description: "A test transformer"
`);

      const config = await loader.load(configPath);
      expect(config.transformer!.custom).toHaveLength(1);
      expect(config.transformer!.custom![0].priority).toBe(200);
      expect(config.transformer!.custom![0].enabled).toBe(false);
      expect(config.transformer!.custom![0].description).toBe('A test transformer');
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const configPath = path.join(testConfigDir, 'valid-config.yaml');
      fs.writeFileSync(configPath, `
sourceFolders:
  - path: ./test
outputDir: ./output
`);

      const result = await loader.exists(configPath);
      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      const result = await loader.exists(path.join(testConfigDir, 'non-existent.yaml'));
      expect(result).toBe(false);
    });
  });

  describe('ConfigError', () => {
    it('should have correct name property', () => {
      const error = new ConfigError('test error');
      expect(error.name).toBe('ConfigError');
    });

    it('should preserve stack trace', () => {
      const error = new ConfigError('test error');
      expect(error.stack).toBeDefined();
    });
  });
});