# Roadmap

The living roadmap is [`ROADMAP.md`](https://github.com/jigonzalez930209/md-view/blob/main/ROADMAP.md)
in the repository, tracked with the
[`v1.0` milestone](https://github.com/jigonzalez930209/md-view/milestone/1). This page keeps the
summary and what is left.

## Where 1.0 stands

| Workstream | State |
| --- | --- |
| Data safety (close dialog, external changes, encodings, read caps, atomic writes, exports, errors) | Done |
| Desktop polish (window/layout/session, drafts, find + outline, accessibility, PDF availability) | Done |
| Release trust (arm64 + glibc floor, asset scope, error boundary, CI gates, checksums/SBOM/pins, notices/legal) | Done |
| Verification (e2e smoke suites, documentation truth pass) | Done |

## What is left before 1.0

1. The manual checklist on the three platforms (native dialogs, print, window geometry,
   real file-system conflict) — it cannot be automated from CI.
2. `0.9.0` release candidate and a soak period with no P0 issues.
3. The 1.0 release itself (`pnpm release 1.0.0`).

## After 1.0

- Auto-update (Tauri updater, endpoint and keys).
- Code signing and notarization for macOS/Windows.
- Windows ARM64 builds and extra channels (Flathub, Snap, AUR, Homebrew).
- More languages (one dictionary in `src/lib/i18n.ts` each).

The enforced limits and deliberate non-goals are listed in
[Known limitations](/reference/limitations).
