# Editor

The editor is [CodeMirror 6](https://codemirror.net/) with Markdown support: syntax
highlighting for the markup, line numbers, code folding, multiple selections and search
with replace.

![Editor with the formatting bar](/screenshots/split-view.png)

## Editing surface

| Feature | How |
| --- | --- |
| Markdown highlighting | Headings, bold, italic, links, code and quote markers, with the markup in a muted tone |
| Line numbers | On by default; can be turned off in [Settings](/guide/settings) |
| Line wrapping | On by default (off automatically for huge documents, see below) |
| Search and replace | `Ctrl/⌘ + F` opens the panel, which includes replace |
| Go to line | `Ctrl/⌘ + Alt + G` |
| Fold sections | Arrows in the gutter; `Ctrl + Shift + [` / `]` |
| Multiple cursors | `Alt + click`, or `Ctrl/⌘ + D` to select the next occurrence |
| Indent with Tab | Enabled for the editor only |

The font size (11–20 px), the line numbers and the wrapping are [settings](/guide/settings)
shared by every tab.

## One editor per tab

Like VS Code, each document has **its own editor instance**:

- switching tabs is just showing and hiding a view, so the scroll position, the selection
  and the undo history of every document are preserved;
- closing a tab destroys its editor and frees the memory;
- typing never re-renders the other tabs.

## Two modes

| Mode | When | What changes |
| --- | --- | --- |
| Rich | Documents under 1.2 MB | Full Markdown highlighting, folding and bracket matching |
| Plain text | Documents over 1.2 MB | No parsing at all: the editor shows the raw text and stays responsive |

In plain-text mode a note appears above the editor explaining it. Line wrapping is disabled
in that mode on purpose: measuring a million wrapped lines freezes the window.

## Code view

Text files that are not Markdown (a `.ts`, a `.json`, a `.yaml`…) open in the **code view**:
monospace, line breaks preserved and syntax highlighting for the language of the extension.
The preview header has a toggle to switch between *code* and *Markdown* at any time.

![TypeScript file shown as code](/screenshots/code-view.png)

## Where the content lives

While you type, the editor's document is the source of truth. For documents under 500 KB the
text is also mirrored into the app state on every keystroke (so statistics and the preview
stay live); above that, the state is updated only after a short pause, and above 8 MB the
text is never copied again. Saving, exporting and closing always read the current document
from the editor first, so nothing is lost. See
[Large documents](/guide/large-documents) for the details.
