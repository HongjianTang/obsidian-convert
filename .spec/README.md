---
title: Obsidian Convert 全局规范
status: draft
---

本目录存放 Obsidian Convert 项目的长期技术规范与约定。

- **面向对象**：整仓库的长期演进（而非单个需求的一次性决策）
- **作用**：为架构、API、错误处理、质量等提供统一的"上位约束"
- **使用原则**：只有当某个约定会影响多个需求/里程碑时，才写入 `.spec/`

## 项目概述

**Obsidian Convert** 是一个将 Obsidian 笔记转换为 fumadocs 兼容格式的命令行工具。

### 核心功能

- 解析 Obsidian 特有语法（WikiLink、Embed、Tag 等）
- 转换为 fumadocs 兼容的 MDX/Markdown 格式
- 支持单文件和批量目录转换
- 保持链接有效性和语义完整性

### 技术栈

- TypeScript + Node.js
- 整洁架构（Clean Architecture）
- 领域驱动设计（DDD）分层

## 文档索引

| 文档 | 说明 |
|------|------|
| [`architecture.md`](./architecture.md) | 系统架构设计 |
| [`directory-structure.md`](./directory-structure.md) | 目录结构约定 |
| [`api.md`](./api.md) | CLI 接口规范 |
| [`error-handling.md`](./error-handling.md) | 错误处理约定 |
| [`testing.md`](./testing.md) | 测试策略 |
| [`quality-guidelines.md`](./quality-guidelines.md) | 质量准则 |
| [`coding-guide.md`](./coding-guide.md) | 编码规范 |

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    Infrastructure                        │
│  (FileReader, FileWriter, Config, Logger)               │
├─────────────────────────────────────────────────────────┤
│                    Presentation                          │
│  (CLI Commands, Formatters)                              │
├─────────────────────────────────────────────────────────┤
│                    Application                           │
│  (ConvertNote, ConvertBatch, ValidateNote)               │
├─────────────────────────────────────────────────────────┤
│                    Domain                                │
│  (Note, WikiLink, Embed, Transformer)                    │
└─────────────────────────────────────────────────────────┘
```

**依赖方向**：外层依赖内层，内层不知道外层的存在

## 核心领域概念

### 实体

- **Note（笔记）**：Obsidian 笔记文件，包含内容、Frontmatter、链接等

### 值对象

- **WikiLink**：`[[note]]` 或 `[[note|display]]` 格式的双向链接
- **Embed**：`![[file]]` 格式的嵌入语法
- **Tag**：`#tag` 格式的标签
- **Frontmatter**：YAML 前置元数据

### 领域服务

- **NoteParser**：解析笔记，提取结构化数据
- **Transformer**：转换语法（WikiLink → Markdown Link）
- **TransformPipeline**：组合多个转换器

## 快速开始

```bash
# 安装
npm install -g obsidian-convert

# 转换单个文件
obsidian-convert convert note.md -o ./docs

# 转换目录
obsidian-convert convert ./vault -o ./docs

# 预览转换（不写入文件）
obsidian-convert convert note.md --dry-run
```

## 开发指南

### 新增转换器

1. 在 `src/domain/transformer/` 创建新的转换器类
2. 实现 `Transformer` 接口
3. 在 `TransformPipeline` 中注册
4. 编写单元测试

### 新增命令

1. 在 `src/presentation/cli/commands/` 创建命令类
2. 在 `index.ts` 中注册命令
3. 编写 E2E 测试

## 规范更新

当引入跨需求的变更时，应更新相应的规范文档：

- 新增架构层或模块 → 更新 `architecture.md`
- 新增 CLI 命令或参数 → 更新 `api.md`
- 新增错误类型 → 更新 `error-handling.md`
- 新增测试策略 → 更新 `testing.md`