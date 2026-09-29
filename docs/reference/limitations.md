# Known limitations

Everything here is deliberate: md-view is a viewer, and these are the places where it trades
capability for speed, safety or scope. The numbers live in
[`src/lib/limits.ts`](https://github.com/jigonzalez930209/md-view/blob/main/src/lib/limits.ts)
and in the backend.

## Documents

| From | What changes |
| --- | --- |
| 256 MB | The read is refused with a message (larger files never reach memory) |
| 8 MB | The text is not copied to the UI state; the preview becomes a window |
| 1.5 MB | The preview shows only the first 2,000 lines (and says so) |
| 1.2 MB | The editor switches to plain text, without highlighting |
| 400 KB | The preview drops highlighting and diagrams |

- Editors and previews keep working above these limits; what degrades is fidelity, not
  stability.
- Exports from a windowed preview (above 1.5 MB) ask for confirmation first and are partial.
- Drafts are only written for documents under 8 MB; bigger ones rely on you saving.
- The find bar searches the visible document and skips text inside diagrams (SVG), where a
  highlight would break the drawing.
- The outline panel is disabled for windowed or simplified documents.

## Folders

- The tree stops at 20,000 entries and 16 levels deep (it says when it truncated).
- `node_modules`, `.git`, `target`, `dist` and friends are skipped.
- Only text files open; binaries stay visible but disabled.

## Files

- Encodings: UTF-8 and UTF-16 (with BOM). Anything else is refused instead of being read
  lossily.
- Saving replaces the file through a rename: permissions are kept, but extended attributes,
  ACLs, ownership and hard links are not. Symlinks are written through, not replaced.
- Read-only files are never overwritten; the backend explains and suggests another path.

## Platforms

- **PDF**: native export exists on Linux (WebKitGTK printing). On macOS and Windows the entry
  is disabled with an explanation instead of failing at the end.
- **Windows ARM64**: not built for 1.0. Linux and macOS cover arm64.
- **Linux**: built against glibc 2.35 (Ubuntu 22.04), so 22.04 LTS and newer.
- **Installers are unsigned**: macOS and Windows will warn once. Releases ship `SHA256SUMS`
  and an SBOM to make downloads verifiable.
- **No auto-update**: download the next version from the releases page.

## Application

- One window; there is no multi-window support.
- No plugin or extension system, no Vim keybindings, no Markdown beyond GitHub's flavour.
- Local links in a document open with your default application when you click them.
- Images referenced outside the folder you opened may not load in the preview (the asset
  protocol is granted per opened folder).
- Browser mode (`pnpm dev`) is for developing the UI: files are picked with a dialog, saving
  downloads a copy and the system integration is limited.
