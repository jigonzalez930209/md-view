# Getting started

## The welcome screen

When no document is open, md-view shows a welcome screen with the three ways to start and
the list of recent files (the last 12, stored in the app configuration folder).

![Welcome screen with recent files](/screenshots/welcome.png)

| Action | What it does |
| --- | --- |
| **Open file** | System file dialog. Accepts `.md`, `.markdown`, `.mdx`, `.txt`… and any other text file |
| **New document** | Empty document, saved wherever you want the first time you save |
| **View demo** | The [demo document](https://github.com/jigonzalez930209/md-view/blob/main/src/demo.md) that exercises every feature |
| **Recent files** | The last 12 documents you opened, with a button to clear the list |

## Opening documents

- **File dialog**: `Ctrl/⌘ + O` or the **Open** button in the title bar.
- **Drag and drop**: drop one or more `.md` files onto the window; each one opens in its own
  tab.
- **Folder explorer**: `Ctrl/⌘ + Shift + E` shows the tree; click a text file to open it.
- **From the terminal**: `pnpm app -- -- -- ~/notes/README.md` (or the release binary
  directly).

Opening a file that is already open focuses its tab instead of duplicating it.

## The window

The title bar is drawn by the app itself (the window has no native decorations):

| Zone | What it contains |
| --- | --- |
| Left | **Open** with a recents dropdown, and the **new tab** button |
| Center | Document name, a dot when there are unsaved changes, and the folder |
| Right | Document information, the main menu, and the window controls (minimize, maximize, close) |

Drag the window from anywhere in the title bar (over the document title too); double-click to
maximize. Buttons and links keep their normal click.

The window behaves like a native one:

- it opens in the color of your theme (no white or black flash), and if the saved size does
  not fit the screen it shrinks to the work area and centers itself, so the window controls
  are never off screen;
- the layout never gets wider than the window: when it narrows, the document title
  truncates first and the explorer takes at most 45% of the width, so the close button
  stays visible;
- resizing follows the pointer without black bands (see
  [Troubleshooting](/deployment/troubleshooting#application) for the Linux renderer
  setting).

The status bar shows the path, the save state, the cursor position, word and character
counts and, for files in a git repository, the branch and the
[changed lines](/guide/editor#change-indicator).

## Editing and saving

- The editor is on the left, the preview on the right. `Ctrl/⌘ + 1`, `2`, `3` switch between
  editor only, split and read-only.
- Unsaved changes show a dot in the tab and the title bar, and the status bar says
  *Unsaved*.
- `Ctrl/⌘ + S` saves; a brand-new document asks for a path once. `Ctrl/⌘ + Shift + S` is
  *Save as*.
- Closing a tab or the window with unsaved changes asks first (the question covers every
  dirty document).

Files are written atomically (a temporary file is renamed over the original), preserving
permissions, the original line ending (LF or CRLF) and the UTF-8 BOM if it had one.

## Next steps

- [Editor](/guide/editor) for the editing surface.
- [Formatting bar](/guide/formatting) to insert Markdown without typing it.
- [Export](/guide/export) to produce a PDF, an image or a standalone HTML.
