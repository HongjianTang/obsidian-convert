---
title: 编码规范
status: draft
---

## 适用范围

本规范适用于本仓库内的 **全部 TypeScript 代码**，遵循 **整洁架构** 和 **DDD 分层**。

---

## 原则（KISS）

1. **清晰优先**：代码可读性优先于"炫技"
2. **可回滚**：每次提交应可独立回滚
3. **可测试**：所有业务逻辑可单元测试
4. **可定位**：问题可快速定位到具体模块

---

## 项目结构约定

### 分层规则

```
Domain (最内层)     → 不依赖任何外层
Application         → 可依赖 Domain
Presentation        → 可依赖 Application、Domain
Infrastructure (最外层) → 可依赖所有内层
```

### 文件组织

- 每个文件导出一个主要类型（类/接口/函数）
- 文件名与导出的主要类型名一致
- 使用 `index.ts` 统一导出模块

---

## 命名规范

### 基本风格

| 类型 | 风格 | 示例 |
|------|------|------|
| 变量、参数 | camelCase | `notePath`, `transformResult` |
| 函数、方法 | camelCase | `parseNote()`, `transformLink()` |
| 类、接口、类型 | PascalCase | `Note`, `WikiLink`, `Transformer` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_ENCODING` |
| 枚举 | PascalCase | `TransformStatus` |
| 枚举值 | UPPER_SNAKE_CASE | `TransformStatus.SUCCESS` |
| 文件 | PascalCase | `Note.ts`, `WikiLink.ts` |
| 目录 | kebab-case | `note/`, `transformer/` |

### 领域命名

使用业务语言，避免技术术语：

```typescript
// ✅ 好
class WikiLink {
  constructor(public readonly target: string) {}
}

// ❌ 不好 - 技术术语
class LinkDto {
  constructor(public readonly href: string) {}
}
```

### 层次命名约定

| 层次 | 后缀/前缀 | 示例 |
|------|-----------|------|
| Domain Entity | 无 | `Note`, `Document` |
| Domain Value Object | 无 | `WikiLink`, `Frontmatter` |
| Domain Service | 无 | `NoteParser`, `LinkTransformer` |
| Application UseCase | UseCase 或动词 | `ConvertNoteUseCase`, `ConvertNote` |
| Application DTO | Input/Output | `ConvertInput`, `ConvertOutput` |
| Presentation Command | Command | `ConvertCommand` |
| Presentation Formatter | Formatter | `JsonFormatter` |
| Infrastructure | 无 | `FileReader`, `ConfigLoader` |

### 布尔变量命名

使用 `is`、`has`、`should`、`can` 前缀：

```typescript
// ✅ 好
const isValid: boolean;
const hasLinks: boolean;
const shouldTransform: boolean;

// ❌ 不好
const valid: boolean;
const links: boolean;
```

---

## 类型定义

### 优先使用 interface

```typescript
// ✅ 好 - interface 可扩展
interface Transformer {
  transform(content: string): string;
}

// ❌ 不好 - type 用于简单别名
type Transformer = {
  transform(content: string): string;
};
```

### 使用 type 的场景

```typescript
// 联合类型
type TransformStatus = 'pending' | 'success' | 'failed';

// 工具类型
type NoteId = string & { readonly brand: unique symbol };
```

### 避免 any

```typescript
// ✅ 好
function parse(content: string): unknown {
  // ...
}

// ❌ 不好
function parse(content: string): any {
  // ...
}
```

---

## 函数设计

### 单一职责

```typescript
// ✅ 好 - 每个函数做一件事
function parseWikiLinks(content: string): WikiLink[] { ... }
function transformWikiLink(link: WikiLink): string { ... }

// ❌ 不好 - 函数做太多事
function processContent(content: string): string {
  const links = parseLinks(content);
  const transformed = transformLinks(links);
  return replaceContent(content, transformed);
}
```

### 纯函数优先

领域层应尽量使用纯函数：

```typescript
// ✅ 好 - 纯函数，可预测
function transformWikiLink(link: WikiLink, basePath: string): string {
  return `[${link.text}](${basePath}/${link.target}.md)`;
}

// ❌ 不好 - 依赖外部状态
function transformWikiLink(link: WikiLink): string {
  const basePath = globalConfig.basePath; // 依赖全局状态
  return `[${link.text}](${basePath}/${link.target}.md)`;
}
```

### 参数数量

函数参数不超过 3 个，超过则使用对象：

```typescript
// ✅ 好
interface TransformOptions {
  input: string;
  output: string;
  format: 'md' | 'mdx';
  verbose: boolean;
}
function transform(options: TransformOptions): Result { ... }

