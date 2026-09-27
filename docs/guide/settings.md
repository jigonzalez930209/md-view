# Settings

**Main menu → Settings…** or `Ctrl/⌘ + ,` opens a dialog with every preference. It saves
automatically, and the quick shortcuts in the main menu keep working the same.

![Settings dialog](/screenshots/settings.png)

## All the settings

| Section | Setting | Default | Options |
| --- | --- | --- | --- |
| Appearance | Theme | System | Light, Dark, System |
| Appearance | Palette | GitHub | GitHub, One Dark, Dracula |
| Appearance | Language | English | English, Español |
| Editor | Font size | 13.5 px | 11–20 px |
| Editor | Line numbers | On | On / Off |
| Editor | Wrap lines | On | On / Off (always off in plain-text mode) |
| Preview | Synchronized scroll | On | On / Off |
| Preview | Font size | 16 px | 13–22 px |
| Explorer | Position | Left | Left / Right |
| Export | PDF in light mode | On | On / Off |
| Start | Show recents | On | On / Off |
| Start | Recents list | — | Clear button with the current count |

At the bottom, **Reset** restores every default (with a confirmation step). Resetting also
brings the language back to English.

## Quick access in the main menu

The main menu (☰ in the title bar) mirrors the most used settings so you don't have to open
the dialog:

- **Explorer** toggle (`Ctrl/⌘ + Shift + E`).
- **Appearance** submenu: mode (Light / Dark / System), palette and explorer position.
- **Export** submenu with the format list and the **PDF in light mode** checkbox.

## Where preferences are stored

In `localStorage` under `md-view:prefs` (one JSON object). The keys used by older versions
are migrated the first time you run the current one. Nothing leaves your machine.
