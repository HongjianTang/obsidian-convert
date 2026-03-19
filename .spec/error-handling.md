---
title: 错误处理约定
status: draft
---

# 错误处理

本文档约定项目的错误类型、传播方式、日志记录与对外返回格式。

---

## 设计原则

1. **用户友好**：错误信息清晰、可理解、不过度暴露内部细节
2. **开发友好**：错误可追踪、可定位、包含上下文信息
3. **类型安全**：使用自定义错误类型，支持类型判断
4. **分层处理**：领域错误、应用错误、基础设施错误分离

---

## 错误类型体系

### 错误基类

```typescript
// src/domain/errors/BaseError.ts
export abstract class BaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}
```

### 领域错误

```typescript
// src/domain/errors/DomainError.ts
export class DomainError extends BaseError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, `DOMAIN_${code}`, context);
  }
}

// src/domain/errors/ParseError.ts
export class ParseError extends DomainError {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(message, 'PARSE_ERROR', { filePath, line, column });
  }
}

// src/domain/errors/TransformError.ts
export class TransformError extends DomainError {
  constructor(
    message: string,
    public readonly transformer: string,
    public readonly filePath?: string
  ) {
    super(message, 'TRANSFORM_ERROR', { transformer, filePath });
  }
}

// src/domain/errors/ValidationError.ts
export class ValidationError extends DomainError {
  constructor(message: string, public readonly field: string) {
    super(message, 'VALIDATION_ERROR', { field });
  }
}
```

### 基础设施错误

```typescript
// src/infrastructure/errors/InfrastructureError.ts
export class InfrastructureError extends BaseError {
  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message, `INFRA_${code}`, context);
  }
}

// src/infrastructure/errors/FileReadError.ts
export class FileReadError extends InfrastructureError {
  constructor(filePath: string, cause?: Error) {
    super(
      `Failed to read file: ${filePath}`,
      'FILE_READ_ERROR',
      { filePath, cause: cause?.message }
    );
  }
}

// src/infrastructure/errors/FileWriteError.ts
export class FileWriteError extends InfrastructureError {
  constructor(filePath: string, cause?: Error) {
    super(
      `Failed to write file: ${filePath}`,
      'FILE_WRITE_ERROR',
      { filePath, cause: cause?.message }
    );
  }
}
```

---

## 错误传播模式

### 领域层：抛出语义化错误

```typescript
// src/domain/link/WikiLink.ts
export class WikiLink {
  static parse(text: string): WikiLink {
    const match = text.match(WIKI_LINK_REGEX);
    if (!match) {
      throw new ParseError(
        `Invalid wiki link format: ${text}`,
        'unknown',
        undefined,
        undefined
      );
    }
    return new WikiLink(match[1], match[2] || match[1]);
  }
}
```

### 应用层：捕获并转换错误

```typescript
// src/application/convert/ConvertNote.ts
export class ConvertNoteUseCase {
  async execute(input: ConvertInput): Promise<ConvertOutput> {
    try {
      const content = await this.fileReader.read(input.path);
      const note = this.parser.parse(content);
      const transformed = this.transformer.transform(note);
      await this.fileWriter.write(input.outputPath, transformed);
      return { success: true, outputPath: input.outputPath };
    } catch (error) {
      if (error instanceof FileReadError) {
        throw new ApplicationError(
          `Cannot read input file: ${input.path}`,
          'INPUT_NOT_FOUND',
          { input }
        );
      }
      if (error instanceof ParseError || error instanceof TransformError) {
        throw new ApplicationError(
          error.message,
          'CONVERSION_FAILED',
          { ...error.context, input }
        );
      }
      throw error; // 未知错误向上传播
    }
  }
}
```

### 展示层：格式化并输出错误

