import type {
  PluginAPI,
  PluginEvent,
  PluginEventCallback,
  PluginSandboxContext,
  ResourceLimits,
  PluginAPIKind,
} from './types';
import type { Transformer } from '../domain/transformer';

/**
 * Create a sandbox context with allowed APIs based on plugin type
 */
export function createSandboxContext(
  pluginId: string,
  pluginVersion: string,
  pluginType: string,
  resourceLimits: ResourceLimits
): PluginSandboxContext {
  return {
    pluginId,
    pluginVersion,
    allowedAPIs: resolveAllowedAPIs(pluginType),
    resourceLimits,
  };
}

/**
 * Resolve which APIs a plugin type is allowed to access
 */
function resolveAllowedAPIs(pluginType: string): Set<PluginAPIKind> {
  const baseAPIs: PluginAPIKind[] = [
    'config:get',
    'logger:info',
    'logger:warn',
    'logger:error',
  ];

  switch (pluginType) {
    case 'transformer':
      return new Set([...baseAPIs, 'transformer:register', 'transformer:unregister']);
    case 'link-handler':
      return new Set([...baseAPIs, 'file:read']);
    case 'callout-handler':
      return new Set([...baseAPIs, 'file:read']);
    case 'full':
      return new Set([
        ...baseAPIs,
        'file:read',
        'file:write',
        'http:fetch',
        'transformer:register',
        'transformer:unregister',
        'hook:on',
        'hook:off',
      ]);
    default:
      return new Set(baseAPIs);
  }
}

/**
 * Plugin API implementation for use within sandbox
 */
export class SandboxPluginAPI implements PluginAPI {
  private allowedAPIs: Set<PluginAPIKind>;
  private config: Record<string, unknown>;
  private transformers: Transformer[] = [];
  private eventHandlers: Map<PluginEvent, Set<PluginEventCallback>> = new Map();
  private loggerPrefix: string;

  constructor(
    private pluginId: string,
    allowedAPIs: Set<PluginAPIKind>,
    initialConfig: Record<string, unknown> = {}
  ) {
    this.allowedAPIs = allowedAPIs;
    this.config = { ...initialConfig };
    this.loggerPrefix = `[${pluginId}]`;
  }

  getConfig<T = unknown>(key: string, defaultValue?: T): T {
    return (this.config[key] as T) ?? defaultValue!;
  }

  setConfig(key: string, value: unknown): void {
    if (!this.allowedAPIs.has('config:set')) {
      throw new Error('config:set is not allowed for this plugin');
    }
    this.config[key] = value;
  }

  get logger(): PluginAPI['logger'] {
    return {
      info: (message: string, ...args: unknown[]) => {
        if (this.allowedAPIs.has('logger:info')) {
          console.info(this.loggerPrefix, message, ...args);
        }
      },
      warn: (message: string, ...args: unknown[]) => {
        if (this.allowedAPIs.has('logger:warn')) {
          console.warn(this.loggerPrefix, message, ...args);
        }
      },
      error: (message: string, ...args: unknown[]) => {
        if (this.allowedAPIs.has('logger:error')) {
          console.error(this.loggerPrefix, message, ...args);
        }
      },
    };
  }

  registerTransformer(transformer: Transformer): void {
    if (!this.allowedAPIs.has('transformer:register')) {
      throw new Error('transformer:register is not allowed for this plugin');
    }
    if (!transformer.name) {
      throw new Error('Transformer must have a name');
    }
    this.transformers.push(transformer);
  }

  unregisterTransformer(name: string): boolean {
    if (!this.allowedAPIs.has('transformer:unregister')) {
      throw new Error('transformer:unregister is not allowed for this plugin');
    }
    const index = this.transformers.findIndex(t => t.name === name);
    if (index !== -1) {
      this.transformers.splice(index, 1);
      return true;
    }
    return false;
  }

  on(event: PluginEvent, callback: PluginEventCallback): void {
    if (!this.allowedAPIs.has('hook:on')) {
      throw new Error('hook:on is not allowed for this plugin');
    }
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
  }

  off(event: PluginEvent, callback: PluginEventCallback): void {
    if (!this.allowedAPIs.has('hook:off')) {
      throw new Error('hook:off is not allowed for this plugin');
    }
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  /**
   * Get all registered transformers
   */
  getTransformers(): Transformer[] {
    return [...this.transformers];
  }

  /**
   * Get event handlers for a specific event
   */
  getEventHandlers(event: PluginEvent): Set<PluginEventCallback> {
    return this.eventHandlers.get(event) || new Set();
  }
}

/**
 * Create a safe console proxy for sandboxed code
 */
// Using a more permissive type to avoid missing properties error
export function createSafeConsole(pluginId: string): Record<string, unknown> {
  const prefix = `[${pluginId}]`;
  return {
    log: (...args: unknown[]) => console.log(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
    info: (...args: unknown[]) => console.info(prefix, ...args),
    debug: (...args: unknown[]) => console.debug(prefix, ...args),
    clear: () => console.clear(),
    assert: (condition: boolean, ...args: unknown[]) => console.assert?.(condition, prefix, ...args),
    count: (label?: string) => console.count?.(label ? `${prefix} ${label}` : prefix),
    countReset: (label?: string) => console.countReset?.(label ? `${prefix} ${label}` : prefix),
    group: (...label: unknown[]) => console.group?.(prefix, ...label),
    groupEnd: () => console.groupEnd?.(),
    groupCollapsed: (...label: unknown[]) => console.groupCollapsed?.(prefix, ...label),
    table: (data: unknown) => console.table?.(data),
    time: (label?: string) => console.time?.(label ? `${prefix} ${label}` : prefix),
    timeEnd: (label?: string) => console.timeEnd?.(label ? `${prefix} ${label}` : prefix),
    timeLog: (label?: string) => console.timeLog?.(label ? `${prefix} ${label}` : prefix),
    dir: (data: unknown) => console.dir?.(data),
    dirxml: (data: unknown) => console.dirxml?.(data),
  };
}

/**
 * Create a safe process object for sandboxed code
 */
export function createSafeProcess(): typeof process {
  const safeProcess = {
    env: {},
    cwd: () => '/',
    platform: 'linux',
    release: { name: 'node' },
    version: 'v16.0.0',
    arch: 'x64',
    pid: 0,
    ppid: 0,
    title: 'plugin-sandbox',
  };
  return safeProcess as typeof process;
}
