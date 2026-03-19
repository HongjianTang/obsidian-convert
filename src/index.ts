// Programmatic API
export { ObsidianConvert } from './api/ObsidianConvert';
export type {
  ObsidianConvertOptions,
  SingleFileConvertOptions,
  DirectoryConvertOptions,
  ValidateOptions,
  FileConversionResult,
  ConversionResult,
  ValidationResult,
  ValidationIssue,
  ConversionEvent,
  ConversionProgress,
  EventCallback,
} from './api/types';

// Re-export existing types for convenience
export type {
  Config,
  SourceFolderConfig,
  StreamingConfig,
  WorkerConfig,
  IncrementalConfig,
  LinkResolutionConfig,
} from './infrastructure/config/Config';

export type {
  TransformerConfig,
  Transformer,
  TransformContext,
  TransformerResult,
  BuiltInTransformerName,
} from './domain/transformer';

// Re-export converters
export {
  Converter,
  EnhancedConverter,
  StreamingConverter,
  IncrementalConverter,
} from './application/convert';

export type {
  FileConversionResult as ConverterFileResult,
  ConversionResult as ConverterConversionResult,
  ConverterOptions,
} from './application/convert';

export type {
  EnhancedConverterOptions,
  FileConversionResult as EnhancedFileResult,
  ConversionResult as EnhancedConversionResult,
} from './application/convert/EnhancedConverter';

export type {
  StreamConversionOptions,
  StreamConversionResult,
} from './application/convert/StreamingConverter';

export type {
  IncrementalOptions,
  ConversionState,
  FileConversionState,
} from './application/convert/IncrementalConverter';
