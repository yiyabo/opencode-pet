# opencode-pet

一个本地优先的 OpenCode 桌面猫猫伙伴。

opencode-pet 会读取你本机的 OpenCode 工作区和本地 OpenCode server，让每只猫绑定到一个具体对话，然后用小气泡、todo 进度和嵌入式 OpenCode Web 帮你看任务状态。它的默认设计是不把项目内容发到云端。

English: opencode-pet is a local-first desktop cat companion for OpenCode sessions. It monitors local OpenCode data, binds cats to specific sessions, and keeps status bubbles lightweight.

## 功能

- 猫猫独立绑定：未绑定的猫保持安静；绑定后的猫只显示自己对话的状态。
- Compact 模式：桌面悬浮层只显示第一只猫，避免画面太乱。
- 猫猫办公室：可以绑定已有对话、创建新对话、查看任务状态、打开 OpenCode Web。
- 嵌入式 OpenCode Web：已绑定对话可以以左右分栏打开，也可以扩展为全屏。
- 本地摘要：气泡状态走快速规则；更长的对话摘要可以在后台缓存、限频生成。
- 本地优先：读取 OpenCode SQLite 和本地 OpenCode server；默认不需要、也不支持云端摘要 provider。

## 当前支持平台

目前主要面向：

- macOS
- Linux

Windows 暂时没有实测，先不标为支持平台。

## 环境要求

- Node.js 20 或更新版本
- pnpm 10 或更新版本
- Rust stable toolchain
- 已安装 OpenCode，并且至少运行过一次，让本机存在 `.opencode` 数据库

## 本地开发

安装依赖：

```bash
pnpm install
```

启动桌面应用开发模式：

```bash
pnpm tauri dev
```

只启动前端预览：

```bash
pnpm dev
```

前端构建和类型检查：

```bash
pnpm build
```

Rust 后端检查：

```bash
cd src-tauri
cargo check
```

## OpenCode 配置

opencode-pet 会自动扫描常见的 `.opencode` 目录，也可以在 Settings 里手动选择数据库。

嵌入式 OpenCode Web 和实时事件需要本地 OpenCode server。默认端口是 `4096`：

```bash
opencode serve --port 4096
```

如果你使用其他端口，在 Settings 里把 OpenCode Server URL 改成对应地址。

## 本地摘要

气泡是实时状态，设计目标是快、稳定、省资源。它主要来自 todo、最近消息和 OpenCode 事件。

更完整的 session 摘要可以在消息或 todo 变化后后台生成。应用会先按内容 fingerprint 缓存，并且限频；如果本地 AI provider 不可用，就退回确定性的规则摘要。

支持的本地摘要 endpoint：

- Ollama：`http://127.0.0.1:11434`
- OpenAI-compatible 本地服务：`http://127.0.0.1:1234/v1`

可选环境变量：

```bash
OPENCODE_PET_OLLAMA_URL=http://127.0.0.1:11434
OPENCODE_PET_SUMMARY_BASE_URL=http://127.0.0.1:1234/v1
OPENCODE_PET_SUMMARY_MODEL=qwen2.5-coder
```

远程摘要 endpoint 会被拒绝，这是有意为之。

English: summaries are local-only. The app accepts localhost providers, caches generated summaries, rate-limits background work, and falls back to rule-based summaries when no local model is available.

## 隐私

opencode-pet 是本地优先应用。它读取本机 OpenCode SQLite 数据库和本地 OpenCode server 响应。

不要提交这些内容：

- `.opencode` 数据库
- 包含私有项目上下文的日志、截图、录屏
- 本地 settings、API key、真实环境变量
- 未清理的生成素材

## 常见问题

如果 `pnpm tauri dev` 报 `Port 1420 is already in use`，说明已经有一个 Vite dev server 在运行。关掉旧进程后重新启动即可。

如果看不到对话，先确认目标项目里运行过 OpenCode，并在 Settings 里检查选中的 `.opencode` 数据库。

如果 OpenCode Web 打开了但对话不存在，确认 OpenCode server 正在使用 Settings 里配置的同一个端口。

## 资源

猫猫资源是项目自有或为本项目生成/处理的素材。详见 [public/pets/ATTRIBUTION.md](public/pets/ATTRIBUTION.md)。

## License

MIT. See [LICENSE](LICENSE).
