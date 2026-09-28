# What's new

## 0.3.0

### Editor

- **Change indicator** ([issue #1](https://github.com/jigonzalez930209/md-view/issues/1)):
  green, blue and red marks in the gutter for added, modified and removed lines, compared
  against git `HEAD` when the file is tracked, or against the last save otherwise.
  → [Editor](/guide/editor#change-indicator)
- **Status bar**: git branch and changed-line counts (`main +3 ~2 −1`).

### Preview

- **Zoom only the preview**: touchpad pinch or `Ctrl + wheel` over the preview (50–300%),
  anchored under the pointer, with a one-click reset. The rest of the window never scales.
  → [Preview](/guide/preview#zoom)
- **Stable Mermaid while typing**: the last good diagram stays on screen while the next one
  renders; an error note appears only if the source stays invalid.
- Mermaid diagrams are centered again, and a diagram never leaks into another tab.

### Export

- **Light PDF without flashing**: exporting a light PDF from a dark window no longer repaints
  the app; the light palette exists only for print. → [Export](/guide/export)
- Exports ignore the preview zoom and always come out at 100%.

### Window

- Opens in the theme color (no white/black flash) and fits the screen if the saved size is
  too big, so the window controls are never off screen.
- The layout never gets wider than the window: the title truncates first and the explorer
  takes at most 45% of the width.
- Smooth resizing on Linux/Wayland (no black band, no clipped content).
- The Appearance submenu stays open while you try palettes and modes.
- Paths in the title bar, status bar, explorer and recents keep their direction correctly.

### Project

- A real-recording [promo video](/development/promo-video), now on the home page and in the
  README.

## Full changelog

<!--@include: ../CHANGELOG.md{7,}-->
