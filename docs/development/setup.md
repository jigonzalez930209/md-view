# Development setup

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node | **24+** | `engines` in `package.json`, `.nvmrc` |
| pnpm | 10+ | The lockfile is `lockfileVersion: '9'` |
| Rust | 1.77+ | `rustup` recommended; 1.97 tested |

System dependencies: see [Installation](/guide/installation#from-source). In short, Tauri needs
`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libxdo-dev` and `patchelf` on Linux,
plus the usual build tools.

## Install

```bash
git clone https://github.com/jigonzalez930209/md-view
cd md-view
pnpm install
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm app` | `tauri dev`: compiles the Rust backend and opens the app with hot reload |
| `pnpm dev` | Frontend only, in the browser at `http://localhost:1420` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm build` | Typecheck + production build of the frontend (`dist/`) |
| `pnpm app:build` | Release binary and installers (`deb`, AppImage, `rpm`, `dmg`, `msi`…) |
| `pnpm preview` | Serves the built frontend |
| `pnpm icons` | Regenerates `src-tauri/icons` (needs Pillow) |
| `pnpm changelog` | Previews the changelog entry for the next version |
| `pnpm release <version>` | Version bump + changelog + tag + push (see [Releases](/deployment/releases)) |
| `pnpm docs:dev` | Documentation site with hot reload |
| `pnpm docs:build` | Builds the documentation (fails on dead links) |
| `pnpm docs:preview` | Serves the built documentation |

## Two ways to run the frontend

**Tauri (`pnpm app`)** is the real thing: file system, dialogs, exports, printing.

**Browser (`pnpm dev`)** is faster for UI work. The `backend.ts` bridge falls back to browser
APIs: files are picked with an `<input type="file">`, saving downloads the file, the folder
explorer uses `webkitdirectory` and exports go through the print dialog or a download. Two
features are Tauri-only: the real `asset:` image protocol and the frameless window.

::: tip Stale modules
If a change doesn't show up in a long-running dev server, reload the window (`Ctrl + R`). Vite
occasionally keeps a transformed module after large refactors; `pnpm app` restarts both the
frontend and the Rust side.
:::

## First contributions

1. Read [Project structure](/development/structure) to know where things live.
2. Read [Code style](/development/code-style) before touching the UI (Tailwind + shadcn).
3. Run `pnpm typecheck && pnpm build && (cd src-tauri && cargo fmt --check && cargo test)`
   before opening a pull request.
