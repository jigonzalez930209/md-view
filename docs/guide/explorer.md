# Folder explorer

**Main menu → Open folder…** (or the **Open** dropdown) walks a folder and its subfolders
and shows a VS Code-style tree. `Ctrl/⌘ + Shift + E` shows or hides it, and the **Explorer**
toggle lives in the main menu too.

![Folder explorer on the left](/screenshots/explorer.png)

## Layout

- The tree is on the **left** by default; **Settings → Explorer → Position** moves it to the
  right (the choice is remembered).
- When visible, the panel reaches up to the title bar: its header (folder path + name,
  file count, reload, close) is taller than the tab strip beside it.
- Drag the 1 px separator to resize the panel (180–560 px).

## Only text files can be opened

The tree lists everything, but only **plain-text files can be clicked**. The rest stay dimmed
with a tooltip. The backend decides with three rules:

1. **Known text extensions** (`.md`, `.txt`, `.json`, `.ts`, `.py`, `.css`, `.svg`, …) are
   accepted without reading them.
2. **Known binary extensions** (`.png`, `.pdf`, `.zip`, `.woff2`, `.wasm`, …) are rejected.
3. **Anything else is sniffed**: the first 4 KB are read and the file is text if there are no
   NUL bytes and the bytes are valid UTF-8 (files over 5 MB are rejected).

Files without an extension but with a known name (`Makefile`, `Dockerfile`, `LICENSE`,
`README`…) are treated as text.

Any text file opens in the editor, whatever its extension — the preview shows Markdown for
Markdown-family files and the code view for everything else.

## What is skipped and what is limited

| Rule | Value |
| --- | --- |
| Ignored folders | `.git`, `.hg`, `.svn`, `node_modules`, `target`, `dist`, `build`, `.venv`, `venv`, `__pycache__`, `.next`, `.cache`, `.gradle`, `.idea` |
| Symbolic links | Skipped, to avoid cycles |
| Maximum entries | 20,000 (the tree warns when it is truncated) |
| Maximum depth | 16 levels |
| Entry order | Folders first, then files, both case-insensitive |

The walk runs off the main thread (`read_tree` is an async command), so a huge repository
never freezes the interface.

## Refreshing

The ⟳ button re-reads the folder from disk. The tree is not watched automatically: if files
change outside md-view, reload the folder.

## In the browser (development only)

When the frontend runs in a browser (`pnpm dev`), the explorer falls back to an
`<input webkitdirectory>`; the classification is by extension only (it cannot sniff bytes)
and the folder lives for the session. Everything else — layout, tabs, preview — works the
same way, which is handy for UI work.
