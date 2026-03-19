---
title: 目录结构约定
status: draft
---

## 总体结构

本仓库采用 **TypeScript + 整洁架构 + DDD 分层**，核心目录约定如下：

```
obsidian-convert/
├── package.json              # 项目配置
├── tsconfig.json             # TypeScript 配置
├── src/                      # 源码目录
│   ├── domain/               # 领域层
│   ├── application/          # 应用层
│   ├── presentation/         # 展示层
│   └── infrastructure/       # 基础设施层
├── dist/                     # 编译输出
├── .spec/                    # 全局规范文档
└── .meta/                    # 里程碑与需求文档
```

## 源码目录详解

### `src/domain/` - 领域层

领域层是系统核心，包含纯业务逻辑，不依赖任何外部框架或 IO。

```
src/domain/
├── note/                     # 笔记聚合
│   ├── Note.ts               # 笔记实体
│   ├── NotePath.ts           # 笔记路径值对象
│   ├── Frontmatter.ts        # YAML 前置元数据值对象
│   └── NoteParser.ts         # 笔记解析服务接口
├── link/                     # 链接子域
│   ├── WikiLink.ts           # WikiLink 值对象
│   ├── LinkTransformer.ts    # 链接转换器接口
│   └── LinkRepository.ts     # 链接解析接口（如需）
├── embed/                    # 嵌入子域
│   ├── Embed.ts              # Embed 值对象
│   └── EmbedTransformer.ts   # 嵌入转换器接口
├── tag/                      # 标签子域
│   ├── Tag.ts                # Tag 值对象
│   └── TagTransformer.ts     # 标签转换器接口
├── transformer/              # 转换器聚合
│   ├── Transformer.ts        # 转换器接口
│   ├── TransformPipeline.ts  # 转换管道
│   └── TransformResult.ts    # 转换结果值对象
├── errors/                   # 领域错误
│   ├── DomainError.ts        # 领域错误基类
│   ├── ParseError.ts         # 解析错误
│   └── TransformError.ts     # 转换错误
└── index.ts                  # 领域层导出
```

**领域层约束**：
- 禁止导入 Node.js 模块（`fs`, `path`, `process` 等）
- 禁止直接访问外部资源
- 所有 IO 操作通过接口定义，由基础设施层实现

### `src/application/` - 应用层

应用层负责用例编排，协调领域对象完成业务目标。

```
src/application/
├── convert/                  # 转换用例
│   ├── ConvertNote.ts        # 单文件转换用例
│   ├── ConvertBatch.ts       # 批量转换用例
│   └── ConvertDirectory.ts   # 目录转换用例
├── validate/                 # 验证用例
│   └── ValidateNote.ts       # 笔记验证用例
├── dto/                      # 数据传输对象
│   ├── ConvertInput.ts       # 转换输入 DTO
│   ├── ConvertOutput.ts      # 转换输出 DTO
│   └── ValidationOutput.ts   # 验证输出 DTO
├── service/                  # 应用服务
│   ├── ConversionOrchestrator.ts  # 转换编排服务
│   └── NoteRegistry.ts       # 笔记注册表（用于链接解析）
└── index.ts                  # 应用层导出
```

**应用层约束**：
- 通过构造函数注入依赖
- 不直接操作文件系统，通过接口调用基础设施层
- 用例类以 `UseCase` 结尾或以动词开头

### `src/presentation/` - 展示层

展示层处理用户交互，当前为 CLI。

```
src/presentation/
└── cli/
    ├── index.ts              # CLI 入口
    ├── commands/             # 命令实现
    │   ├── ConvertCommand.ts # convert 命令
    │   ├── ValidateCommand.ts# validate 命令
    │   └── InfoCommand.ts    # info 命令
    ├── options/              # 命令选项定义
    │   ├── InputOption.ts    # 输入选项
    │   └── OutputOption.ts   # 输出选项
    ├── formatters/           # 输出格式化器
    │   ├── Formatter.ts      # 格式化器接口
    │   ├── JsonFormatter.ts  # JSON 格式化
    │   └── TextFormatter.ts  # 文本格式化
    └── index.ts              # CLI 层导出
```

