# Troubleshooting

## Releases

**`The tag (vX) does not match package.json (vY)`**
The tag and the version in `package.json` must be the same, and that is checked before anything
is built. Use `pnpm release X` to bump the three version files, add the changelog entry and
create the tag: `pnpm release X --dry-run` shows what would change. If the tag already exists
with the wrong version, delete it (`git tag -d vX && git push origin :refs/tags/vX`) and redo it.

**The docs workflow fails with `Not Found` in `configure-pages`**
GitHub Pages is not enabled, or the repository is **private** on a plan that does not include
Pages for private repositories (the API answers `422 Your current plan does not support GitHub
Pages for this repository`). Enable it under **Settings → Pages → Build and deployment → Source:
GitHub Actions**; if the repo is private and the plan is Free, Pages is only available after
making the repository public or upgrading the account. Note that the action's
`enablement: true` option does not help here: it requires a token other than `GITHUB_TOKEN`.

**`pnpm install --frozen-lockfile` fails**
`pnpm-lock.yaml` is out of sync with `package.json`. Run `pnpm install` locally and commit the
lockfile.

**The Linux job fails installing dependencies**
Check that the package exists on the runner's Ubuntu version. Real example: on 26.04
`libayatana-appindicator3-dev` no longer exists, and md-view doesn't need it (no tray icon).

**macOS takes very long or fails building the universal binary**
That job compiles twice (Intel + Apple Silicon). Make sure `dtolnay/rust-toolchain` installs
both targets — it is already in the workflow; a network hiccup downloading them is the usual
cause, so re-run the job.

**Windows fails with WiX/NSIS**
Tauri downloads those tools at build time. Re-run the job; if it persists, pin
`@tauri-apps/cli` to a known version.

**The release exists but assets are missing**
Each platform job uploads independently. Open the failed job under **Actions** and use
**Re-run failed jobs**; the assets will be added to the same draft.

**I want to version without publishing**
Use `gh workflow run release.yml -f tag=vX` and leave the draft unpublished (or delete it with
`gh release delete vX`).

## Documentation

**The site loads without styles or with broken links**
Check `base` in `docs/.vitepress/config.ts`: it must match the repository name for GitHub Pages
project sites (`/md-view/`).

**`pnpm docs:build` fails on a dead link**
VitePress validates internal links. The error names the file and the missing target; fix the
link or create the page.

## Application

**A change doesn't show up while developing**
Reload the window (`Ctrl + R`). Vite occasionally serves a stale transformed module after big
refactors; restarting `pnpm app` fixes it for good.

**The window is stuck / a huge document freezes the UI**
It shouldn't: documents over 500 KB render in a worker and the editor goes plain over 1.2 MB.
If you reproduce a freeze, please include the file size and the content shape (many lines or
one huge line) in the issue.

**Images from a document don't show**
Relative paths are resolved against the document folder. If neither interpretation exists on
disk, md-view keeps the original path, which is what makes app-served paths like
`/demo-animated.svg` work. A path with `file://` or an unsupported scheme is left to the webview
and may be blocked by the CSP.

**The PDF is empty or the print dialog opens instead**
The direct PDF path uses WebKitGTK and only works on Linux. On macOS and Windows md-view opens
the system print dialog, where you choose *Save as PDF*.

**Spanish accents or emoji look wrong in the exported SVG**
The SVG embeds the KaTeX fonts; system fonts (emoji) depend on the viewer. Open it in a browser
or in Inkscape with the fonts installed.

**The dialog text looks blurry**
On WebKitGTK a `backdrop-filter` on the dialog overlay or a scale/zoom animation on the
panel leaves the content at half-pixel positions and the text looks soft. That is why the
dialog overlay only dims the background (`bg-black/50`) and the panel is centered by a flex
wrapper instead of `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` plus
`zoom-in-95`: keep it that way when touching `components/ui/dialog.tsx`.

**The `.deb` does not install on Ubuntu 24.04 or newer**
Tauri always appends `libwebkit2gtk-4.1-0` and `libgtk-3-0` to the package dependencies, and
`libgtk-3-0` was renamed to `libgtk-3-0t64` in 24.04, so `apt install ./md-view_x.deb` stops with
unmet dependencies. `scripts/fix-deb-depends.sh <file.deb>` rewrites the `Depends:` field with
the list from `tauri.conf.json` (which declares both names) and repacks the package; the release
workflow runs it automatically and re-uploads the fixed file. You can check the result with
`dpkg-deb -I <file.deb>`.

**The window can't be dragged by the title bar**
The header uses `data-tauri-drag-region="deep"` (`components/HeaderBar.tsx`). Tauri walks the
composed path (`window/scripts/drag.js`) and the **bare** attribute only drags when the click
lands exactly on that element, while a nested bare attribute stops the walk; with `deep` the
whole bar drags and buttons, links and menus still take their click.

**A black band appears while resizing the window (Linux)**
WebKitGTK's DMA-BUF renderer hands frames to the Wayland compositor one frame late, so a
growing window shows a black band and a shrinking one clips the content. md-view sets
`WEBKIT_DISABLE_DMABUF_RENDERER=1` at startup (GPU rendering stays on). If you set the
variable yourself, your value wins: `WEBKIT_DISABLE_DMABUF_RENDERER=0 md-view` goes back to
the DMA-BUF path.

**The whole app zoomed in and scrollbars appeared**
A touchpad pinch used to scale the entire page. Since 0.3.0 the backend swallows it and the
pinch zooms only the preview. If you still see it, you are running an older build.

**Where are the recent files stored?**
In the app configuration folder (`recents.json`); in the browser, in `localStorage`. The
preferences live in `localStorage` under `md-view:prefs`.

**Does md-view phone home?**
No. There is no telemetry, no account and no network request except the links you explicitly
open.
