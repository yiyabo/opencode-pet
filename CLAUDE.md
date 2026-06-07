# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm tauri dev          # Full dev mode (Rust + React, hot reload)
pnpm dev                # Frontend only (Vite on :1420)
pnpm build              # tsc + vite build
pnpm tauri build        # Production app bundle
cd src-tauri && cargo check   # Rust type check
```

## Architecture

Tauri 2.0 desktop pet: React frontend ↔ Tauri IPC ↔ Rust backend.

- **`src-tauri/src/lib.rs`** — All `#[tauri::command]` functions + `invoke_handler` registration. Add new commands here.
- **`src-tauri/src/db.rs`** — rusqlite reads from `~/.opencode/opencode.db` and project-local `.opencode/opencode.db`.
- **`src-tauri/src/monitor.rs`** — notify (kqueue) watches `.opencode` dirs, emits Tauri events to frontend on DB change.
- **`src/store.ts`** — Zustand store; calls Rust via `invoke()`. All shared state lives here.
- **`src/types.ts`** — TypeScript mirrors of Rust structs. **Keep in sync manually** when modifying Rust data types.

Pet states: `idle` / `working` / `completed` / `error` — driven by task data from the DB.

## Conventions

- Rust command names: `snake_case`; frontend `invoke()` calls: `camelCase`
- Styling: Tailwind only — no custom CSS
- No `as any`, no `@ts-ignore`, no `#[allow(unused)]`
