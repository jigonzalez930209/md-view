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

Images are served through Tauri's `asset:` protocol, which requires the CSP to allow `asset:`
and the scope `**` (any path, because a document can reference images anywhere). This is a
deliberate trade-off: md-view is a viewer, and any path the document references is expected to
work. The app never *writes* outside the paths you choose in a dialog.

## Backend

- All file operations go through explicit commands; the frontend cannot execute arbitrary
  shell commands.
- Writes are atomic (temporary file + rename) and preserve permissions.
- Errors are plain messages; no command returns filesystem metadata beyond what the UI shows.

## Reporting a vulnerability

Please open a private security advisory on GitHub
(`Security → Advisories → Report a vulnerability`) instead of a public issue.
