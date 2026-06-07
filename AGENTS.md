# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-27
**Stack:** Tauri 2.0 + React 18 + Rust

## OVERVIEW

Desktop pet that monitors OpenCode task progress. Reads SQLite database from `.opencode` directories, displays animated cat with real-time status updates.

## STRUCTURE

```
opencode-pet/
├── src/                    # React frontend
│   ├── components/         # UI components (CatPet, ProgressBar, TaskList, SettingsPanel)
│   ├── store.ts            # Zustand state management
│   ├── types.ts            # TypeScript interfaces
│   └── App.tsx             # Main app component
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Tauri commands + state management
│   │   ├── db.rs           # SQLite database operations
│   │   └── monitor.rs      # File system watcher
│   └── Cargo.toml          # Rust dependencies
└── package.json            # Node dependencies
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add Tauri command | `src-tauri/src/lib.rs` | Add `#[tauri::command]` fn + register in `invoke_handler` |
| Modify DB queries | `src-tauri/src/db.rs` | Uses rusqlite, reads `opencode.db` |
| Change file watching | `src-tauri/src/monitor.rs` | Uses notify crate, watches `.opencode` dirs |
| Update frontend state | `src/store.ts` | Zustand store, calls Tauri commands via `invoke()` |
| Edit UI components | `src/components/` | React + Framer Motion + Tailwind CSS |
| Modify types | `src/types.ts` | Mirror Rust structs in TypeScript |

## CONVENTIONS

- **Rust structs ↔ TypeScript interfaces**: Keep in sync manually (no codegen)
- **Tauri commands**: Snake_case in Rust, camelCase in frontend calls
- **State updates**: Use Zustand store, not local state
- **Styling**: Tailwind CSS utility classes, no custom CSS

## ANTI-PATTERNS

- Do NOT use `as any` or `@ts-ignore`
- Do NOT suppress Rust warnings with `#[allow(unused)]`
- Do NOT modify `target/` or `dist/` directories directly

## COMMANDS

```bash
# Frontend dev
pnpm dev

# Full Tauri dev
pnpm tauri dev

# Build for production
pnpm tauri build

# Check Rust compilation
cd src-tauri && cargo check
```

## NOTES

- Window configured as transparent, frameless, always-on-top
- Database path auto-detected from `~/.opencode` and project `.opencode` dirs
- File monitoring uses `notify` crate with macOS kqueue backend
- Pet states: idle (sleeping), working, completed, error
