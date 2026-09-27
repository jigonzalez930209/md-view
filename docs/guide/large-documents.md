# Large documents

md-view is built so that a big Markdown file never freezes the window. All the thresholds
live in `src/lib/limits.ts`; this page explains what happens at each one and why.

## Thresholds

| Size | What changes |
| --- | --- |
| > 256 KB | Word, line and character counts are computed in a **worker**, in 2 MB chunks aligned to line breaks |
| > 300 KB | Syntax highlighting of code blocks is turned off |
| > 400 KB | The preview renders without highlighting and without Mermaid diagrams |
| > 500 KB | The document text is mirrored into the app state only after a short pause (not on every keystroke) |
| > 1.2 MB | The editor switches to **plain text**: no Markdown parsing, no highlighting, and line wrapping is disabled (measuring a million wrapped lines is what froze the window) |
| > 1.5 MB | The preview renders only the **first 2,000 lines**, with a note at the top |
| > 8 MB | The document is never copied into the app state again: CodeMirror is the only source of truth |

Above 500 KB the Markdown render itself runs in a **worker** (markdown-it + plugins, which do
not touch the DOM); the main thread only sanitizes the result when the document contains raw
HTML.

## The optimizations behind it

| Optimization | Where |
| --- | --- |
| One editor per tab (switching is show/hide, not state swapping) | `components/Editor.tsx` |
| Worker on demand for counts and Markdown rendering, terminated after 30 s idle | `lib/text-tasks.ts`, `workers/text-tasks.ts` |
| Preview HTML cache (LRU of 3, keyed by the text itself so V8 hashes it once) | `lib/markdown.ts` |
| Statistics cached per document (switching tabs never re-counts) | `App.tsx` |
| Dirty flag per tab instead of comparing the whole text | `App.tsx` |
| Cursor updates throttled to 100 ms | `App.tsx` |
| Preview windowing with `indexOf`/`slice` (V8 shares substrings, so it is free) | `lib/text-tasks.ts` |
| Sanitization skipped when the Markdown has no raw HTML | `lib/markdown-core.ts` |

## Measured

All numbers from the production build on Ubuntu 26.04 (Chromium-based measurements in the
development environment; the Tauri window behaves the same):

| Scenario | Before | Now |
| --- | --- | --- |
| Open a 100 MB file (tab + preview) | ~22 s | **~1.6 s** |
| Leave the 100 MB file (click another tab/file) | seconds of freeze | **0 ms** |
| Come back to the 100 MB file | — | ~86 ms |
| Type 10 characters in a 100 MB file | up to 679 ms hitches | 20–50 ms hitches |
| Memory with a 100 MB document open | — | ~480 MB |

Render pipeline per size (see [Performance](/reference/performance) for the full table).

## What is still work

Opening a document still costs time proportional to its size (the text has to be read,
decoded, sent to the webview and parsed into CodeMirror's data structure). For a 100 MB file
that is about 1.6 seconds, with a message in the status bar telling you the size while it
loads.
