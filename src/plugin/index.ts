// Plugin types
export type {
  PluginManifest,
  PluginConfigItem,
  PluginSandboxContext,
  ResourceLimits,
  PluginAPIKind,
  PluginHooks,
  ConvertContext,
  FileContext,
  FileResult,
  PluginError,
  ErrorContext,
  ObsidianConvertPlugin,
  PluginAPI,
  PluginEvent,
  PluginEventCallback,
  ConversionResult,
  PluginOptions,
  PluginLoadOptions,
  LoadedPlugin,
} from './types';

// API utilities
export { SandboxPluginAPI, createSandboxContext, createSafeConsole, createSafeProcess } from './api';

// Plugin components
export { PluginSandbox, createBasicSandboxContext } from './PluginSandbox';
export { PluginLoader } from './PluginLoader';
export { PluginRegistry } from './PluginRegistry';
export { HookDispatcher } from './HookDispatcher';
export { PluginErrorHandler, ErrorSeverity } from './PluginErrorHandler';
export { PluginConfigValidator } from './PluginConfigValidator';
export { PluginHost } from './PluginHost';
export type { PluginHostOptions } from './PluginHost';
