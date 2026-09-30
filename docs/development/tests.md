# Tests

## Backend (Rust)

```bash
cd src-tauri && cargo test
```

21 unit tests cover the logic that is worth protecting:

| Area | Tests |
| --- | --- |
| Command line and `file://` arguments | `percent_decode_resolves_escapes_and_keeps_invalid`, `files_from_args_ignores_flags_and_missing_files`, `files_from_args_understand_file_urls`, `files_from_urls_keeps_existing_files` |
| Reading | `decode_detects_bom_and_utf16`, `decode_rejects_text_that_is_not_utf8`, `read_document_fails_with_missing_path`, `reads_are_capped_before_touching_memory`, `looks_like_text_uses_extension_and_content` |
| Writing | `write_document_keeps_crlf_bom_and_creates_folders`, `write_document_round_trips_utf16`, `write_document_rejects_unknown_encodings`, `write_atomically_leaves_no_temp_files`, `write_atomically_refuses_read_only_files`, `write_atomically_keeps_symlinks` |
| Folders and git | `read_tree_sorts_and_skips_heavy_folders`, `tree_serializes_in_camel_case`, `git_baseline_reads_head_and_skips_untracked` |
| Outside changes and drafts | `check_document_detects_outside_changes`, `drafts_round_trip_and_survive_corruption` |
| Platform | `pdf_support_matches_the_platform` |

Formatting and lints are part of the gate:

```bash
cd src-tauri && cargo fmt --check
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

## Frontend

```bash
pnpm lint         # oxlint (correctness and React rules)
pnpm typecheck    # tsc --noEmit
pnpm build        # typecheck + production build
pnpm notices -- --check   # THIRD-PARTY.md matches the dependency tree
pnpm versions     # the three version files agree
pnpm docs:build   # documentation site (fails on dead links)
```

There is no unit test runner in the frontend on purpose: the code that could be unit tested
(paths, limits, MDX preprocessing) is small and stable, and the risky parts (scroll sync,
windowing, workers) are better verified against the real webview. The pieces with subtle logic
are covered by the Rust tests or by the type system.

## End to end

```bash
pnpm e2e                    # every suite
pnpm e2e find export        # only the suites whose name contains those words
npx playwright install --with-deps chromium   # once, first time
```

Nine browser-mode suites live in `e2e/` and share `harness.mjs`; the runner starts the dev
server, runs them and stops it. They cover: closing dirty tabs (save/discard/cancel), exports
(including the partial-export confirmation), reload from disk, translated errors, draft
recovery, layout persistence, the accessibility pass (tree, splitters, tabs, live status),
find in preview + outline, and the PDF availability rules.

## Continuous integration

[`ci.yml`](https://github.com/jigonzalez930209/md-view/blob/main/.github/workflows/ci.yml) runs
on every push to `main`, every pull request **and every tag**:

| Job | Steps |
| --- | --- |
| Frontend | install, `pnpm lint`, `pnpm versions`, `pnpm notices -- --check`, runtime-only `pnpm audit`, typecheck, build, docs build |
| End to end (Matrix) | `ubuntu-latest`, `macos-latest`, `windows-latest`: install, Chromium, `pnpm e2e` (9 smoke suites) |
| Backend quality | Linux: system dependencies, `cargo fmt --check`, `cargo clippy -D warnings`, Rust advisories |
| Backend tests (Matrix) | `ubuntu-latest`, `macos-latest`, `windows-latest`: `cargo test` (21 unit tests covering encoding, symlinks, git, outside changes, platform PDF checks) |

Dependabot keeps npm, cargo and the workflow actions updated every week. The documentation is
built and deployed by
[`docs.yml`](https://github.com/jigonzalez930209/md-view/blob/main/.github/workflows/docs.yml).

## Manual checklist before a release

Everything in `pnpm e2e` is automatic; the rest needs the real app on real systems. The full
step-by-step script (fixtures, every platform, expected results, result sheet) lives in
[Manual test plan](/development/manual-testing). In short:

1. Install from the release artifacts and check the file association on each platform.
2. Open documents, folders and the demo; exercise the preview, find and outline.
3. Save (native dialog), save as, reload from disk and the external-change conflict dialog.
4. Kill the app with unsaved work and recover the draft; check geometry and session restore.
5. Export every format (and the partial-export confirmation for large documents).
6. Open the ~100 MB fixture and switch tabs.
7. Keyboard-only pass; switch the language and reload.
8. Verify `SHA256SUMS` and the APT repository.
