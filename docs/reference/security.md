# Security

Markdown documents can come from anywhere, and md-view renders them inside a webview. These
are the guarantees and the trade-offs.

## Sanitization

Rendered HTML goes through [DOMPurify](https://github.com/cure53/DOMPurify) with this profile:

```ts
{
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base'],
  FORBID_ATTR: ['srcset', 'formaction', 'ping'],
  ADD_ATTR: ['loading', 'decoding', 'align', 'aria-hidden', 'aria-label', 'role', 'target', 'rel'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
}
```

`javascript:` URLs in attributes are stripped, as are inline event handlers (`onerror`,
`onclick`, …).

### The fast path

Sanitization is skipped when the Markdown source contains **no** `<` at all
(`hasRawHtml()`). In that case markdown-it guarantees the output:

- text is escaped (`<` becomes `&lt;`, so no tag can appear);
- link and image URLs are validated by markdown-it itself (`javascript:`, `vbscript:` and
  `file:` are rejected; `data:` only for images);
- the only HTML in the output comes from our own plugins (KaTeX, task lists, alerts, emoji),
  which are trusted code.

Any `<` in the source — including a harmless comparison like `a < b` — disables the fast path
and runs the full sanitization. Verified against `<script>`, `onerror`, `onclick`,
`javascript:` in attributes and `<iframe>`.

## Content Security Policy

The window CSP (in `tauri.conf.json`) only allows:

| Directive | Value |
| --- | --- |
| `script-src` | `'self'` (the bundled scripts only) |
| `style-src` | `'self' 'unsafe-inline'` (KaTeX and Mermaid write inline styles) |
| `img-src` / `media-src` | `'self'`, `asset:` (local files), `data:`, `blob:`, `http(s):` |
| `connect-src` | `'self'`, `ipc:` (Tauri's IPC) |
| `object-src` / `frame-src` | `'none'` |

## Mermaid

Mermaid is initialized with `securityLevel: 'strict'`, so diagram labels cannot inject HTML or
script and clicks on nodes don't run code.

## Local file access

Images are served through Tauri's `asset:` protocol. The configured scope starts **empty**: the
app grants it at runtime for the folders you open (a document grants its folder, the explorer
grants the tree root), so the webview can only read paths you have chosen. Documents that
reference images outside those folders fall back to a normal load and may show a broken image.

Markdown links to local files open with the system handler (`open_path`) — the same thing as
double-clicking the file — but only when you click them. The app never *writes* outside the
paths you choose in a dialog.

## Backend

- All file operations go through explicit commands; the frontend cannot execute arbitrary
  shell commands.
- Documents above 256 MB and embeds above 32 MB are rejected before they reach memory.
- Text that is not valid UTF-8 (or UTF-16 with a BOM) is rejected instead of being rewritten.
- Writes are atomic (unique temporary file, fsync, rename) and preserve permissions; read-only
  files are never replaced silently.
- Errors are translated from stable codes; no command returns filesystem metadata beyond what
  the UI shows.

## Reporting a vulnerability

Please open a private security advisory on GitHub
(`Security → Advisories → Report a vulnerability`) instead of a public issue.
