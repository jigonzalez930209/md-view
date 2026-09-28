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
4. adds the **changelog entry** for this version to `CHANGELOG.md`,
5. commits `chore(release): v0.3.0`,
6. creates the tag `v0.3.0` and pushes the commit and the tag.

Pushing the tag starts the release workflow, which creates a **draft release** (its body is the
changelog entry) and uploads the installers. When the three builds finish, review the draft and
press **Publish release** (or `gh release edit v0.3.0 --draft=false`).

Useful flags:

```bash
pnpm release 0.3.0 --dry-run    # show the version bump and the changelog entry, touch nothing
pnpm release 0.3.0 --no-push    # bump, changelog, commit and tag, but keep it local
pnpm release 0.3.0 --no-changelog
```

## The changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The entry for a
version is generated from the commits since the previous tag
(`scripts/changelog.mjs`), grouped by [Conventional Commit](https://www.conventionalcommits.org/)
type:

| Commits | Section |
| --- | --- |
| `feat:` | Added |
| `fix:` | Fixed |
| `perf:` | Performance |
| `refactor:` | Changed |
| `docs:` | Documentation |
| `test:` | Tests |
| `build:`, `ci:`, `chore:`, `style:`, `revert:` | Maintenance |

`chore(release)` commits are skipped, and for the **first** version the entry just says
*First release* (there is no previous version to compare against). You can preview the entry at
any time with `pnpm changelog`.

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

## What each package declares

The bundlers do not guess the runtime dependencies, and Tauri's default `.deb` list is
`libwebkit2gtk-4.1-0` + `libgtk-3-0`, which **does not exist** on Ubuntu 24.04 or newer (the
package is `libgtk-3-0t64` there). `src-tauri/tauri.conf.json` therefore declares:

| Package | Dependencies |
| --- | --- |
| `.deb` | `libwebkit2gtk-4.1-0`, `libgtk-3-0 \| libgtk-3-0t64` (the alternative covers both the old and the `t64` rename) |
| `.rpm` | none declared: the bundler resolves the sonames automatically (`libwebkit2gtk-4.1.so.0()(64bit)`, `libgtk-3.so.0()(64bit)`), which works on Fedora and openSUSE alike |

The packages also ship `/usr/share/metainfo/com.mdview.desktop.metainfo.xml` (AppStream, what app
centers read), the desktop entry, `/usr/share/doc/md-view/copyright` (DEP-5, required by Debian
policy) and `/usr/share/licenses/md-view/LICENSE` in the `.rpm`.

Publishing a release also refreshes the [APT repository](/guide/installation#apt-repository-debian-ubuntu-and-derivatives)
through the docs workflow, so `apt install md-view` picks up the new `.deb`.

Tauri **appends** its own defaults (`libwebkit2gtk-4.1-0`, `libgtk-3-0`) to whatever the config
declares, and `libgtk-3-0` does not exist on Ubuntu 24.04+. The release workflow therefore runs
[`scripts/fix-deb-depends.sh`](https://github.com/jigonzalez930209/md-view/blob/main/scripts/fix-deb-depends.sh)
on the built package (it rewrites `Depends:` with the list from `tauri.conf.json`, repacking with
`--root-owner-group`) and replaces the uploaded asset with `gh release upload --clobber`.

## AppStream metadata

The `.deb`, the `.rpm` and the AppImage ship
`src-tauri/linux/com.mdview.desktop.metainfo.xml` as `/usr/share/metainfo/com.mdview.desktop.metainfo.xml`.
App centers (GNOME Software / App Center, KDE Discover) read that file to show the name, summary,
description, **license (MIT)**, developer, homepage, screenshots and the **release date**; without
it an installed `.deb` shows up as *Unknown publisher*, *License: unknown* and a gray icon.

`scripts/release.sh` prepends the `<release version="…" date="…"/>` entry for each version, and
`appstreamcli validate` accepts the file (also inside the built packages). Note that App Center
still labels any package installed from outside a distribution repository as *third-party /
potentially unsafe*: that warning comes from the source of the package, not from its metadata.

The desktop entry both packages install (`src-tauri/linux/md-view.desktop`) is Tauri's default
plus two fixes:

```ini
Exec=md-view %U          # without %U the file manager opens the app but passes no file
MimeType=text/markdown;  # the key needs the trailing semicolon
```

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
