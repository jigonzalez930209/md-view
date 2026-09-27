# Publishing releases

Releases are built by GitHub Actions: you push a tag and the workflow produces the installers
for the three platforms.

## The short version

```bash
pnpm release 0.3.0
```

`scripts/release.sh`:

1. checks that the working tree is clean and you are on `main`,
2. validates the version and that the tag doesn't exist yet,
3. updates the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml` (and refreshes `src-tauri/Cargo.lock`),
4. commits `chore(release): v0.3.0`,
5. creates the tag `v0.3.0` and pushes the commit and the tag.

Pushing the tag starts the release workflow, which creates a **draft release** and uploads the
installers. When the three builds finish, review the draft and press **Publish release** (or
`gh release edit v0.3.0 --draft=false`).

## What ends up in the release

| Runner | Files | Notes |
| --- | --- | --- |
| `ubuntu-26.04` | `.deb`, `.rpm`, `.AppImage` | Needs `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libxdo-dev`, `patchelf` |
| `macos-latest` | `.dmg` | Universal binary: `aarch64-apple-darwin` + `x86_64-apple-darwin` |
| `windows-latest` | `.msi` (WiX), `.exe` (NSIS) | Tauri downloads WiX and NSIS during the build |

::: warning Linux compatibility
The Linux installers are built against Ubuntu 26.04's glibc, so they run on equally new or
newer distributions. If you ever need to support older systems, switch **only the release
job** to `ubuntu-22.04` (the CI can stay on 26.04).
:::

## Publishing without a tag

```bash
gh workflow run release.yml -f tag=v0.3.0
```

Same result, also as a draft. Useful to retry a build without creating another tag.

## Retrying a single platform

Open the run for the tag under **Actions** and use **Re-run failed jobs**. Each platform
uploads its assets independently, so a failure on Windows doesn't invalidate the Linux or
macOS builds.

## Version rules

- The tag must be `v<package.json version>`; the workflow fails otherwise.
- All three version fields are updated together by the script. If you edit them by hand, keep
  them in sync or the release job will refuse to run.
- Pre-release versions like `0.4.0-beta.1` are accepted by the script (the tag becomes
  `v0.4.0-beta.1`).

## After publishing

1. Check the release notes (the workflow writes a short body; edit it if you want).
2. Verify that the assets are there and that the installers open.
3. Update the documentation if the release changed user-visible behavior.

Details about the workflows themselves are in [Workflows](/deployment/workflows); signing is
covered in [Signing binaries](/deployment/signing).
