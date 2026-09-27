# Tests

## Backend (Rust)

```bash
cd src-tauri && cargo test
```

Eleven unit tests cover the logic that is worth protecting:

| Test | What it checks |
| --- | --- |
| `percent_decode_resolves_escapes_and_keeps_invalid` | `%20`, `%C3%B1` and invalid escapes in `file://` arguments |
| `decode_detects_bom_and_utf16` | UTF-8 BOM, UTF-16 LE/BE and plain UTF-8 decoding |
| `files_from_args_ignores_flags_and_missing_files` | Command-line parsing |
| `files_from_args_understands_file_urls` | `file://` URLs with spaces |
| `write_document_keeps_crlf_bom_and_creates_folders` | EOL and BOM are preserved; missing folders are created |
| `looks_like_text_uses_extension_and_content` | Text detection: allow list, deny list, NUL sniffing, `Makefile`-style names |
| `read_tree_sorts_and_skips_heavy_folders` | Folders first, `node_modules` skipped, `isText` flags |
| `tree_serializes_in_camel_case` | The JSON the frontend consumes uses `isText`, not `is_text` |
| `read_document_fails_with_missing_path` | Error path |
| `files_from_urls_keeps_existing_files` | macOS' "Opened" event: `file://` URLs (with escapes) become paths, and anything missing or non-file is dropped |
| `write_atomically_leaves_no_temp_files` | Atomic writes leave no `.tmp` behind |

Formatting is part of the gate:

```bash
cd src-tauri && cargo fmt --check
```

## Frontend

```bash
pnpm typecheck    # tsc --noEmit
pnpm build        # typecheck + production build
pnpm docs:build   # documentation site (fails on dead links)
```

There is no unit test runner in the frontend on purpose: the code that could be unit tested
(paths, limits, MDX preprocessing) is small and stable, and the risky parts (scroll sync,
windowing, workers) are better verified against the real webview. The pieces with subtle logic
are covered by the Rust tests or by the type system.

## Continuous integration

[`ci.yml`](https://github.com/jigonzalez930209/md-view/blob/main/.github/workflows/ci.yml) runs
on every push to `main` and every pull request, on Ubuntu 26.04 with Node 24:

| Job | Steps |
| --- | --- |
| Frontend | `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build` |
| Backend | system dependencies, `cargo fmt --check`, `cargo test` |

The documentation is built and deployed by
[`docs.yml`](https://github.com/jigonzalez930209/md-view/blob/main/.github/workflows/docs.yml).

## Manual checklist before a release

1. `pnpm app` and open the demo: preview, Mermaid, KaTeX, images.
2. Open a folder, switch to a non-Markdown file (code view) and back.
3. Export one document of each kind (PDF, HTML, PNG pages, SVG).
4. Open a file over ~10 MB and switch tabs.
5. Change the palette and the language, reload, and check that both persist.
