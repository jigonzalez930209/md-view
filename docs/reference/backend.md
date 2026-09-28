# Backend (Tauri)

The Rust side (`src-tauri/src/lib.rs`) contains only what needs system access. Everything else
is frontend.

## Commands

| Command | Arguments | Returns | Used by |
| --- | --- | --- | --- |
| `read_document` | `path` | `Document` (`path`, `name`, `content`, `eol`, `bom`) | Opening files |
| `write_document` | `path`, `content`, `eol?`, `bom?` | `()` | Saving |
| `write_text_file` | `path`, `content` | `()` | HTML, SVG and TXT export |
| `write_base64_file` | `path`, `data` | `()` | PNG/JPG/WebP/ZIP export |
| `read_file_base64` | `path` | base64 string | Inlining images in exports |
| `document_size` | `path` | bytes (0 if missing) | Warning before opening a huge file |
| `read_tree` | `path` | `FolderTree` (recursive, `truncated` flag) | Folder explorer |
| `export_pdf` | `path` | `()` | PDF export (WebKitGTK print) |
| `path_exists` | `path` | `bool` | Resolving links and images |
| `git_baseline` | `path` | `GitBaseline` (`text`, `branch`) or `null` | [Change indicator](/guide/editor#change-indicator) |
| `set_window_background` | `red`, `green`, `blue` | `()` | Native window color that matches the theme |
| `open_external` | `url` | `()` | External links |
| `open_path` | `path` | `()` | Local files with the system app |
| `get_recents` / `push_recent` / `clear_recents` | `path?` | `string[]` | Recent files |
| `take_pending_open` | — | `string[]` | Files passed on the command line |

The slow ones (`read_document`, `write_document`, `read_tree`, `read_file_base64`,
`export_pdf`) are **async commands**, so they run off the main thread and a 100 MB file never
blocks the interface.

## File handling details

- **Atomic writes**: content goes to a temporary file that is then renamed over the target, so
  a failure never leaves a half-written document. Permissions are copied from the original.
- **Encodings**: UTF-8 with or without BOM and UTF-16 (LE/BE) are decoded; the content is
  normalized to LF internally and the original `eol` is restored on save.
- **Folder tree**: extension allow/deny lists plus a byte sniff for unknown extensions; skips
  `.git`, `node_modules`, `target`, `dist`, `build` and friends; ignores symlinks; caps at
  20,000 entries and 16 levels of depth.

## Opening files from the system

The document the OS asks us to open arrives differently per platform, and both paths end in the
same place: the pending queue plus the `md-view://open` event, which the frontend drains with
`take_pending_open` (at startup) or on the event (already running).

| Platform | How it arrives | Code |
| --- | --- | --- |
| Linux | `Exec=md-view %U` in the `.desktop` file → command-line arguments | `files_from_args` |
| Windows | File association (WiX/NSIS) → command-line arguments | `files_from_args` |
| macOS | Finder/`open` sends an Apple Event → `RunEvent::Opened { urls }` | `files_from_urls` |

A second launch while the app is running goes through `tauri-plugin-single-instance`: it forwards
the arguments (Linux/Windows) and focuses the existing window, so the file opens in a new tab
instead of a second instance. `file://` URLs are accepted too (they are what Linux and macOS
hand over when a path has spaces or non-ASCII characters).

## Git baseline

`git_baseline` shells out to the `git` CLI (no window on Windows) from the document's folder:

1. `rev-parse --is-inside-work-tree` and `ls-files --error-unmatch` — outside a repository
   or for untracked files it returns `null` and the frontend compares against the saved
   version instead;
2. `symbolic-ref --short -q HEAD` for the branch (the short commit hash when detached);
3. `show HEAD:./<name>` for the committed text (empty if the file was never committed),
   decoded like any document and normalized to LF.

## Window behavior

| What | How | Why |
| --- | --- | --- |
| Starts hidden (`visible: false`) | `setup` applies the saved theme color, then shows it | The first frame already has the theme background |
| Theme background | `set_window_background` paints window and webview, saved to `background` in the config folder | Area uncovered while resizing is never black |
| Fit to screen | `fit_to_monitor` shrinks the window to 92% of the monitor work area if it does not fit, and centers it | Frameless window: controls must never be off screen |
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` (Linux) | Set before GTK starts, unless the user set it | The DMA-BUF renderer lags a frame behind resizes on Wayland (black band growing, clipped content shrinking) |
| Touchpad pinch (Linux) | The GTK `event` handler swallows `GdkEventTouchpadPinch` and emits `touchpad-pinch` (`phase`, `scale`, `x`, `y`) | WebKit would scale the whole page; the frontend zooms only the preview |

## Printing to PDF

`export_pdf` uses the GTK "Print to File" backend and waits for the `finished` signal before
answering the frontend:

```rust
let settings = gtk::PrintSettings::new();
settings.set_printer("Print to File");
settings.set("output-uri", Some(&uri));
operation.set_print_settings(&settings);
operation.print();
```

On other platforms the command returns an error and the frontend falls back to the print
dialog (`window.print()`).

## Permissions

`src-tauri/capabilities/default.json` lists what the main window may do:

| Permission | Why |
| --- | --- |
| `core:default` | Base IPC and events |
| `core:window:allow-set-title`, `allow-destroy`, `allow-close` | Window title and closing |
| `core:window:allow-minimize`, `allow-toggle-maximize`, `allow-is-maximized` | Custom window controls |
| `core:window:allow-start-dragging`, `allow-start-resize-dragging` | Frameless window: drag and resize |
| `dialog:default`, `dialog:allow-open`, `dialog:allow-save`, `dialog:allow-ask` | Native dialogs |

## Window and app configuration

From `src-tauri/tauri.conf.json`:

| Setting | Value | Why |
| --- | --- | --- |
| `decorations` | `false` | The app draws its own GNOME-style title bar |
| `dragDropEnabled` | `true` | Dropping files onto the window |
| `fileAssociations` | `md`, `markdown`, `mdx` | Double-click in the file manager |
| CSP | scripts only from the app, images from `asset:`/data/blob/http(s) | Defence in depth |
| `assetProtocol.scope` | `**` | Images referenced by documents anywhere on disk |
| `setup` | `set_enable_smooth_scrolling(false)` | WebKitGTK's momentum scrolled oddly; the app uses its own crisp scrolling |

`tauri-plugin-single-instance` makes a second invocation reuse the window and forward the
file path (see `take_pending_open`), and `tauri-plugin-opener` handles external links and
"open with the default app".
