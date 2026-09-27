# Tabs

Every document opens in its own tab. Tabs are styled like Chrome: the active one has its top
corners rounded and shares the background of the content, so it feels attached to the editor.

![Several documents open in tabs](/screenshots/tabs.png)

## Basics

| Action | How |
| --- | --- |
| New tab | **+** in the title bar, `Ctrl/⌘ + T` or `Ctrl/⌘ + N` |
| Switch | Click the tab, or `Ctrl/⌘ + Tab` / `Ctrl/⌘ + Shift + Tab` to cycle |
| Close | The **×** on the tab, middle-click, or `Ctrl/⌘ + W` |
| Reorder | Not supported; tabs are ordered by when they were opened |

The tab shows a **dot** when the document has unsaved changes (it disappears while you hover
or when the tab is active, where the **×** takes its place).

## What each tab remembers

Because every tab owns its editor instance, switching back restores:

- the cursor and the selection;
- the scroll position (editor and preview);
- the undo history;
- the view mode (editor, split or read-only);
- the *Markdown / code* choice of the preview.

## Closing safely

Closing a tab with unsaved changes asks first. The same question covers the whole window: if
you close md-view with several dirty documents, a single prompt tells you how many there are.

## Tabs and the folder explorer

When the explorer is visible, it occupies a full-height column and the tab strip lives beside
it (narrower than the explorer header). Without a folder open, the tab strip spans the whole
width. That is the only layout difference: tab behaviour is identical in both cases.

::: tip Opening the same file twice
Opening a file that is already open focuses its tab instead of creating a duplicate. This
includes links inside a document and the recent files list.
:::
