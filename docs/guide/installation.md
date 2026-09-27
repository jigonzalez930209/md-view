# Installation

## Prebuilt installers

Every release ships installers for the three desktop platforms. Download them from the
[releases page](https://github.com/jigonzalez930209/md-view/releases).

| Platform | Files | Notes |
| --- | --- | --- |
| Linux | `.deb`, `.rpm`, `.AppImage` | Built on Ubuntu 26.04, so they need a distribution with a similar or newer glibc |
| macOS | `.dmg` | Universal binary: Intel and Apple Silicon |
| Windows | `.msi`, `.exe` (NSIS) | Works on Windows 10 and 11 |

::: info Unsigned builds
The installers are **not signed** by default: macOS will ask you to confirm the first launch
(and may require *System Settings → Privacy & Security → Open Anyway*) and Windows will show
a SmartScreen warning. Signing is a matter of adding the [signing secrets](/deployment/signing).
:::

The packages register **md-view** as a viewer for `.md` files, so you can also open a
document by double-clicking it in your file manager. If the app is already running, the
second invocation reuses the window and loads the file there.

## From source

### Requirements

| Tool | Version |
| --- | --- |
| Node | **24** or newer (`engines` in `package.json`) |
| pnpm | 10 or newer |
| Rust | 1.77 or newer (tested with 1.97) |

System dependencies for Tauri:

```bash
# Debian / Ubuntu (tested on 26.04)
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev librsvg2-dev patchelf

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel

# Arch
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl \
  libappindicator-gtk3 librsvg
```

::: tip No tray icon
md-view does not use the system tray, so you do **not** need `libayatana-appindicator`
(which is why it is missing from the list: it no longer exists on Ubuntu 26.04).
:::

### Install and run

```bash
pnpm install
pnpm app        # compiles the Rust backend and opens the app (tauri dev)
```

Other commands:

```bash
pnpm dev          # frontend only, in the browser (http://localhost:1420)
pnpm build        # typecheck + production build of the frontend
pnpm app:build    # binary and installers (deb, AppImage, rpm, dmg, msi...)
pnpm icons        # regenerate src-tauri/icons
pnpm docs:dev     # documentation site in development
pnpm docs:build   # build the documentation site
```

Backend tests:

```bash
cd src-tauri && cargo test
```

### Open a file from the terminal

```bash
# In development, arguments go after the two "--"
# (pnpm consumes the first one, the Tauri CLI the second).
pnpm app -- -- -- ~/notes/README.md

# With an already built release binary
pnpm app:build
./src-tauri/target/release/md-view ~/notes/README.md
```
