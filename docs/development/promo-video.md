# Promo video

The video on the home page and in the README is a **real screen recording** of the release
build, produced by code in `scripts/promo/`. Nothing is mocked in the final frames.

<script setup>
import { withBase } from 'vitepress';
</script>

<video :src="withBase('/media/md-view-demo.mp4')" :poster="withBase('/media/md-view-demo-poster.jpg')" controls muted playsinline style="max-width:360px;width:100%;border-radius:12px"></video>

## Recording

```sh
pnpm tauri build --no-bundle   # once, or whenever the app changes
pnpm promo                     # → scripts/promo/out/md-view-linkedin.mp4 (+ cover.png, PDF)
```

Requirements (Linux): `xvfb`, `xdotool`, `dbus-run-session`, `git`, `pdftoppm` and, for the
last scene, GNOME Papers. ffmpeg and a compositing browser come from the dev dependencies
(`ffmpeg-static`, Playwright).

## How it works

1. **`probe.mjs`** loads the same frontend in Chrome with a fake Tauri runtime
   (`tauri-mock.js`) at the real window size and walks the same path as the recording
   (open the folder, browse, type…), measuring where tabs, menus and panes end up.
2. **`record.mjs`** creates a demo folder in `~/Documents/md-view-demo` with a small git
   repository (so the change indicator has a `HEAD` to compare against), then runs the real
   binary in a private X display (Xvfb, 2× HiDPI) with isolated config/data dirs and its
   own D-Bus session, so nothing touches your own md-view.
3. **xdotool** drives it with real mouse and keyboard input while ffmpeg grabs the screen
   (`x11grab`). Every action is logged on a timeline.
4. **`stage.html`** composites each captured frame with captions and a gentle camera
   (close-ups only on the diagram and the formula), and ffmpeg encodes 1080×1350 H.264.

## Storyboard

Everything editable lives in `scripts/promo/script.mjs`:

| Constant | What it controls |
| --- | --- |
| `OUTPUT` | Size, fps and `speed` (the final video plays at 1.2×) |
| `FILES`, `GIT` | Demo folder contents and the committed versions |
| `BROWSE` | Files clicked in the explorer, in order |
| `TYPING` | The Mermaid and KaTeX text typed live |
| `THEME_STEPS` | Theme and palette changes shown |
| `PDF_DOC`, `PDF_VIEWER` | Document exported to PDF and the app that opens it |
| `CAPTIONS`, `END_CARD` | Texts on screen |
| `CAMERA` | Zoom levels and transition time |

Scenes: launch, open a folder, browse plain-text files, git change marks, Mermaid, KaTeX,
tabs keeping their scroll, themes and palettes, PDF export, the PDF in GNOME Papers, end
card.

## Publishing

The files used by the site and the README live in `docs/public/media/`:

| File | Used by |
| --- | --- |
| `md-view-demo.mp4` | Home page hero (autoplay, muted, loop) |
| `md-view-demo.webp` | README (animated WebP: GitHub does not play repository MP4s inline) |
| `md-view-demo-poster.jpg` | Poster frame while the video loads |
