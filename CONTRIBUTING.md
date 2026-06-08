# Contributing

Thanks for helping improve opencode-pet.

## Setup

```bash
pnpm install
pnpm tauri dev
```

Before opening a pull request, run:

```bash
pnpm build
cd src-tauri
cargo check
```

## Project Conventions

- Keep Rust structs and TypeScript interfaces in sync manually.
- Add Tauri commands in `src-tauri/src/lib.rs` and register them in the invoke handler.
- Keep shared frontend state in `src/store.ts`.
- Prefer existing Tailwind and component patterns over new styling systems.
- Keep status bubbles fast, stable, and cheap; longer summaries should remain cached and rate-limited.
- Do not use `as any`, `@ts-ignore`, or `#[allow(unused)]` to hide issues.

## Local Data

Never commit:

- `.opencode` databases or project-local OpenCode state.
- Logs, screenshots, or recordings that include private project content.
- API keys, local settings, or generated scratch assets.

Use `.env.example` for documented environment variables and keep real values in ignored local files.

## Assets

Processed pet assets that ship with the app should live under `public/pets/`. Raw generated candidates should stay under `public/pets/generated/`, which is ignored.

If adding third-party assets, include their license and attribution in `public/pets/ATTRIBUTION.md`.

## Pull Requests

Please include:

- What changed and why.
- Manual test notes for the cat overlay, office view, and OpenCode web view when relevant.
- Screenshots or short clips for visible UI changes, with private project text removed.
