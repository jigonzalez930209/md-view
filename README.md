# md-view

[![CI](https://github.com/jigonzalez930209/md-view/actions/workflows/ci.yml/badge.svg)](https://github.com/jigonzalez930209/md-view/actions/workflows/ci.yml)
[![Docs](https://github.com/jigonzalez930209/md-view/actions/workflows/docs.yml/badge.svg)](https://jigonzalez930209.github.io/md-view/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)

Desktop **Markdown viewer and editor** (Tauri 2 + React + CodeMirror) with a GNOME-style title
bar, tabs, a folder explorer, a formatting bar and export to PDF, HTML and images. The preview
renders **like GitHub**.

<p align="center">
  <a href="docs/public/media/md-view-demo.mp4">
    <img src="docs/public/media/md-view-demo.webp" width="420" alt="md-view in action: opening a folder, git change marks, Mermaid, KaTeX, themes and PDF export">
  </a>
</p>

## Features

| | |
| --- | --- |
| **Preview** | GitHub Flavored Markdown: tables, task lists, footnotes, alerts (`> [!NOTE]`), emoji, KaTeX formulas, Mermaid diagrams, animated SVG, 30+ code languages with a copy button; pinch or `Ctrl + wheel` zooms only the preview |
| **Editor** | CodeMirror 6 one instance per tab, Markdown highlighting, search and replace, multiple cursors, folding |
| **Change marks** | Added, modified and removed lines in the gutter against git `HEAD` (or the last save), with the branch and counts in the status bar |
| **Tabs** | Chrome-like strip; per-document scroll, selection, undo history and view mode; unsaved dot |
| **Formatting bar** | Headings, bold, italic, quote, code, link, bulleted/ordered/task lists, image, table, rule, undo/redo |
| **Folder explorer** | VS Code-style tree, left or right; any plain-text file opens, binaries stay disabled |
| **Export** | Paged PDF, self-contained HTML, PNG pages in a ZIP, PNG/JPG/WebP, **vector SVG**, plain text |
| **Themes** | GitHub, One Dark and Dracula, each in light and dark, plus follow-the-system |
| **Languages** | English by default, Spanish included, one dictionary away from more |
| **Large files** | 100 MB documents open in ~1.6 s; workers, windowed previews and thresholds in `src/lib/limits.ts` |
| **Private** | No account, no telemetry, no network calls except the links you open |

Full documentation: **<https://jigonzalez930209.github.io/md-view/>**

## Install

Download an installer from the [releases page](https://github.com/jigonzalez930209/md-view/releases):

- **Linux**: `.deb`, `.rpm`, AppImage (built on Ubuntu 26.04)
- **macOS**: universal `.dmg` (Intel + Apple Silicon)
- **Windows**: `.msi` and `.exe`

The packages register `.md`, `.markdown` and `.mdx`, so you can also open a document by
double-clicking it. Builds are unsigned: macOS and Windows will ask you to confirm the first
launch.

### APT repository (Debian, Ubuntu and derivatives)

The project publishes a signed APT repository next to its documentation, rebuilt with every
release:

```bash
curl -fsSL https://jigonzalez930209.github.io/md-view/apt/md-view-archive-keyring.gpg \
  | sudo tee /usr/share/keyrings/md-view-archive-keyring.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/md-view-archive-keyring.gpg] https://jigonzalez930209.github.io/md-view/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/md-view.list
sudo apt update && sudo apt install md-view
```

From then on `apt upgrade` keeps it up to date.

### From source

Requires **Node 24+**, **pnpm 10+**, **Rust 1.77+** and the Tauri system dependencies
(`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libxdo-dev`, `patchelf` on Linux; see
[Installation](https://jigonzalez930209.github.io/md-view/guide/installation) for the Fedora and
Arch commands).

```bash
pnpm install
pnpm app        # compiles the Rust backend and opens the app
```

Other commands:

```bash
pnpm dev          # frontend only, in the browser
pnpm build        # typecheck + production build
pnpm app:build    # binary and installers
pnpm icons        # regenerate src-tauri/icons
pnpm docs:dev     # documentation site
pnpm release X.Y.Z  # version bump + tag + push (triggers the release workflow)
```

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ + O` | Open file |
| `Ctrl/⌘ + N` / `T` | New tab |
| `Ctrl/⌘ + W` | Close tab |
| `Ctrl/⌘ + Tab` | Next tab (`Shift` for the previous) |
| `Ctrl/⌘ + Shift + E` | Show/hide the folder explorer |
| `Ctrl/⌘ + ,` | Settings |
| `Ctrl/⌘ + S` / `Shift + S` | Save / save as |
| `Ctrl/⌘ + 1` / `2` / `3` | Editor only / split / read-only |
| `Ctrl/⌘ + F` | Search in the editor (with replace) |
| `Ctrl/⌘ + B` / `I` / `E` / `K` | Bold / italic / inline code / link |

There is a full [shortcut reference](https://jigonzalez930209.github.io/md-view/guide/shortcuts)
in the documentation.

## Development

```bash
pnpm typecheck                     # tsc --noEmit
pnpm build                         # frontend
(cd src-tauri && cargo fmt --check && cargo test)
pnpm docs:build                    # documentation (fails on dead links)
```

- `pnpm dev` runs the frontend in a browser with fallbacks for the file system, which is the
  fastest way to work on the UI.
- `pnpm app` is the real Tauri app (file system, dialogs, exports, printing).

Architecture, thresholds and measurements are documented in the
[reference](https://jigonzalez930209.github.io/md-view/reference/architecture) and the
[project structure](https://jigonzalez930209.github.io/md-view/development/structure) pages.

## Releasing

```bash
pnpm release 0.3.0
```

The script updates the version in `package.json`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml`, adds the entry to `CHANGELOG.md` (the commits since the previous
version), commits, tags and pushes. The tag triggers
[`release.yml`](.github/workflows/release.yml), which creates a draft release (with the changelog
as its body) and uploads the installers for the three platforms. See
[Publishing releases](https://jigonzalez930209.github.io/md-view/deployment/releases).

## Security

Rendered HTML is sanitized with DOMPurify (sanitization is skipped only when the Markdown has no
raw HTML at all, where markdown-it already escapes text and validates link protocols), Mermaid
runs with `securityLevel: 'strict'` and the window CSP only allows the app's own scripts. See
[Security](https://jigonzalez930209.github.io/md-view/reference/security).

## License

MIT. The syntax highlighting palettes follow the `github.css` / `github-dark.css` themes from
highlight.js, and the heading anchors imitate GitHub's algorithm.
