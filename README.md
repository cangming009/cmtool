# cmtool

Desktop toolkit for local AI coding workflows — model search and download, Claude usage analytics, and developer configuration management.

Built with **Tauri v2** + **React 18** + **TypeScript** + **TailwindCSS** + **Rust**.

## Features

### Model Downloader

- Keyword fuzzy search for models across HuggingFace and ModelScope
- **All** mode — search both sources simultaneously with deduplicated results
- Model detail panel with file listing, tags, and README preview
- Download directory selection via native OS dialog
- Download progress tracking with speed and ETA
- Cancel, retry, and error handling with automatic retry counting
- Download history persisted to localStorage
- Local model directory scanning via Tauri filesystem API
- File integrity verification (checks all files exist and are non-empty)
- Open download directory in file manager

### Claude Usage Analytics

- Scan local Claude Code JSONL usage records from `~/.claude/projects/`
- Time range filtering: today, last 7 days, last 30 days
- Token statistics: input tokens, output tokens, total
- Aggregation by model, by project, and by date
- Estimated cost calculation with up-to-date pricing table
- Recent usage records display
- Deduplication of streaming records by request ID

### Dashboard

- Overview of active downloads and usage statistics
- Quick navigation to all modules

## Requirements

- **macOS** 12+ / Windows 10+ / Linux (with Tauri system deps)
- **Node.js** >= 20
- **pnpm** >= 8
- **Rust** stable (for Tauri desktop build)
- Optional: `huggingface_hub` Python package for CLI-based downloads
- Optional: `modelscope` Python package for CLI-based downloads

## Install

```bash
git clone <your-repo-url>
cd cmtool
pnpm install
```

## Development

```bash
# Frontend only (Vite dev server with HMR)
pnpm dev:renderer

# Full Tauri desktop app (frontend + Rust backend)
pnpm dev
```

## Test

```bash
pnpm test
```

## Lint

```bash
pnpm lint
```

## Build

```bash
# Frontend only
pnpm build:renderer

# Full Tauri desktop build (produces .app, .dmg, .deb, etc.)
pnpm build
```

## Project Structure

```
src/
  App.tsx              # Main app shell with sidebar navigation
  index.html           # Entry HTML
  main.tsx             # React entry point
  pages/
    Dashboard/         # Dashboard overview page
    ModelDownloader/   # Model search, download, local scan UI
    ClaudeUsage/       # Claude usage statistics UI
    Settings/           # Application settings
  services/
    modelDownload/     # Download manager, HF/MS API clients, types
    claudeUsage/       # JSONL scanner, parser, pricing, aggregation
  storage/             # localStorage-based config and history
  utils/               # Formatting utilities (bytes, speed, dates)
src-tauri/
  src/
    commands/          # Tauri Rust commands
    lib.rs             # Tauri app builder setup
    main.rs            # macOS entry point
tests/                 # Unit tests (Vitest)
```

## GitHub Actions

Every pull request and push to `main` / `master` triggers CI:

| Step | What it does |
|------|-------------|
| `pnpm install --frozen-lockfile` | Install frontend dependencies |
| `pnpm lint` | TypeScript type check (`tsc --noEmit`) |
| `pnpm test` | Run Vitest unit tests |
| `pnpm build:renderer` | Build Vite frontend |
| `cargo test` (Rust) | Run Rust unit tests |
| `cargo build` (Rust) | Compile Rust backend |
| `pnpm build` | Full Tauri build |

CI is defined in `.github/workflows/ci.yml` and supports three triggers:
- `pull_request` against `main` / `master`
- `push` to `main` / `master`
- `workflow_dispatch` — manual trigger from GitHub UI

Concurrent runs on the same branch are automatically cancelled.

## Model Download Sources

### HuggingFace

Search and download models from [huggingface.co/models](https://huggingface.co/models). For CLI-based download of large models:

```bash
pip install -U huggingface_hub
huggingface-cli download <repo-id> --local-dir ~/cmtool/models/<model-name>
```

### ModelScope

Search and download models from [modelscope.cn](https://modelscope.cn). For CLI-based download:

```bash
pip install -U modelscope
modelscope download --model <repo-id> --local_dir ~/cmtool/models/<model-name>
```

## Default Directories

```
~/cmtool/models    # Downloaded models
~/cmtool/config    # Local configuration
~/cmtool/logs      # Application logs
```

## Verification Status

| Check | Status |
|-------|--------|
| Unit tests | ✅ 64 tests pass (38 model download + 26 claude usage) |
| Frontend build | ✅ Vite build succeeds |
| Type checking | ✅ `tsc --noEmit` passes |
| Rust compile | ✅ `cargo build` compiles |
| Desktop build | ✅ `pnpm tauri build` produces platform bundle |

## Security

cmtool operates entirely locally. The following must never be committed to git:

- API keys, tokens, or secrets
- HuggingFace access tokens
- ModelScope access tokens
- Downloaded model files (`.safetensors`, `.gguf`, `.bin`, `.pt`, etc.)
- Application logs
- Local cache or temp files
- Configuration files containing secrets

The `.gitignore` is configured to block all of the above. CI does not require any secrets for standard checks.

## Roadmap

- Better ModelScope search (REST API improvements)
- Pause / resume individual downloads
- Checksum-based file verification (SHA256)
- Local model server integration
- Claude Code config file management
- OpenCode / Codex usage analytics
- macOS `.dmg` release packaging and notarization
- Automated release workflow with GitHub Releases

## Known Limitations

- Model download via browser HTTP has limited support for large models. CLI tools (`huggingface-cli`, `modelscope`) are recommended for models over 1 GB.
- Claude usage scanning requires Tauri filesystem API. In Vite dev mode (`dev:renderer`), the FS plugin is unavailable — use `pnpm dev` (full Tauri mode) for scanning.
- Pricing is estimated based on published API rates. Actual costs from Anthropic may vary.
- First version — all config and history use browser localStorage. Future versions may adopt SQLite or flat-file storage.

## License

MIT
