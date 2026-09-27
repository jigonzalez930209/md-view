# Themes and palettes

md-view ships **three color palettes**, each with a light and a dark variant, plus the option
to follow the system.

| Palette | Character | Primary color |
| --- | --- | --- |
| **GitHub** | The GitHub palette (default) | Blue `#0969da` / `#4493f8` |
| **One Dark** | Atom's One Dark and One Light | Blue `#4078f2` / `#61afef` |
| **Dracula** | Dracula and its light counterpart (Alucard) | Purple `#644ac9` / `#bd93f9` |

![One Dark, dark](/screenshots/theme-one-dark-dark.png)

![Dracula, dark](/screenshots/theme-dracula-dark.png)

![GitHub, dark](/screenshots/theme-github-dark.png)

![One Dark, light](/screenshots/theme-one-dark-light.png)

![Dracula, light](/screenshots/theme-dracula-light.png)

## Switching

- **Settings → Appearance → Theme / Palette**, or
- **Main menu → Appearance** for the quick version.

The choice applies instantly (it is just an attribute on `<html>`) and is remembered.

## What follows the palette

Everything: the interface, the Markdown preview, the syntax highlighting of code blocks
(highlight.js colors come from CSS variables), the editor selection colors and the **Mermaid
diagrams**, which are re-rendered with the new colors when the palette or the theme changes.

## Adding a palette

Palettes are pure CSS. In `src/styles/theme.css`:

1. copy one of the existing blocks, for example `:root[data-palette='github'][data-theme='dark']`,
2. change the palette id and the tokens you want (the list below),
3. add the palette to `PALETTES` in `src/lib/theme.ts` (id, label and three swatch colors for
   the menu).

The tokens each block must define:

```
background foreground card card-foreground popover popover-foreground
primary primary-foreground primary-subtle secondary secondary-foreground
muted muted-foreground subtle-foreground accent accent-foreground
destructive destructive-foreground success warning border border-muted
input ring selection scrollbar shadow-sm shadow-md
bg-inset bg-hover bg-active accent-hover accent-fg danger-subtle code-bg code-fg row-alt
hl-keyword hl-entity hl-constant hl-string hl-variable hl-comment hl-tag hl-subst
hl-section hl-bullet hl-add-fg hl-add-bg hl-del-fg hl-del-bg
alert-note alert-tip alert-important alert-warning alert-caution
```

`--bg`, `--fg`, `--hl-*` and `--alert-*` are the legacy aliases used by `markdown.css` and
CodeMirror; the rest are the shadcn/Tailwind tokens consumed by the UI.