```typescript
// src/presentation/cli/index.ts
async function main() {
  try {
    await runCommand(process.argv);
  } catch (error) {
    if (error instanceof BaseError) {
      console.error(formatError(error));
      process.exit(getExitCode(error));
    } else {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  }
}

function formatError(error: BaseError): string {
  let message = `Error: ${error.message}`;

  if (error instanceof ParseError && error.line) {
    message += `\n  at line ${error.line}`;
  }

  if (error.context?.filePath) {
    message += `\n  file: ${error.context.filePath}`;
  }

  return message;
}

function getExitCode(error: BaseError): number {
  if (error instanceof ValidationError) return 2;
  if (error instanceof FileReadError) return 3;
  if (error instanceof TransformError) return 4;
  return 1;
}
```

---

## CLI 错误输出格式

### 文本格式（默认）

```
Error: Invalid wiki link format: [[invalid
  at line 5
  file: notes/my-note.md

For more information, run: obsidian-convert --help
```

### JSON 格式（--json）

```json
{
  "success": false,
  "error": {
    "code": "DOMAIN_PARSE_ERROR",
    "message": "Invalid wiki link format: [[invalid",
    "context": {
      "filePath": "notes/my-note.md",
      "line": 5
    }
  }
}
```

---

## 退出码定义

| 退出码 | 含义 | 说明 |
|--------|------|------|
| 0 | 成功 | 操作完成 |
| 1 | 通用错误 | 未分类错误 |
| 2 | 参数错误 | 命令行参数无效 |
| 3 | 输入错误 | 输入文件不存在或无法读取 |
| 4 | 转换错误 | 转换过程中出现错误 |
| 5 | 输出错误 | 无法写入输出文件 |

---

## 错误恢复策略

### 可重试错误

某些基础设施错误可重试：

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(delayMs * (i + 1));
      }
    }
  }

  throw lastError;
}
```

### 部分失败处理

批量转换时，记录失败但继续处理：

```typescript
interface BatchResult {
  success: string[];
  failed: Array<{ file: string; error: Error }>;
}

async function convertBatch(files: string[]): Promise<BatchResult> {
  const result: BatchResult = { success: [], failed: [] };

  for (const file of files) {
    try {
      await convertNote(file);
      result.success.push(file);
    } catch (error) {
      result.failed.push({ file, error: error as Error });
    }
  }

  return result;
}
```

---

## 日志规范

### 日志级别

| 级别 | 使用场景 |
|------|----------|
| debug | 详细调试信息（`--verbose` 时输出） |
| info | 常规操作信息 |
| warn | 警告信息，不影响主流程 |
| error | 错误信息，需要关注 |

### 日志格式

```typescript
// 结构化日志
{
  "level": "error",
  "timestamp": "2024-01-15T10:30:00Z",
  "message": "Failed to transform wiki link",
  "context": {
    "file": "notes/my-note.md",
    "line": 5,
    "link": "[[invalid"
  },
  "error": {
    "type": "ParseError",
    "code": "DOMAIN_PARSE_ERROR",
    "stack": "..."
  }
}
```

### 敏感信息处理

- 禁止在日志中记录敏感信息（密钥、密码、内部路径）
- 文件路径使用相对路径或脱敏处理

---

## 常见错误场景

### 1. 文件不存在

```typescript
// 抛出
throw new FileReadError(filePath);

// 输出
Error: Failed to read file: notes/missing.md
  The file does not exist or is not readable.
```

### 2. 无效的 WikiLink

```typescript
// 抛出
throw new ParseError('Invalid wiki link format', filePath, lineNumber);

// 输出
Error: Invalid wiki link format: [[broken link
  at line 10
  file: notes/my-note.md
```

### 3. 转换失败

```typescript
// 抛出
throw new TransformError('Cannot resolve link target', 'LinkTransformer', filePath);

// 输出
Error: Cannot resolve link target: [[missing-note]]
  file: notes/my-note.md
```

---

## 禁止事项

1. **禁止暴露堆栈给用户**
   ```typescript
   // ❌ 禁止
   console.error(error.stack);
   ```

2. **禁止吞掉错误**
   ```typescript
   // ❌ 禁止
   try { ... } catch (e) { /* ignore */ }
   ```

3. **禁止记录敏感信息**
   ```typescript
   // ❌ 禁止
   logger.info(`Processing with key: ${apiKey}`);
   ```