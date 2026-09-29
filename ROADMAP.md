# Roadmap to 1.0

`main` has everything planned for 1.0: the viewer/editor feature set plus the trust work below.
This page tracks the state; issues live in the
[`v1.0` milestone](https://github.com/jigonzalez930209/md-view/milestone/1) and the published
summary is in [docs/development/roadmap](https://jigonzalez930209.github.io/md-view/development/roadmap).

## 1.0 exit criteria

1. No known data-loss path: closing, external edits, encodings and exports are all safe. ✅
2. Installers for the three platforms with an explicit Linux policy (glibc 2.35 floor, arm64 and
   x64). ✅
3. A verifiable release: `SHA256SUMS`, an SBOM, third-party notices in every bundle and pinned
   workflow actions. ✅
4. CI on the release tag: lint, types, e2e, clippy, advisories, tests and notices. ✅
5. Two weeks of `0.9.x` release candidates with no P0 bug open. ⏳

## Decisions

| Decision | Choice |
| --- | --- |
| Signing | 1.0 ships **unsigned**, with checksums, a first-launch note and documented verification. Signing/notarization is post-1.0. |
| Auto-update | **Not in 1.0.** Tauri's updater lands in 1.1. |
| Windows ARM64 | Out of scope for 1.0 (Linux and macOS cover arm64). |
| PDF | Native on Linux; the entry is disabled with an explanation on macOS/Windows. |

## What landed

| Workstream | Contents |
| --- | --- |
| Data safety | Save/discard dialog, external-change detection with reload, encoding preservation, read caps, atomic writes, explicit partial-export confirmation, translated errors |
| Desktop | Window geometry, layout and zoom persistence, session restore, draft autosave and recovery, find in preview, headings outline, accessibility pass (keyboard tree, live status, splitters, AA contrast) |
| Release trust | arm64 + glibc 2.35, asset-protocol scope granted per opened folder, error boundary, lint/clippy/advisories/notices gates, Dependabot, checksums + SBOM + pinned actions, third-party notices, security and privacy policies |
| Verification | Nine Playwright smoke suites in CI, documentation truth pass |

## What is left before 1.0

1. The manual checklist on the three platforms (`docs/development/tests.md`): native dialogs,
   print, window geometry, a real file-system conflict.
2. `0.9.0` release candidate and the soak period.
3. `pnpm release 1.0.0`.

## After 1.0

- Auto-update (Tauri updater, endpoint and keys).
- Code signing and notarization for macOS/Windows.
- Windows ARM64, Flatpak, Snap, AUR and Homebrew channels.
- More languages (one dictionary each in `src/lib/i18n.ts`).

Enforced limits and deliberate non-goals: [Known limitations](https://jigonzalez930209.github.io/md-view/reference/limitations).
