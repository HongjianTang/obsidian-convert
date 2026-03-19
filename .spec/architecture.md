---
title: 系统架构
status: draft
---

# 系统架构

本文档描述 Obsidian Convert 系统的高层设计原则、架构划分、职责边界以及关键技术选型与约束。
采用 **整洁架构（Clean Architecture）** 与 **领域驱动设计（DDD）分层**，确保业务逻辑与技术实现解耦。

## 1. 设计原则与取舍

### 整体架构模式

采用 **整洁架构 + DDD 分层**，核心原则：

1. **依赖规则**：依赖方向只能由外向内，内层不依赖外层
2. **领域纯净**：领域层不依赖任何框架或基础设施
3. **用例编排**：应用层负责用例编排，协调领域对象
4. **接口适配**：外层负责与外部世界交互（CLI、文件系统等）

分层结构（由内向外）：

```
┌─────────────────────────────────────────────────────────┐
│                    Infrastructure                        │
│  (文件系统、配置、日志等基础设施实现)                      │
├─────────────────────────────────────────────────────────┤
│                    Presentation                          │
│  (CLI 入口、参数解析、输出格式化)                          │
├─────────────────────────────────────────────────────────┤
│                    Application                           │
│  (用例编排、转换流程控制、DTO)                             │
├─────────────────────────────────────────────────────────┤
│                    Domain                                │
│  (实体、值对象、领域服务、转换规则)                        │
└─────────────────────────────────────────────────────────┘
```

### 关键取舍

- **转换管道模式**：采用管道-过滤器模式处理文档转换，每个转换器独立、可组合
- **CLI 优先**：当前阶段聚焦命令行工具，未来可扩展为库或 API
- **流式处理**：支持大文件流式处理，避免内存溢出
- **可扩展转换器**：转换器可插拔，便于支持更多 Obsidian 语法

## 2. 领域模型

### 核心领域概念

#### 实体（Entity）

- **Note（笔记）**：表示一个 Obsidian 笔记文件
  - 属性：path、content、frontmatter、links、tags
  - 行为：解析、验证

#### 值对象（Value Object）

- **NotePath**：笔记路径，包含文件名、目录结构
- **Frontmatter**：YAML 前置元数据
- **WikiLink**：Obsidian 双向链接 `[[note]]`
- **Embed**：Obsidian 嵌入语法 `![[file]]`
- **Tag**：Obsidian 标签 `#tag`
- **ConversionResult**：转换结果，包含内容和元数据

#### 领域服务（Domain Service）

- **NoteParser**：解析 Obsidian 笔记，提取结构化数据
- **LinkTransformer**：转换链接语法（WikiLink → Markdown）
- **EmbedTransformer**：转换嵌入语法
- **FrontmatterTransformer**：转换前置元数据
- **TagTransformer**：转换标签语法

### 领域规则

1. **链接解析规则**：
   - `[[note]]` → 相对路径链接
   - `[[note|display]]` → 带显示文本的链接
   - `[[note#heading]]` → 带标题锚点的链接

2. **嵌入转换规则**：
   - `![[image.png]]` → `![image](path/to/image.png)`
   - `![[note]]` → 嵌入笔记内容或链接

3. **Frontmatter 转换规则**：
   - 保留通用字段（title, date, tags）
   - 映射 Obsidian 特有字段到 fumadocs 格式

## 3. 横向层次划分

### Domain Layer（领域层）

目录：`src/domain/`

职责：
- 定义核心领域模型（Note、WikiLink、Embed 等）
- 实现转换规则和业务逻辑
- 定义领域服务接口
- 不依赖任何外部框架或 IO

关键模块：
```
src/domain/
├── note/           # 笔记实体
│   ├── Note.ts
│   ├── NotePath.ts
│   └── Frontmatter.ts
├── link/           # 链接值对象
│   ├── WikiLink.ts
│   └── LinkTransformer.ts
├── embed/          # 嵌入值对象
│   ├── Embed.ts
│   └── EmbedTransformer.ts
├── tag/            # 标签值对象
│   ├── Tag.ts
│   └── TagTransformer.ts
└── transformer/    # 转换器接口
    ├── Transformer.ts
    └── TransformPipeline.ts
```

