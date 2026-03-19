---
title: 测试策略
status: draft
---

## 总体原则

- **测试金字塔**：单元测试为主，集成测试为辅，E2E 测试覆盖关键路径
- **领域优先**：领域层和应用层必须有单元测试
- **快速反馈**：单元测试应能在秒级完成
- **可追溯性**：测试记录在 `.meta/<milestone>/<feat-id>/qa.md`

---

## 测试层级

### 单元测试（Unit Tests）

**目标**：验证单个模块/函数的行为

**覆盖范围**：
- Domain 层：所有值对象、实体、领域服务
- Application 层：用例逻辑（使用 mock 依赖）

**特点**：
- 不依赖外部系统（文件系统、网络）
- 使用 mock/stub 隔离依赖
- 测试边界条件和异常场景

**示例**：

```typescript
// tests/unit/domain/link/WikiLink.test.ts
describe('WikiLink', () => {
  describe('parse', () => {
    it('should parse simple wiki link', () => {
      const link = WikiLink.parse('[[note]]');
      expect(link.target).toBe('note');
      expect(link.text).toBe('note');
    });

    it('should parse wiki link with display text', () => {
      const link = WikiLink.parse('[[note|My Note]]');
      expect(link.target).toBe('note');
      expect(link.text).toBe('My Note');
    });

    it('should parse wiki link with heading anchor', () => {
      const link = WikiLink.parse('[[note#section]]');
      expect(link.target).toBe('note');
      expect(link.anchor).toBe('section');
    });

    it('should throw for invalid format', () => {
      expect(() => WikiLink.parse('not a link')).toThrow(ParseError);
    });
  });
});
```

### 集成测试（Integration Tests）

**目标**：验证模块间交互和外部依赖集成

**覆盖范围**：
- Infrastructure 层：文件系统操作
- Application 层与 Infrastructure 层的集成

**特点**：
- 使用真实依赖或测试替身
- 使用临时目录进行文件操作
- 测试真实场景

**示例**：

```typescript
// tests/integration/filesystem/FileReader.test.ts
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

describe('FileReader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'obsidian-convert-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('should read file content', async () => {
    const filePath = path.join(tempDir, 'test.md');
    await writeFile(filePath, '# Test Note');

    const reader = new FileReader();
    const content = await reader.read(filePath);

    expect(content).toBe('# Test Note');
  });
});
```

### 端到端测试（E2E Tests）

**目标**：验证完整用户场景

**覆盖范围**：
- CLI 命令执行
- 文件转换流程

**特点**：
- 模拟真实用户操作
- 使用测试 vault 目录
- 验证输出结果

**示例**：

```typescript
// tests/e2e/cli/convert.test.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI convert command', () => {
  const testVault = './tests/fixtures/vault';
  const outputDir = './tests/fixtures/output';

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it('should convert single file', async () => {
    const { stdout, stderr } = await execAsync(
      `node dist/presentation/cli/index.js convert ${testVault}/note.md -o ${outputDir}`
    );

    expect(stderr).toBe('');
    expect(await exists(`${outputDir}/note.mdx`)).toBe(true);
  });

  it('should convert directory', async () => {
    const { stdout } = await execAsync(
      `node dist/presentation/cli/index.js convert ${testVault} -o ${outputDir}`
    );

    expect(stdout).toContain('Converted');
  });
});
```

---

## 测试数据

### Fixtures

测试数据放在 `tests/fixtures/` 目录：

```
tests/fixtures/
├── vault/                 # 测试用 Obsidian vault
│   ├── simple-note.md
│   ├── note-with-links.md
│   ├── note-with-embeds.md
│   └── images/
│       └── test-image.png
└── expected/              # 预期输出
    └── simple-note.mdx
```

### 测试用例分类

| 分类 | 说明 | 示例 |
|------|------|------|
| Happy Path | 正常场景 | 正确的 WikiLink 解析 |
| Edge Cases | 边界条件 | 空文件、超长链接 |
| Error Cases | 异常场景 | 无效语法、文件不存在 |
| Regression | 回归测试 | 历史问题复现场景 |

---

## Mock 策略

### 领域层：不使用 mock

```typescript
// 领域层是纯逻辑，直接测试
describe('LinkTransformer', () => {
  it('should transform wiki link to markdown', () => {
    const transformer = new LinkTransformer();
    const link = new WikiLink('note', 'Note Title');
    const result = transformer.transform(link, './docs');
    expect(result).toBe('[Note Title](./docs/note.md)');
  });
});
```

### 应用层：mock 基础设施依赖

```typescript
// 应用层 mock 外部依赖
describe('ConvertNoteUseCase', () => {
  it('should convert note', async () => {
    const mockFileReader = { read: jest.fn().mockResolvedValue('# Test') };
    const mockFileWriter = { write: jest.fn() };
    const mockParser = { parse: jest.fn().mockReturnValue({ content: '# Test' }) };

    const useCase = new ConvertNoteUseCase(mockParser, mockFileReader, mockFileWriter);

    await useCase.execute({ input: 'test.md', output: 'out' });

    expect(mockFileWriter.write).toHaveBeenCalledWith(
      expect.stringContaining('test.mdx'),
      expect.any(String)
    );
  });
});
```

---

## 测试命令

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行 E2E 测试
npm run test:e2e

# 生成覆盖率报告
npm run test:coverage
```

---

## 覆盖率目标

| 层次 | 目标覆盖率 | 说明 |
|------|------------|------|
| Domain | 90%+ | 核心业务逻辑，必须高覆盖 |
| Application | 80%+ | 用例编排，重要路径覆盖 |
| Presentation | 50%+ | CLI 参数解析，关键路径 |
| Infrastructure | 60%+ | 集成测试覆盖 |

---

## 测试与工作流

### PRD 阶段

- 定义验收标准
- 识别关键测试场景

### 设计阶段

- 识别测试点和边界条件
- 考虑可测试性设计

### 开发阶段

- TDD（可选）：先写测试再实现
- 确保新代码有测试覆盖

### QA 阶段

- 在 `.meta/<milestone>/<feat-id>/qa.md` 记录测试结果
- 手动验证关键场景

---

## 常见错误

1. **测试依赖外部状态**
   - 问题：测试不稳定，有时通过有时失败
   - 解决：使用 mock 或测试替身，隔离外部依赖

2. **测试过于宽泛**
   - 问题：一个测试验证太多内容
   - 解决：每个测试只验证一个行为

3. **忽略边界条件**
   - 问题：只测试正常场景，边界问题遗漏
   - 解决：明确列出边界条件并测试

4. **测试代码重复**
   - 问题：setup/teardown 代码重复
   - 解决：提取公共测试工具函数