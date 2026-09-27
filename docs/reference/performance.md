# Performance

Every number on this page was measured, not estimated. The goal was simple: a Markdown file
of any size should open, scroll and switch without freezing the window.

## Render pipeline per size

Chromium, synthetic document without cache, after the optimizations:

| Size | markdown-it | DOMPurify | Full pipeline |
| --- | --- | --- | --- |
| 10 KB | 13 ms | 7 ms | 31 ms |
| 300 KB | 113 ms | 216 ms | 468 ms |
| 1 MB | 367 ms | 671 ms | 1410 ms |
| 3 MB | 1099 ms | 1901 ms | 4443 ms |

The most expensive library was **DOMPurify** (~45% of the pipeline): it parses all the HTML
into a DOM and walks it. `markdown-it` is ~25%; the rest is plugins, KaTeX and highlight.js.

Two consequences, both implemented:

1. **Sanitization is skipped when the Markdown has no raw HTML.** markdown-it already escapes
   text and validates link protocols, so if there is no `<` in the source, there is nothing
   to sanitize. With raw HTML the sanitization runs exactly as before.
2. **Rendering runs in a worker** for documents over 500 KB; the main thread only sanitizes
   (when needed) and inserts the HTML.

## Opening and switching

Production build, Tauri-style timings, using generated documents:

| Scenario | Before | Now |
| --- | --- | --- |
| 1 MB: preview visible / worst frame gap | 1439 ms / 939 ms | 547 ms / 192 ms |
| 4 MB: preview / worst gap | 509 ms / 0 ms | 570 ms / 121 ms |
| 10 MB: preview / worst gap | 527 ms / 180 ms | 356 ms / 95 ms |
| 100 MB: tab + preview | ~22 s | ~1.6 s |
| 100 MB: leave the document | seconds of freeze | **0 ms** |
| 100 MB: come back | — | 86 ms |
| 100 MB: type 10 characters | up to 679 ms gaps | 20–50 ms gaps |

## Why not WASM?

WASM (md4c, comrak) or rendering in Rust would make the **parsing** faster, but parsing is not
the bottleneck: it is ~25% of the pipeline, and it already runs in a worker. The remaining cost
is sanitization (which needs a DOM) and building the preview's DOM, neither of which a WASM
Markdown parser changes.

What actually fixed the freezes was eliminating work:

| Problem | Fix |
| --- | --- |
| Copying a 100 MB string on every keystroke | Dirty flag + flush on demand (`App.tsx`) |
| Re-slicing a huge document to recount words on every tab switch | Per-document statistics cache |
| Swapping CodeMirror states on every tab change | One editor per tab, hidden with `visibility` |
| Re-rendering the preview on every tab change | LRU HTML cache keyed by the text itself |
| Measuring a million wrapped lines | Wrapping disabled in plain-text mode |
| Force layouts on every wheel event | Scroll sync throttled to one frame, line-based |

## Reproducing the numbers

The measurements came from the headless Chrome harness used during development:

1. generate a synthetic document of the target size in the page,
2. open it from the explorer, measure the time until the tab and the preview are visible and
   sample frame gaps with `requestAnimationFrame`,
3. for the render table, time `markdown-it`, `DOMPurify` and the full pipeline separately.

If you want a quick sanity check, open the demo document and the browser's performance panel:
the expensive work happens in the worker and shows up outside the main thread.