// ❌ 不好
function transform(input: string, output: string, format: string, verbose: boolean): Result { ... }
```

---

## 错误处理

### 使用自定义错误类型

```typescript
// 定义领域错误
class TransformError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly line?: number
  ) {
    super(message);
    this.name = 'TransformError';
  }
}

// 使用
throw new TransformError('Invalid wiki link', 'note.md', 10);
```

### 不捕获可恢复的错误

```typescript
// ✅ 好 - 让调用者决定如何处理
function transformNote(note: Note): string {
  if (!note.isValid()) {
    throw new TransformError('Invalid note', note.path);
  }
  return transform(note);
}

// ❌ 不好 - 静默吞掉错误
function transformNote(note: Note): string | null {
  if (!note.isValid()) {
    return null; // 调用者不知道为什么失败
  }
  return transform(note);
}
```

### 边界处理错误

在展示层（CLI）捕获并格式化错误：

```typescript
// presentation/cli/index.ts
try {
  await convertCommand.execute(input, options);
} catch (error) {
  if (error instanceof TransformError) {
    console.error(`Error in ${error.filePath}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
```

---

## 依赖注入

### 构造函数注入

```typescript
// ✅ 好 - 通过构造函数注入
class ConvertNoteUseCase {
  constructor(
    private readonly noteParser: NoteParser,
    private readonly fileReader: FileReader,
    private readonly fileWriter: FileWriter
  ) {}

  async execute(input: ConvertInput): Promise<ConvertOutput> {
    // ...
  }
}

// ❌ 不好 - 内部创建依赖
class ConvertNoteUseCase {
  private noteParser = new NoteParser(); // 紧耦合
}
```

### 接口优于实现

```typescript
// domain/transformer/Transformer.ts
export interface Transformer {
  transform(content: string): string;
}

// application/convert/ConvertNote.ts
class ConvertNoteUseCase {
  constructor(private readonly transformer: Transformer) {
    // 依赖接口，不关心具体实现
  }
}
```

---

## 测试相关

### 可测试设计

```typescript
// ✅ 好 - 可注入依赖，易于测试
class LinkTransformer implements Transformer {
  constructor(private readonly pathResolver: PathResolver) {}

  transform(link: WikiLink): string {
    const resolvedPath = this.pathResolver.resolve(link.target);
    return `[${link.text}](${resolvedPath})`;
  }
}

// 测试
const mockResolver = { resolve: jest.fn().mockReturnValue('./note.md') };
const transformer = new LinkTransformer(mockResolver);
```

### 测试命名

```typescript
describe('WikiLink', () => {
  describe('parse', () => {
    it('should parse simple wiki link', () => {
      // ...
    });

    it('should parse wiki link with display text', () => {
      // ...
    });

    it('should throw error for invalid format', () => {
      // ...
    });
  });
});
```

---

## 注释规范

### 自解释代码优先

```typescript
// ✅ 好 - 代码自解释
const MAX_LINK_LENGTH = 100;
if (link.target.length > MAX_LINK_LENGTH) {
  throw new TransformError('Link target too long');
}

// ❌ 不好 - 需要注释解释
if (link.target.length > 100) { // max length is 100
  throw new TransformError('Link target too long');
}
```

### 必要的注释

```typescript
// WikiLink 格式：[[target]] 或 [[target|display]]
// 需要处理管道符分隔的情况
function parseWikiLink(text: string): WikiLink {
  // ...
}

/**
 * 将 WikiLink 转换为相对路径 Markdown 链接
 * @param link - WikiLink 值对象
 * @param basePath - 基础路径，用于计算相对路径
 * @returns Markdown 格式的链接文本
 */
function transformToMarkdown(link: WikiLink, basePath: string): string {
  // ...
}
```

---

## 禁止事项

1. **禁止在 Domain 层使用 Node.js API**
   ```typescript
   // ❌ 禁止
   import { readFileSync } from 'fs';
   import path from 'path';
   ```

2. **禁止跨层依赖**
   ```typescript
   // ❌ 禁止 - Domain 依赖 Application
   import { ConvertInput } from '../../application/dto';
   ```

3. **禁止全局可变状态**
   ```typescript
   // ❌ 禁止
   let config: Config;
   export function getConfig() { return config; }
   ```

4. **禁止魔法字符串/数字**
   ```typescript
   // ❌ 禁止
   if (status === 'success') { ... }
   if (count > 100) { ... }

   // ✅ 应定义常量或枚举
   const STATUS_SUCCESS = 'success';
   const MAX_LINK_LENGTH = 100;
   ```