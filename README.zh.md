<p align="center">
  <img alt="cmtool" src="docs/images/icon.png" width="140">
</p>

<h1 align="center">cmtool</h1>
<p align="center"><b>本地 AI 编码工作流桌面工具集</b><br>模型搜索与下载、Claude 用量分析、开发者配置管理。</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="License">
  <img src="https://img.shields.io/badge/node-%3E%3D20-green" alt="Node >= 20">
  <img src="https://img.shields.io/badge/pnpm-%3E%3D8-orange" alt="pnpm >= 8">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <b>中文</b>
</p>

---

采用 **Tauri v2** + **React 18** + **TypeScript** + **TailwindCSS** + **Rust** 构建。

## 功能特性

### 模型下载器

- 跨 HuggingFace 和 ModelScope 的关键词模糊搜索
- **全部**模式 — 同时搜索两个源并去重
- 模型详情面板，包含文件列表、标签和 README 预览
- 通过原生系统对话框选择下载目录
- 下载进度追踪，显示速度和预估剩余时间
- 取消、重试和错误处理，支持自动重试计数
- 下载历史持久化到 localStorage
- 通过 Tauri 文件系统 API 扫描本地模型目录
- 文件完整性校验（检查所有文件是否存在且非空）
- 在文件管理器中打开下载目录

### Claude 用量分析

- 扫描本地 Claude Code JSONL 用量记录（`~/.claude/projects/`）
- 时间范围筛选：今天、最近 7 天、最近 30 天
- Token 统计：输入 token、输出 token、总计
- 按模型、项目和日期聚合
- 基于最新定价表的预估费用计算
- 最近用量记录展示
- 按请求 ID 去重流式记录

### 仪表盘

- 活跃下载和用量统计概览
- 快速导航到所有模块

## 环境要求

- **macOS** 12+ / Windows 10+ / Linux（需安装 Tauri 系统依赖）
- **Node.js** >= 20
- **pnpm** >= 8
- **Rust** stable（用于 Tauri 桌面构建）
- 可选：`huggingface_hub` Python 包（用于 CLI 下载）
- 可选：`modelscope` Python 包（用于 CLI 下载）

## 安装

```bash
git clone <your-repo-url>
cd cmtool
pnpm install
```

## 开发

```bash
# 仅前端（Vite 开发服务器 + HMR）
pnpm dev:renderer

# 完整 Tauri 桌面应用（前端 + Rust 后端）
pnpm dev
```

## 测试

```bash
pnpm test
```

## 代码检查

```bash
pnpm lint
```

## 构建

```bash
# 仅前端
pnpm build:renderer

# 完整 Tauri 桌面构建（生成 .app, .dmg, .deb 等）
pnpm build
```

## 项目结构

```
src/
  App.tsx              # 主导航框架
  index.html           # 入口 HTML
  main.tsx             # React 入口
  pages/
    Dashboard/         # 仪表盘
    ModelDownloader/   # 模型搜索、下载、本地扫描
    ClaudeUsage/       # Claude 用量统计
    Settings/          # 应用设置
  services/
    modelDownload/     # 下载管理器、HF/MS API 客户端、类型定义
    claudeUsage/       # JSONL 扫描器、解析器、定价、聚合
  storage/             # 基于 localStorage 的配置和历史
  utils/               # 格式化工具（字节、速度、日期）
src-tauri/
  src/
    commands/          # Tauri Rust 命令
    lib.rs             # Tauri 应用构建器
    main.rs            # macOS 入口
tests/                 # 单元测试（Vitest）
```

## GitHub Actions

每次合并请求和推送到 `main` / `master` 时触发 CI：

| 步骤 | 作用 |
|------|------|
| `pnpm install --frozen-lockfile` | 安装前端依赖 |
| `pnpm lint` | TypeScript 类型检查（`tsc --noEmit`）|
| `pnpm test` | 运行 Vitest 单元测试 |
| `pnpm build:renderer` | 构建 Vite 前端 |
| `cargo test` (Rust) | 运行 Rust 单元测试 |
| `cargo build` (Rust) | 编译 Rust 后端 |
| `pnpm build` | 完整 Tauri 构建 |

CI 定义在 `.github/workflows/ci.yml`，支持三种触发方式：
- `pull_request` 针对 `main` / `master`
- `push` 到 `main` / `master`
- `workflow_dispatch` — 从 GitHub UI 手动触发

同一分支的并发运行会自动取消。

## 模型下载源

### HuggingFace

从 [huggingface.co/models](https://huggingface.co/models) 搜索和下载模型。CLI 方式下载大模型：

```bash
pip install -U huggingface_hub
huggingface-cli download <repo-id> --local-dir ~/cmtool/models/<model-name>
```

### ModelScope

从 [modelscope.cn](https://modelscope.cn) 搜索和下载模型。CLI 方式下载：

```bash
pip install -U modelscope
modelscope download --model <repo-id> --local_dir ~/cmtool/models/<model-name>
```

## 默认目录

```
~/cmtool/models    # 下载的模型
~/cmtool/config    # 本地配置
~/cmtool/logs      # 应用日志
```

## 验证状态

| 检查项 | 状态 |
|-------|------|
| 单元测试 | ✅ 64 个测试通过（38 模型下载 + 26 claude 用量）|
| 前端构建 | ✅ Vite 构建成功 |
| 类型检查 | ✅ `tsc --noEmit` 通过 |
| Rust 编译 | ✅ `cargo build` 编译成功 |
| 桌面构建 | ✅ `pnpm tauri build` 生成平台安装包 |

## 安全性

cmtool 完全在本地运行。以下内容不得提交到 git：

- API 密钥、令牌或密码
- HuggingFace 访问令牌
- ModelScope 访问令牌
- 下载的模型文件（`.safetensors`, `.gguf`, `.bin`, `.pt` 等）
- 应用日志
- 本地缓存或临时文件
- 包含密钥的配置文件

`.gitignore` 已配置阻止上述所有内容。标准检查的 CI 不需要任何密钥。

## 路线图

- 改进 ModelScope 搜索（REST API 优化）
- 暂停/恢复单个下载
- 基于校验和的文件验证（SHA256）
- 本地模型服务器集成
- Claude Code 配置文件管理
- OpenCode / Codex 用量分析
- macOS `.dmg` 发布打包和公证
- 自动发布工作流（GitHub Releases）

## 已知限制

- 通过浏览器 HTTP 下载模型对大文件支持有限。建议 1GB 以上模型使用 CLI 工具（`huggingface-cli`, `modelscope`）。
- Claude 用量扫描需要 Tauri 文件系统 API。在 Vite 开发模式（`dev:renderer`）下 FS 插件不可用，请使用 `pnpm dev`（完整 Tauri 模式）进行扫描。
- 费用基于已发布的 API 费率估算，Anthropic 的实际费用可能有所不同。
- 初版所有配置和历史使用浏览器 localStorage，未来版本可能采用 SQLite 或文件存储。

## 许可证

Apache 2.0

## 致谢

本项目受 [omlx](https://github.com/jundot/omlx) 启发 — 一个用于管理本地 Ollama 模型的桌面工具。
