# Roadmap to 1.0

`main` is at **0.3.1**. The feature set of a viewer/editor is already in place; what is left for
1.0 is **trust**: no data-loss paths, predictable behaviour on the three platforms and a release
users can verify. This page tracks that work; every item links to its issue under the
[`v1.0` milestone](https://github.com/jigonzalez930209/md-view/milestone/1).

## 1.0 exit criteria

1. No known data-loss path: closing, external edits, encodings and exports are all safe.
2. Installers for the three platforms with an explicit Linux compatibility policy (glibc floor,
   ARM64 decision taken).
3. A verifiable release: `SHA256SUMS`, release notes and third-party notices in every bundle.
4. CI on the release tag runs lint, types, tests, clippy, dependency audits and the e2e smoke
   suite.
5. Two weeks of `0.9.x` release candidates with no P0 bug open.

## Decisions

| Decision | Choice |
| --- | --- |
| Signing | 1.0 ships **unsigned**, with checksums, a clear first-launch note and documented verification. Signing/notarization is post-1.0. |
| Auto-update | **Not in 1.0.** Tauri's updater lands in 1.1. |
| Scope | All the P1 features below are in 1.0; the P2 items are engineering/release infrastructure. |

## Release train

| Release | Theme | Contents |
| --- | --- | --- |
| **0.4.0** | Data safety | #2 save from the close dialog · #3 external changes · #4 encodings · #5 read cap · #6 atomic writes · #7 export truncation · #8 translated errors |
| **0.5.0** | Desktop polish | #9 window state, session restore, drafts · #10 find in preview + TOC · #11 accessibility · #12 PDF/print on macOS and Windows |
| **0.6.0** | Release trust | #13 ARM64 and glibc floor · #14 security hardening · #15 error boundary and empty states · #16 CI gates · #17 checksums, signed tags, SBOM · #18 third-party notices and legal docs |
| **0.7.0** | Verification | #19 e2e smoke suite · #20 documentation truth pass |
| **0.9.0-rc** | Freeze | Feature freeze; only fixes. Dogfooding, bug bash, docs final pass |
| **1.0.0** | Publish | Exit criteria met; announcement (promo video already recorded) |

## Workstreams

### P0 — data safety (0.4.0)

- [#2](https://github.com/jigonzalez930209/md-view/issues/2) Save / Save all in the unsaved-changes dialog
- [#3](https://github.com/jigonzalez930209/md-view/issues/3) External file changes: mtime check, reload/revert
- [#4](https://github.com/jigonzalez930209/md-view/issues/4) Encoding preservation (UTF-16 BOM round-trip, refuse non-UTF-8)
- [#5](https://github.com/jigonzalez930209/md-view/issues/5) Read cap and graceful failure on oversized files
- [#6](https://github.com/jigonzalez930209/md-view/issues/6) Atomic-write hardening (unique temp, fsync, symlinks, read-only)
- [#7](https://github.com/jigonzalez930209/md-view/issues/7) Export truncation above the preview limit
- [#8](https://github.com/jigonzalez930209/md-view/issues/8) Translated, typed backend errors

### P1 — desktop polish (0.5.0)

- [#9](https://github.com/jigonzalez930209/md-view/issues/9) Window geometry, layout persistence, session restore, draft autosave
- [#10](https://github.com/jigonzalez930209/md-view/issues/10) Find in preview and headings outline
- [#11](https://github.com/jigonzalez930209/md-view/issues/11) Accessibility pass (tree, tabs, status, splitters, contrast)
- [#12](https://github.com/jigonzalez930209/md-view/issues/12) PDF/print on macOS and Windows

### P2 — release trust (0.6.0–0.7.0)

- [#13](https://github.com/jigonzalez930209/md-view/issues/13) ARM64 builds and lower glibc floor
- [#14](https://github.com/jigonzalez930209/md-view/issues/14) Security hardening (asset scope, IPC caps, drag & drop)
- [#15](https://github.com/jigonzalez930209/md-view/issues/15) Error boundary and empty/error states
- [#16](https://github.com/jigonzalez930209/md-view/issues/16) CI: lint, clippy, audits, dependabot, gates on tags, version check
- [#17](https://github.com/jigonzalez930209/md-view/issues/17) Release verification: checksums, signed tags, pinned actions, SBOM
- [#18](https://github.com/jigonzalez930209/md-view/issues/18) Third-party notices, SECURITY.md, PRIVACY.md, repo templates
- [#19](https://github.com/jigonzalez930209/md-view/issues/19) Frontend e2e smoke tests
- [#20](https://github.com/jigonzalez930209/md-view/issues/20) Docs: known limitations, published roadmap, fix test-list drift

## Known risks

- **Unsigned builds.** Gatekeeper/SmartScreen friction is accepted for 1.0 and mitigated with
  checksums and instructions; the Apple/Windows certificates are a post-1.0 investment.
- **Linux glibc floor.** Today packages are built on Ubuntu 26.04 (#13); until that changes,
  older LTS releases are not supported.
- **Bus factor.** The release script is manual and nothing blocks tagging a red commit (#16).
- **Changelog quality.** Entries are generated from commit titles; noisy `chore`/`refactor`
  lines reach the changelog. Commit conventions are the mitigation until commitlint exists.
- **Silent export truncation** above 1.5 MB is currently the worst UX bug in the app (#7).
