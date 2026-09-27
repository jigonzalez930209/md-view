# Workflows

Three GitHub Actions workflows live in `.github/workflows/`. Everything runs on **Ubuntu
26.04** and **Node 24**; the actions themselves are on their current major versions.

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push to `main`, pull requests, manual | Typecheck, build, format and tests |
| `release.yml` | tags `v*`, manual | Build and upload the installers |
| `docs.yml` | push to `main` (docs changes), manual | Build and deploy this site |

## CI

```yaml
jobs:
  frontend:   # ubuntu-26.04
    - pnpm install --frozen-lockfile
    - pnpm typecheck
    - pnpm build

  backend:    # ubuntu-26.04
    - apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxdo-dev patchelf
    - cargo fmt --check
    - cargo test
```

Notes:

- **No `libayatana-appindicator3-dev`**: the app doesn't compile Tauri's `tray-icon` feature,
  and that package doesn't exist on Ubuntu 26.04.
- Rust dependencies are cached with `Swatinem/rust-cache`; pnpm with `actions/setup-node`'s
  cache.
- `concurrency` cancels superseded runs on the same ref.

## Release

Two jobs:

**`create-release`**

1. resolves the tag (`inputs.tag` for a manual run, `github.ref_name` for a tag push),
2. validates it against `package.json` and fails with a helpful message when they differ,
3. creates the **draft** release through `actions/github-script`, and exposes its `releaseId`.

**`publish`** (matrix, `fail-fast: false`)

| Runner | `args` | Result |
| --- | --- | --- |
| `ubuntu-26.04` | — | `.deb`, `.rpm`, AppImage |
| `macos-latest` | `--target universal-apple-darwin` | Universal `.dmg` |
| `windows-latest` | — | `.msi`, `.exe` |

Each job installs its system dependencies, sets up pnpm and Node 24, restores the Rust cache
and runs [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) with the
`releaseId` from the first job, so the assets land in the same draft without a race.

::: info Actions used
`actions/checkout@v7`, `actions/setup-node@v7`, `actions/github-script@v9`,
`pnpm/action-setup@v6`, `tauri-apps/tauri-action@action-v1.0.0`,
`dtolnay/rust-toolchain@stable` and `Swatinem/rust-cache@v2`. `tauri-action` v1 runs on
Node 24.
:::

## Documentation

`docs.yml` builds the VitePress site (`pnpm docs:build`, which fails on dead links) and
publishes it to GitHub Pages:

```yaml
permissions: { contents: read, pages: write, id-token: write }
steps:
  - pnpm install --frozen-lockfile
  - pnpm docs:build
  - actions/upload-pages-artifact
  - actions/deploy-pages
```

Enable Pages once in **Settings → Pages → Build and deployment → Source: GitHub Actions**. The
site is served from `https://<user>.github.io/md-view/`, which is why `base: '/md-view/'` is set
in `docs/.vitepress/config.ts` (change it to `'/'` for a custom domain).

## Required repository settings

| Setting | Value | Why |
| --- | --- | --- |
| Workflow permissions | Read and write (the release job needs `contents: write`, declared in the workflow) | Creating releases and uploading assets |
| Pages source | GitHub Actions | Hosting the documentation |
| Secrets | optional | Only for [signing](/deployment/signing) |

## Running the workflows locally

The pieces are plain commands, so anything the workflows do can be reproduced:

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm build
(cd src-tauri && cargo fmt --check && cargo test)
pnpm docs:build
pnpm app:build     # the same build the release jobs run
```
