# Icons

The app icons live in `src-tauri/icons/` and are listed in `tauri.conf.json`
(`bundle.icon`). The set is the standard one for Tauri:

| File | Used for |
| --- | --- |
| `32x32.png`, `128x128.png` | Linux (hicolor theme), window and dialogs |
| `128x128@2x.png` (256 px) | High-DPI screens |
| `icon.png` (512 px) | AppImage and `.deb` |
| `icon.ico` | Windows: 16, 24, 32, 48, 64, 128 and 256 px |
| `icon.icns` | macOS: 32, 64, 128, 256, 512 and 1024 px (`ic07`–`ic14`) |

![App icon](/logo.png)

## Regenerating them

The icon is drawn with Pillow and exported at every size:

```bash
python3 -m pip install pillow   # only dependency
pnpm icons
```

`scripts/generate-icons.py` draws the rounded gradient tile with the white **M↓** mark and
writes the PNGs, the multi-resolution `.ico` and the `.icns`.

## Verifying the set

After regenerating (or when editing the list), check that every referenced file exists:

```bash
python3 - <<'PY'
import json, os
conf = json.load(open('src-tauri/tauri.conf.json'))
for icon in conf['bundle']['icon']:
    path = os.path.join('src-tauri', icon)
    print(icon, os.path.getsize(path), 'OK' if os.path.exists(path) else 'MISSING')
PY
```

Expected output:

```
icons/32x32.png 1638 OK
icons/128x128.png 7109 OK
icons/128x128@2x.png 13692 OK
icons/icon.png 24348 OK
icons/icon.icns 94823 OK
icons/icon.ico 30781 OK
```

## Platform notes

- **Windows**: the `.ico` is embedded in the executable and used by the installers, so it must
  contain small sizes (16/24) or the icon looks blurry in the taskbar.
- **macOS**: the `.icns` should include the retina variants; `pnpm icons` writes `ic13`/`ic14`
  for that.
- **Linux**: `.deb` and AppImage use the PNGs; keeping the 512 px one in `bundle.icon` gives a
  sharper dock icon.
- **The window icon** and the task switcher use the same files: there is nothing extra to
  configure.

## Documentation and web assets

| File | Where |
| --- | --- |
| `public/favicon.svg` | Browser tab of the app (and of this site) |
| `docs/public/logo.png` | Logo in the documentation header |
| `docs/public/favicon.svg` | Favicon of the documentation site |
| `public/demo-animated.svg` | The animated SVG used by the demo document |
