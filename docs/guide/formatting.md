# Formatting bar

Above the editor, when the document is Markdown and the view is *editor* or *split*, md-view
shows a formatting bar. Every button acts on the current selection (or inserts the markup at
the cursor) and then returns the focus to the editor.

![Formatting bar](/screenshots/format-bar.png)

## Buttons

| Icon | Action | Behaviour |
| --- | --- | --- |
| H1 | Heading | Cycles H1 → H2 → H3 → paragraph over the selected lines |
| **B** | Bold | Toggles `**` around the selection |
| *I* | Italic | Toggles `*` |
| ❝ | Quote | Toggles the `> ` prefix on every selected line |
| `<>` | Inline code | Toggles a single backtick (use the block for multiline code) |
| 🔗 | Link | Inserts `[text](url)` and selects `url` so you can type it |
| •≡ | Bulleted list | Toggles `- ` |
| 1≡ | Numbered list | Toggles `1. `, `2. `… |
| ☑≡ | Task list | Toggles `- [ ] ` |
| 🖼 | Image | Inserts `![alt](path-or-url)` |
| ⊞ | Table | Inserts a 3-column GFM table with the first header cell selected |
| — | Horizontal rule | Inserts `---` on its own line |
| ↶ ↷ | Undo / Redo | Same as `Ctrl/⌘ + Z` and `Ctrl/⌘ + Shift + Z` |

Every button has a tooltip with its name and shortcut. The selection survives the click
(the buttons don't steal the focus).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘ + B` | Bold |
| `Ctrl/⌘ + I` | Italic |
| `Ctrl/⌘ + E` | Inline code |
| `Ctrl/⌘ + K` | Link |

## When the bar is hidden

- **Non-Markdown files**: the bar would insert Markdown into, say, a `.ts` file. Instead the
  editor header shows `CODE · <language>`.
- **Read-only view** (`Ctrl/⌘ + 3`): the whole editor pane is hidden.

The list markers follow GitHub: `disc`, `circle`, `square` for nested bullets and decimal
numbers for ordered lists; task lists render disabled checkboxes, exactly like GitHub.
