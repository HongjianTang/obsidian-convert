# Test Vault 手动测试指南

这是一个用于测试 obsidian-convert 工具的模拟 Obsidian vault。

## 目录结构

```
test-vault/
├── attachments/          # 附件目录
│   ├── screenshot.png
│   ├── diagram.png
│   ├── photo.png
│   ├── report.pdf
│   └── data.xlsx
└── notes/               # 笔记目录
    ├── welcome.md
    ├── second-note.md
    ├── attachments-demo.md
    └── nested/
        └── deep-note.md
```

## 手动测试步骤

### 1. 构建项目

```bash
cd D:/Limit/obsidian-convert
npm run build
```

### 2. 运行转换

```bash
node dist/presentation/cli/index.js --verbose
```

### 3. 查看帮助

```bash
node dist/presentation/cli/index.js --help
```

### 4. 干运行模式（预览不写入）

```bash
node dist/presentation/cli/index.js --dry-run --verbose
```

### 5. 指定输出目录

```bash
node dist/presentation/cli/index.js -o ./my-output --verbose
```

## 测试内容

### Wiki Links
- `[[note-name]]` - 简单链接
- `[[note-name|显示名称]]` - 带别名的链接
- `[[folder/note]]` - 嵌套文件夹链接

### Attachments
- `![[image.png]]` - Wiki 格式图片
- `![[document.pdf]]` - Wiki 格式文档
- `![alt text](../attachments/image.png)` - Markdown 格式图片

### 预期输出

运行转换后，输出目录应包含：
- `notes/` - 转换后的 Markdown 文件
- `public/attachments/` - 复制的附件文件

Wiki 链接会被转换为标准 Markdown 格式：
- `![photo.png](/attachments/photo.png)` → `![photo.png](/attachments/photo.png)`
- `[report.pdf](/attachments/report.pdf)` → `[report.pdf](/attachments/report.pdf)`

## 配置文件

配置文件位于项目根目录 `obsidian-convert.yaml`：

```yaml
sourceFolders:
  - path: D:/Limit/obsidian-convert/test-vault
    exclude: "**/templates/**"

outputDir: ./test-output
attachmentDir: public/attachments
```