### Application Layer（应用层）

目录：`src/application/`

职责：
- 定义用例（Use Case）
- 编排转换流程
- 定义输入/输出 DTO
- 协调领域服务

关键模块：
```
src/application/
├── convert/                # 转换用例
│   ├── ConvertNote.ts      # 单文件转换
│   ├── ConvertBatch.ts     # 批量转换
│   └── ConvertDirectory.ts # 目录转换
├── dto/                    # 数据传输对象
│   ├── ConvertInput.ts
│   └── ConvertOutput.ts
└── service/               # 应用服务
    └── ConversionOrchestrator.ts
```

### Presentation Layer（展示层）

目录：`src/presentation/`

职责：
- CLI 入口与参数解析
- 用户交互与输出格式化
- 错误展示

关键模块：
```
src/presentation/
└── cli/
    ├── index.ts           # CLI 入口
    ├── commands/          # 命令定义
    │   ├── ConvertCommand.ts
    │   └── ValidateCommand.ts
    └── formatters/        # 输出格式化
        ├── JsonFormatter.ts
        └── TextFormatter.ts
```

### Infrastructure Layer（基础设施层）

目录：`src/infrastructure/`

职责：
- 文件系统操作
- 配置管理
- 日志实现
- 外部依赖适配

关键模块：
```
src/infrastructure/
├── filesystem/           # 文件系统
│   ├── FileReader.ts
│   ├── FileWriter.ts
│   └── PathResolver.ts
├── config/              # 配置
│   └── ConfigLoader.ts
└── logging/             # 日志
    └── Logger.ts
```

## 4. 纵向模块划分

### Converter 模块（核心业务）

负责 Obsidian 到 fumadocs 的格式转换。

**Bounded Context**: 文档格式转换

- 输入：Obsidian Markdown 文件
- 输出：fumadocs 兼容的 MDX 文件

### Parser 模块

负责解析 Obsidian 特有语法。

- WikiLink 解析
- Embed 解析
- Tag 解析
- Frontmatter 解析

### Transformer 模块

负责具体的语法转换。

- 链接转换
- 嵌入转换
- 标签转换
- Frontmatter 转换

## 5. 技术栈与关键约束

### 核心技术栈

- **语言**：TypeScript
- **运行时**：Node.js
- **构建**：tsc
- **测试**：Vitest（推荐）或 Jest

### 技术约束

1. **领域层纯净性**
   - 禁止在领域层使用 Node.js 特有 API（如 `fs`、`path`）
   - 通过接口抽象 IO 操作

2. **依赖注入**
   - 通过构造函数注入依赖
   - 便于测试和替换实现

3. **错误处理**
   - 使用 Result 模式或自定义错误类型
   - 领域错误与技术错误分离

4. **配置驱动**
   - 转换规则可通过配置定制
   - 支持不同的输出格式需求

## 6. 数据流

```
Obsidian Note (File)
       ↓
[FileReader - Infrastructure]
       ↓
Note Content (string)
       ↓
[NoteParser - Domain]
       ↓
Note Entity (with WikiLinks, Embeds, Tags)
       ↓
[TransformPipeline - Domain]
  ├── LinkTransformer
  ├── EmbedTransformer
  ├── TagTransformer
  └── FrontmatterTransformer
       ↓
Converted Content
       ↓
[FileWriter - Infrastructure]
       ↓
fumadocs MDX File
```

## 7. 扩展性设计

### 新增转换器

1. 实现 `Transformer` 接口
2. 注册到 `TransformPipeline`
3. 通过配置启用/禁用

### 支持新输入格式

1. 创建新的 Parser 实现
2. 定义输入格式到领域模型的映射
3. 复用现有转换管道

### 支持新输出格式

1. 创建新的 Formatter 实现
2. 定义领域模型到输出格式的映射
3. 通过 CLI 参数选择输出格式