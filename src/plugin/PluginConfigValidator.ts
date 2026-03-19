import type { PluginManifest, PluginConfigItem } from './types';

/**
 * Validates plugin manifests and configurations
 */
export class PluginConfigValidator {
  /**
   * Validate a plugin manifest
   * @returns Validation result with errors if invalid
   */
  validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== 'object') {
      return { valid: false, errors: ['Manifest must be an object'] };
    }

    const m = manifest as Record<string, unknown>;

    // Required fields
    if (!m.id || typeof m.id !== 'string') {
      errors.push('id is required and must be a string');
    } else if (!/^[a-z][a-z0-9-_]*$/.test(m.id)) {
      errors.push('id must start with lowercase letter and contain only lowercase letters, numbers, hyphens, and underscores');
    } else if (m.id.length > 64) {
      errors.push('id must be 64 characters or less');
    }

    if (!m.name || typeof m.name !== 'string') {
      errors.push('name is required and must be a string');
    } else if (m.name.length > 128) {
      errors.push('name must be 128 characters or less');
    }

    if (!m.version || typeof m.version !== 'string') {
      errors.push('version is required and must be a string');
    } else if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(m.version)) {
      errors.push('version must be a valid semantic version (e.g., 1.0.0)');
    }

    if (!m.main || typeof m.main !== 'string') {
      errors.push('main is required and must be a string');
    }

    if (!m.type || typeof m.type !== 'string') {
      errors.push('type is required and must be a string');
    } else {
      const validTypes = ['transformer', 'link-handler', 'callout-handler', 'full'];
      if (!validTypes.includes(m.type)) {
        errors.push(`type must be one of: ${validTypes.join(', ')}`);
      }
    }

    // Optional fields validation
    if (m.description !== undefined && typeof m.description !== 'string') {
      errors.push('description must be a string');
    } else if (m.description && m.description.length > 512) {
      errors.push('description must be 512 characters or less');
    }

    if (m.author !== undefined) {
      if (typeof m.author !== 'object' || m.author === null) {
        errors.push('author must be an object');
      } else {
        const author = m.author as Record<string, unknown>;
        if (!author.name || typeof author.name !== 'string') {
          errors.push('author.name is required');
        }
        if (author.email !== undefined && typeof author.email !== 'string') {
          errors.push('author.email must be a string');
        }
        if (author.url !== undefined && typeof author.url !== 'string') {
          errors.push('author.url must be a string');
        }
      }
    }

    if (m.dependencies !== undefined) {
      if (typeof m.dependencies !== 'object' || m.dependencies === null) {
        errors.push('dependencies must be an object');
      }
    }

    if (m.tags !== undefined) {
      if (!Array.isArray(m.tags)) {
        errors.push('tags must be an array');
      } else {
        const uniqueTags = new Set(m.tags);
        if (uniqueTags.size !== m.tags.length) {
          errors.push('tags must be unique');
        }
        for (const tag of m.tags) {
          if (typeof tag !== 'string') {
            errors.push('each tag must be a string');
            break;
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate plugin configuration against a schema
   */
  validateConfig(
    config: unknown,
    _schema: unknown
  ): { valid: boolean; errors: string[] } {
    // Basic validation - config must be an object if provided
    if (config !== undefined && (typeof config !== 'object' || config === null)) {
      return { valid: false, errors: ['Config must be an object'] };
    }
    return { valid: true, errors: [] };
  }

  /**
   * Validate a configuration item definition
   */
  validateConfigItem(item: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!item || typeof item !== 'object') {
      return { valid: false, errors: ['Config item must be an object'] };
    }

    const i = item as Record<string, unknown>;

    if (!i.key || typeof i.key !== 'string') {
      errors.push('key is required and must be a string');
    }

    if (!i.type || typeof i.type !== 'string') {
      errors.push('type is required and must be a string');
    } else {
      const validTypes = ['string', 'number', 'boolean', 'array', 'object', 'select'];
      if (!validTypes.includes(i.type)) {
        errors.push(`type must be one of: ${validTypes.join(', ')}`);
      }
    }

    if (i.description !== undefined && typeof i.description !== 'string') {
      errors.push('description must be a string');
    }

    if (i.required !== undefined && typeof i.required !== 'boolean') {
      errors.push('required must be a boolean');
    }

    if (i.options !== undefined) {
      if (!Array.isArray(i.options)) {
        errors.push('options must be an array');
      } else {
        for (const opt of i.options) {
          if (typeof opt !== 'object' || opt === null) {
            errors.push('each option must be an object');
            break;
          }
          const o = opt as Record<string, unknown>;
          if (!o.label || typeof o.label !== 'string') {
            errors.push('option.label is required and must be a string');
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate plugin ID format
   */
  validatePluginId(id: string): { valid: boolean; error?: string } {
    if (!id) {
      return { valid: false, error: 'Plugin ID is required' };
    }
    if (id.length > 64) {
      return { valid: false, error: 'Plugin ID must be 64 characters or less' };
    }
    if (!/^[a-z][a-z0-9-_]*$/.test(id)) {
      return {
        valid: false,
        error: 'Plugin ID must start with lowercase letter and contain only lowercase letters, numbers, hyphens, and underscores',
      };
    }
    return { valid: true };
  }

  /**
   * Validate semantic version string
   */
  validateVersion(version: string): { valid: boolean; error?: string } {
    if (!version) {
      return { valid: false, error: 'Version is required' };
    }
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(version)) {
      return {
        valid: false,
        error: 'Version must be a valid semantic version (e.g., 1.0.0)',
      };
    }
    return { valid: true };
  }

  /**
   * Validate plugin type
   */
  validatePluginType(type: string): { valid: boolean; error?: string } {
    const validTypes = ['transformer', 'link-handler', 'callout-handler', 'full'];
    if (!validTypes.includes(type)) {
      return {
        valid: false,
        error: `Plugin type must be one of: ${validTypes.join(', ')}`,
      };
    }
    return { valid: true };
  }

  /**
   * Check if a manifest has all required fields
   */
  checkRequiredFields(manifest: Record<string, unknown>): string[] {
    const errors: string[] = [];

    if (!manifest.id) {
      errors.push('id is required');
    }
    if (!manifest.name) {
      errors.push('name is required');
    }
    if (!manifest.version) {
      errors.push('version is required');
    }
    if (!manifest.main) {
      errors.push('main is required');
    }
    if (!manifest.type) {
      errors.push('type is required');
    }

    return errors;
  }
}
