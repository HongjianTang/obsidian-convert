---
title: API 规范
status: draft
---

## 概览

当前阶段，系统对外提供 **命令行接口（CLI）**，用于将 Obsidian 笔记转换为 fumadocs 兼容格式。

本文档约定：
- CLI 接口契约（命令、参数、输出、退出码）
- 未来若引入 HTTP API 或库接口，应在此扩展统一规范

## CLI 接口约定

### 命令名

通过 `package.json` 的 `bin` 字段导出：`obsidian-convert`

```bash
# 全局安装后
obsidian-convert <command> [options]

# 或直接运行
node dist/presentation/cli/index.js <command> [options]
```

### 命令列表

#### `convert` - 转换笔记

将 Obsidian 笔记转换为 fumadocs 兼容格式。

**语法**

```bash
obsidian-convert convert <input> [options]
```

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `input` | string | 是 | 输入文件或目录路径 |
| `-o, --output <path>` | string | 否 | 输出目录，默认为输入目录 |
| `-f, --format <format>` | string | 否 | 输出格式：`mdx`（默认）、`md` |
| `--config <path>` | string | 否 | 配置文件路径 |
| `--dry-run` | boolean | 否 | 预览转换结果，不写入文件 |
| `-v, --verbose` | boolean | 否 | 显示详细输出 |
| `--json` | boolean | 否 | 以 JSON 格式输出结果 |

**示例**

```bash
# 转换单个文件
obsidian-convert convert note.md

# 转换目录
obsidian-convert convert ./vault/notes -o ./docs

# 指定输出格式
obsidian-convert convert note.md -f mdx -o ./output

# 预览转换（不写入）
obsidian-convert convert note.md --dry-run

# JSON 输出（便于脚本处理）
obsidian-convert convert ./vault -o ./docs --json
```

**输出**

成功时：
- 默认：打印转换文件列表
  ```
  Converted 3 files:
  - note1.md → output/note1.mdx
  - note2.md → output/note2.mdx
  - note3.md → output/note3.mdx
  ```
- `--json`：
  ```json
  {
    "success": true,
    "files": [
      { "input": "note1.md", "output": "output/note1.mdx" },
      { "input": "note2.md", "output": "output/note2.mdx" }
    ],
    "stats": {
      "total": 3,
      "converted": 3,
      "skipped": 0,
      "errors": 0
    }
  }
  ```

**退出码**

| 退出码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1 | 通用错误 |
| 2 | 参数错误 |
| 3 | 输入文件不存在 |
| 4 | 转换错误（部分或全部文件转换失败） |

---

#### `validate` - 验证笔记

验证 Obsidian 笔记格式，检查潜在问题（如无效链接、缺失文件等）。

**语法**

```bash
obsidian-convert validate <input> [options]
```

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `input` | string | 是 | 输入文件或目录路径 |
| `--check-links` | boolean | 否 | 检查链接是否有效 |
| `--check-embeds` | boolean | 否 | 检查嵌入文件是否存在 |
| `--json` | boolean | 否 | 以 JSON 格式输出结果 |

**示例**

```bash
# 验证单个文件
obsidian-convert validate note.md

# 验证目录并检查链接
obsidian-convert validate ./vault --check-links
```

**输出**

```json
{
  "valid": false,
  "issues": [
    {
      "file": "note.md",
      "line": 5,
      "type": "broken_link",
      "message": "Link target 'missing-note' not found",
      "severity": "warning"
    }
  ]
}
```

**退出码**

| 退出码 | 说明 |
|--------|------|
| 0 | 验证通过 |
| 1 | 验证失败（存在错误） |
| 2 | 参数错误 |

---

#### `info` - 显示信息

显示笔记的解析信息（如链接、标签、前置元数据等）。

**语法**

```bash
obsidian-convert info <file> [options]
```

**参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | string | 是 | 输入文件路径 |
| `--json` | boolean | 否 | 以 JSON 格式输出结果 |

**示例**

```bash
obsidian-convert info note.md
```

**输出**

```json
{
  "file": "note.md",
  "frontmatter": {
    "title": "My Note",
    "tags": ["obsidian", "convert"]
  },
  "links": [
    { "type": "wikilink", "target": "other-note", "text": "Other Note" }
  ],
  "embeds": [
    { "type": "image", "target": "image.png" }
  ],
  "tags": ["obsidian", "convert"]
}
```

---

### 全局选项

| 选项 | 说明 |
|------|------|
| `-h, --help` | 显示帮助信息 |
| `-V, --version` | 显示版本号 |
| `--no-color` | 禁用彩色输出 |

### 配置文件

支持 `.obsidian-convertrc.json` 或 `obsidian-convert.config.js`：

```json
{
  "input": "./vault",
  "output": "./docs",
  "format": "mdx",
  "transformers": {
    "wikilinks": true,
    "embeds": true,
    "tags": true,
    "frontmatter": true
  },
  "frontmatterMapping": {
    "title": "title",
    "date": "date",
    "tags": "tags"
  },
  "linkFormat": "relative"
}
```

### 输出格式约定

#### 标准 Markdown 输出

转换后的 Markdown 文件遵循以下约定：

1. **Frontmatter**
   - 保留 `title`、`date`、`tags` 等通用字段
   - 移除 Obsidian 特有字段（如 `aliases`）

2. **链接**
   - WikiLink 转换为相对路径 Markdown 链接
   - `[[note]]` → `[note](./note.md)`
   - `[[note|display]]` → `[display](./note.md)`

3. **嵌入**
   - 图片嵌入转换为标准 Markdown
   - `![[image.png]]` → `![image](./image.png)`

4. **标签**
   - 内联标签 `#tag` 转换为 frontmatter 或保留（可配置）

#### MDX 输出

MDX 格式额外支持：

- JSX 组件导入
- 导出语句
- 自定义组件渲染

## 未来扩展

### Library API

计划提供编程接口：

```typescript
import { convertNote, convertDirectory } from 'obsidian-convert';

// 转换单个笔记
const result = await convertNote('./note.md', {
  output: './docs',
  format: 'mdx'
});

// 转换目录
const results = await convertDirectory('./vault', {
  output: './docs'
});
```

### HTTP API（如需）

若未来提供 HTTP 服务，应遵循以下规范：

- RESTful 资源设计
- JSON 请求/响应格式
- 统一错误响应结构
- 版本管理（`/api/v1/`）