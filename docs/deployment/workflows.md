# Workflows

Three GitHub Actions workflows live in `.github/workflows/`. Everything runs on **Ubuntu
26.04** and **Node 24** (the release jobs use 22.04 on purpose, see
[Publishing releases](/deployment/releases)); every `uses:` is pinned to a commit SHA and
Dependabot keeps the pins fresh.

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | push to `main`, tags `v*`, pull requests, manual | Lint, typecheck, build, notices, audit, e2e, format, clippy, advisories and tests |
| `release.yml` | tags `v*`, manual | Build, verify (checksums + SBOM), upload and publish the installers |
| `docs.yml` | push to `main` (docs changes), published release, manual | Build and deploy this site and the APT repository |

## CI

```yaml
jobs:
  frontend:   # ubuntu-26.04
    - pnpm install --frozen-lockfile
    - pnpm lint                    # oxlint
    - pnpm versions                # package.json / tauri.conf.json / Cargo.toml
    - pnpm notices -- --check      # THIRD-PARTY.md matches the dependencies
    - pnpm audit --prod --audit-level high
    - pnpm typecheck
    - pnpm build
    - pnpm docs:build              # fails on dead links

  e2e:        # ubuntu-26.04
    - npx playwright install --with-deps chromium
    - pnpm e2e

  backend:    # ubuntu-26.04
    - apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxdo-dev patchelf
    - cargo fmt --check
    - cargo clippy --all-targets -- -D warnings
    - rustsec/audit-check
    - cargo test
```

Notes:

- **No `libayatana-appindicator3-dev`**: the app doesn't compile Tauri's `tray-icon` feature,
  and that package doesn't exist on Ubuntu 26.04.
- Rust dependencies are cached with `Swatinem/rust-cache`; pnpm with `actions/setup-node`'s
  cache.
- The npm audit only looks at runtime dependencies: docs tooling advisories never ship.
- `concurrency` cancels superseded runs on the same ref.

## Release

Three jobs:

**`create-release`**

1. resolves the tag (`inputs.tag` for a manual run, `github.ref_name` for a tag push),
2. checks that `package.json`, `tauri.conf.json` and `Cargo.toml` agree (`pnpm versions`) and
   that the tag matches them, failing with a helpful message otherwise,
3. builds the release body with `scripts/changelog.mjs extract <version>` (the same entry that
   `pnpm release` added to `CHANGELOG.md`) and appends the installer list and the documentation
   link,
4. creates the **draft** release through `actions/github-script`, and exposes its `releaseId`.

**`publish`** (matrix, `fail-fast: false`)

| Runner | `args` | Result |
| --- | --- | --- |
| `ubuntu-22.04` | `--bundles deb,rpm,appimage` | `.deb`, `.rpm`, AppImage (x64) |
| `ubuntu-22.04-arm` | `--bundles deb,rpm,appimage` | Same, arm64 |
| `macos-latest` | `--target universal-apple-darwin --bundles app,dmg` | Universal `.dmg` |
| `windows-latest` | `--bundles msi,nsis` | `.msi`, `.exe` |

The bundles are listed explicitly so a future Tauri target cannot silently change what a release
ships. The Linux job needs no `rpm`/`rpmbuild`: Tauri's RPM bundler is pure Rust.

Each job installs its system dependencies, sets up pnpm and Node 24, restores the Rust cache
and runs [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) with the
`releaseId` from the first job, so the assets land in the same draft without a race.

On Linux, a last step rewrites the `.deb` dependencies
(`scripts/fix-deb-depends.sh`, see [Publishing releases](/deployment/releases#what-each-package-declares))
and replaces the uploaded asset with `gh release upload --clobber`.

**`finalize`** (only when every platform succeeded, skipped with `-f draft=true`)

1. checks that the `.deb`, `.rpm`, AppImage, `.dmg`, `.msi` and setup `.exe` are attached, and
   that both architectures are present (`_amd64.deb` and `_arm64.deb`),
2. downloads every asset and generates `SHA256SUMS` (then verifies it and uploads it),
3. generates a CycloneDX SBOM with `anchore/sbom-action` and attaches it,
4. publishes the release and marks it as the latest (`gh release edit --draft=false --latest`),
5. starts `docs.yml` on `main` with `gh workflow run`, which rebuilds the APT repository with the
   new `.deb` files. A release published with `GITHUB_TOKEN` does not trigger `release: published`
   in other workflows; `workflow_dispatch` is the exception, hence the `actions: write`
   permission.

::: info Actions used
`actions/checkout@v7`, `actions/setup-node@v7`, `actions/github-script@v9`,
`pnpm/action-setup@v6`, `tauri-apps/tauri-action@action-v1.0.0`,
`dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2`, `rustsec/audit-check@v2` and
`anchore/sbom-action@v0` — every one pinned to a commit SHA with the tag as a comment.
`tauri-action` v1 runs on Node 24.
:::

## Documentation and APT repository

`docs.yml` builds the VitePress site (`pnpm docs:build`, which fails on dead links), adds the APT
repository next to it and publishes both to GitHub Pages:

```yaml
on:
  push: { branches: [main], paths: ['docs/**', …] }
  release: { types: [published] }   # refreshes the APT repository with the new .deb
permissions: { contents: read, pages: write, id-token: write }
steps:
  - pnpm install --frozen-lockfile
  - pnpm docs:build
  - gh release download --pattern '*.deb'      # the latest published release
  - scripts/apt-repo.sh docs/.vitepress/dist/apt /tmp/deb/*.deb
  - actions/upload-pages-artifact
  - actions/deploy-pages
```

The site is served from `https://<user>.github.io/md-view/`, which is why `base: '/md-view/'` is
set in `docs/.vitepress/config.ts` (change it to `'/'` for a custom domain). The APT repository
lives under the same site at `/md-view/apt`, so the two share a single Pages deployment: the
documentation in the root and the packages in `apt/`. `scripts/apt-repo.sh` builds the pool,
`Packages` and `Release` and signs them with the `APT_SIGNING_KEY` secret (the public keyring is
the committed file `docs/public/apt/md-view-archive-keyring.gpg`).

Enable Pages once in **Settings → Pages → Build and deployment → Source: GitHub Actions**.
The `github-pages` environment must allow the `main` branch (**Settings → Environments →
github-pages → Deployment branches and tags**): `docs.yml` always checks out `main`, even when a
release event starts it, so the APT repository is built with the current scripts.

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
pnpm lint && pnpm versions && pnpm notices -- --check && pnpm audit --prod --audit-level high
pnpm typecheck && pnpm build
pnpm e2e
(cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test)
pnpm docs:build
pnpm app:build     # the same build the release jobs run
```