**展示层约束**：
- 只负责参数解析、调用用例、格式化输出
- 不包含业务逻辑
- 通过依赖注入获取用例实例

### `src/infrastructure/` - 基础设施层

基础设施层实现技术细节，如文件系统、配置、日志等。

```
src/infrastructure/
├── filesystem/               # 文件系统实现
│   ├── FileReader.ts         # 文件读取器
│   ├── FileWriter.ts         # 文件写入器
│   ├── PathResolver.ts       # 路径解析器
│   └── DirectoryScanner.ts   # 目录扫描器
├── config/                   # 配置实现
│   ├── ConfigLoader.ts       # 配置加载器
│   └── Config.ts             # 配置类型定义
├── logging/                  # 日志实现
│   ├── Logger.ts             # 日志器实现
│   └── ConsoleTransport.ts   # 控制台传输
├── container/                # 依赖注入容器
│   └── Container.ts          # IoC 容器配置
└── index.ts                  # 基础设施层导出
```

**基础设施层约束**：
- 实现领域层定义的接口
- 通过适配器模式隔离外部依赖
- 处理所有 IO 相关的错误

## 共享目录

### `src/shared/` - 共享模块（可选）

跨层共享的类型、工具函数：

```
src/shared/
├── types/                    # 公共类型定义
│   └── Result.ts             # Result 类型
└── utils/                    # 工具函数
    └── path.ts               # 路径工具（纯函数）
```

## 配置文件

```
├── tsconfig.json             # TypeScript 编译配置
├── package.json              # npm 配置
│   ├── bin: { "obsidian-convert": "dist/presentation/cli/index.js" }
│   └── scripts: { "build", "dev", "test" }
└── .obsidian-convertrc.json  # 工具配置文件（可选）
```

## 依赖方向约束

```
┌──────────────────┐
│ Infrastructure   │ ← 实现接口，依赖内层
├──────────────────┤
│ Presentation     │ ← 调用 Application，依赖 Application
├──────────────────┤
│ Application      │ ← 编排 Domain，依赖 Domain
├──────────────────┤
│ Domain           │ ← 无外部依赖，最内层
└──────────────────┘
```

**依赖规则**：

1. **Domain 层**：不依赖任何外层
   - ✅ 可以导入 `src/shared/`
   - ❌ 禁止导入 `application/`, `presentation/`, `infrastructure/`

2. **Application 层**：可以依赖 Domain
   - ✅ 可以导入 `src/domain/`, `src/shared/`
   - ❌ 禁止导入 `presentation/`, `infrastructure/`

3. **Presentation 层**：可以依赖 Application
   - ✅ 可以导入 `src/application/`, `src/domain/`, `src/shared/`
   - ❌ 禁止直接导入 `infrastructure/`（通过 DI 容器获取）

4. **Infrastructure 层**：可以依赖所有内层
   - ✅ 可以导入所有内层模块
   - ❌ 不应被 Domain 或 Application 直接导入

## 模块命名约定

| 层次 | 目录命名 | 文件命名 | 类/接口命名 |
|------|----------|----------|-------------|
| Domain | `note/`, `link/`, `transformer/` | `Note.ts`, `WikiLink.ts` | `Note`, `WikiLink`, `NoteParser` |
| Application | `convert/`, `validate/` | `ConvertNote.ts` | `ConvertNoteUseCase` |
| Presentation | `commands/`, `formatters/` | `ConvertCommand.ts` | `ConvertCommand`, `JsonFormatter` |
| Infrastructure | `filesystem/`, `config/` | `FileReader.ts` | `FileReader`, `ConfigLoader` |

## 测试目录结构

```
tests/
├── unit/                     # 单元测试
│   ├── domain/               # 领域层测试
│   └── application/          # 应用层测试
├── integration/              # 集成测试
│   └── filesystem/           # 文件系统集成测试
└── e2e/                      # 端到端测试
    └── cli/                  # CLI 测试
```