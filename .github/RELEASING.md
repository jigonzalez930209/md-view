# Releasing md-view

Quick reference. The complete guide lives in the documentation:
**<https://jigonzalez930209.github.io/md-view/deployment/releases>**

## Publish a version

```bash
pnpm release 0.3.0
```

The script checks that the working tree is clean and you are on `main`, updates the version in
`package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (plus `Cargo.lock`),
commits `chore(release): v0.3.0`, creates the tag and pushes it.

The tag starts [`workflows/release.yml`](workflows/release.yml):

1. `create-release` validates the tag against `package.json` and creates a **draft** release.
2. `publish` builds on `ubuntu-26.04`, `macos-latest` (universal) and `windows-latest` and
   uploads the installers to that draft.
3. Review the draft and press **Publish release** (or `gh release edit v0.3.0 --draft=false`).

## Without a tag

```bash
gh workflow run release.yml -f tag=v0.3.0
```

## Workflows

| File | Trigger | Purpose |
| --- | --- | --- |
| [`workflows/ci.yml`](workflows/ci.yml) | push to `main`, PRs | Typecheck, build, `cargo fmt --check`, `cargo test`, docs build |
| [`workflows/release.yml`](workflows/release.yml) | tags `v*` | Installers for Linux, macOS and Windows |
| [`workflows/docs.yml`](workflows/docs.yml) | changes under `docs/` | Build and deploy the documentation to GitHub Pages |

All runners are Ubuntu 26.04 with Node 24; the Linux build skips `libayatana-appindicator3-dev`
(the app has no tray icon and that package doesn't exist on 26.04).

## Signing

Unsigned by default. Add the Apple/Windows secrets listed in the
[signing guide](https://jigonzalez930209.github.io/md-view/deployment/signing) and the workflows
pick them up without changes.
