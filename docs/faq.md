# FAQ

## Is md-view free?

Yes. MIT license, no account, no telemetry, no cloud. It is a desktop app that works offline.

## Which Markdown does it support?

GitHub Flavored Markdown: tables, task lists, strikethrough, autolinks, footnotes, emoji
shortcodes and alerts (`> [!NOTE]`). On top of that, KaTeX formulas and Mermaid diagrams. See
[Preview](/guide/preview) for the full list and [MDX](/guide/mdx) for `.mdx`.

## Can I edit in one pane and see the preview in the other?

That's the default (**split** mode). `Ctrl/⌘ + 1` leaves the editor alone, `Ctrl/⌘ + 3` shows
only the preview.

## Does it have Vim keybindings?

No. The editor is CodeMirror with the standard keymap: search with `Ctrl/⌘ + F`, multiple
cursors with `Alt + click` or `Ctrl/⌘ + D`, folding, and the Markdown shortcuts in
[Shortcuts](/guide/shortcuts).

## Can I open a whole repository?

Yes: **Open folder…** builds a tree of every subfolder and lets you open any plain-text file,
whatever its extension. Heavy folders (`node_modules`, `.git`, `target`…) are skipped and the
tree is capped at 20,000 entries. See [Folder explorer](/guide/explorer).

## Can it open a 100 MB file?

Yes. The 100 MB measurement in [Large documents](/guide/large-documents) opens in about 1.6 s
and switching away costs no frames. Above 1.2 MB the editor switches to plain text and above
1.5 MB the preview shows the first 2,000 lines.

## Why did the syntax highlighting disappear on my big file?

By design: highlighting a huge document costs more than it adds, so it is turned off above
300 KB (preview) and 1.2 MB (editor). The thresholds are in
[Large documents](/guide/large-documents).

## Can I export a document with its diagrams?

Yes. **Export → SVG** produces a real vector file with the Mermaid diagrams inlined and the
images embedded; **Export → PNG pages** gives you one A4 image per page inside a ZIP, and
**PDF** prints the live preview with page breaks. See [Export](/guide/export).

## Does the PDF come out dark?

No: PDF exports use light mode by default. Untick **PDF in light mode** in the export menu to
use the current theme.

## Which themes are included?

GitHub, One Dark and Dracula, each with a light and a dark variant, plus a “follow the system”
option. A new palette is a CSS block; see [Themes and palettes](/guide/themes).

## Can I use it in another language?

English is the default and Spanish is included. Adding a language means adding one dictionary
in `src/lib/i18n.ts` (and optionally a VitePress locale for the docs). See
[Languages](/guide/languages).

## Can I copy text?

Yes: text selection is enabled inside the **editor** and the **preview** (that is how you copy
Markdown or a rendered paragraph). The rest of the interface does not select text, so dragging
the window or clicking around never leaves a selection behind — like a native app.

## Where are my preferences and recents stored?

Preferences in `localStorage` (`md-view:prefs`), recent files in the app configuration folder
(`recents.json`). Nothing is sent anywhere.

## Does it auto-update?

No. Download the new installer from the releases page; the project doesn't configure Tauri's
updater.

## Can I use it as my default `.md` viewer?

Yes. The installers register the `.md`, `.markdown` and `.mdx` associations, so double-clicking
a document opens md-view. If the app is already running, the second launch reuses the window and
loads the file there.

## Can I use it in the browser?

Only for development (`pnpm dev`). The file system features fall back to browser APIs: files are
picked with a dialog, saving downloads the file, the explorer uses `webkitdirectory` and PDF
falls back to the print dialog. The real app is the Tauri build.

## Something is broken, where do I report it?

Open an issue on [GitHub](https://github.com/jigonzalez930209/md-view/issues) with the document
that triggers it if possible. For security problems, use a private advisory (see
[Security](/reference/security)).
