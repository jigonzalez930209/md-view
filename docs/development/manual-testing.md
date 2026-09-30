# Manual test plan

What `pnpm e2e` cannot cover: native dialogs, printing, window managers, real file systems and
the three operating systems. Run this on a real machine before calling a release done. Around
**30–45 minutes per platform**; steps marked 🪟🍎 only apply there.

Everything below assumes version **0.7.0** (replace with the version under test).

## 1. Before you start

### 1.1 What you need

- The installer for the platform (from the releases page) or the source tree (`pnpm app`).
- A terminal in the same machine.
- A folder with test documents: create it with the commands below.
- ~5 minutes of patience for the first run of an unsigned build.

### 1.2 Fixtures (once per machine)

Linux / macOS:

```bash
mkdir -p ~/mdview-tests/repo && cd ~/mdview-tests
printf '# Small\n\nbody\n' > small.md
: > empty.md
yes 'line with some text to grow the document' | head -n 200000 > big.md      # ~9 MB
yes 'line with some text to grow the document' | head -n 2200000 > huge.md    # ~100 MB
printf 'caf\xe9 latin1\n' > latin1.md                                          # invalid UTF-8
python3 - <<'PY'
text = 'línea uno\nlínea dos\n'
open('utf16le.md', 'wb').write(b'\xff\xfe' + text.encode('utf-16-le'))
PY
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\mdview-tests" | Out-Null
Set-Location "$env:USERPROFILE\mdview-tests"
"# Small`n`nbody" | Set-Content small.md
New-Item empty.md -ItemType File | Out-Null
$line = "line with some text to grow the document`n"
[IO.File]::WriteAllText("$PWD\big.md",   ($line * 200000))    # ~9 MB
[IO.File]::WriteAllText("$PWD\huge.md",  ($line * 2200000))   # ~100 MB
Set-Content -Encoding Unicode utf16le.md "line one`nline two" # UTF-16 LE with BOM
[IO.File]::WriteAllBytes("$PWD\latin1.md", [byte[]](0x63,0x61,0x66,0xE9,0x0A))  # café, invalid UTF-8
```

Also, inside `~/mdview-tests/repo`, create a git repository with one modified file (for the
change marks):

```bash
cd ~/mdview-tests/repo && git init -q
printf '# Version one\n' > chapter.md && git add . && git commit -qm init
printf '# Version one\n\nnew paragraph\n' > chapter.md       # modified, not committed
printf '# Draft\n' > untracked.md
```

### 1.3 How to report a problem

For every failure, note: platform + version, the exact steps, what you expected, what happened,
the exact message and a screenshot if the interface is involved. File-system problems are much
easier to debug with the document that triggers them attached.

## 2. Linux

### 2.1 Install

- [ ] Install from the APT repository (best coverage):
  ```bash
  sudo apt install md-view && apt policy md-view
  ```
  Expect `0.7.0` and the repository signed by `md-view-archive-keyring.gpg`.
- [ ] Or install the `.deb` by hand (`sudo apt install ./md-view_0.7.0_amd64.deb`), the `.rpm`
  (`sudo dnf install ./md-view-0.7.0-1.x86_64.rpm` on Fedora) or run the AppImage
  (`chmod +x` then double-click).
- [ ] `apt upgrade` on a machine that already had the previous version installs the new one.

### 2.2 First run and integration

- [ ] Launching from the application menu opens the window; the welcome screen shows recents.
- [ ] Double-click a `.md` in the file manager → opens that document.
- [ ] With the app already open, double-click another `.md` → **the same window** loads it (no
  second window, no second process).
- [ ] Drag and drop a `.md` onto the window → opens it. Drop a folder → a friendly message,
  no crash.

### 2.3 Reading (demo)

- [ ] *View demo* from the welcome screen: tables, task lists, alerts, footnotes, emoji, KaTeX
  and a Mermaid diagram render; code blocks are highlighted and the copy button works.
- [ ] `Ctrl+F` while the preview has focus (not the editor): the find bar opens, the counter
  shows `n/total`, `Enter`/`Shift+Enter` move, `Escape` closes and the focus returns to the
  editor. The rendered text is unchanged after closing.
- [ ] Outline button: the panel lists the headings, clicking one scrolls to it, the current
  heading is highlighted while scrolling.
- [ ] Open `huge.md`: the preview shows the "first N lines" notice and the outline button is
  disabled with an explanation.

### 2.4 Editing and files

- [ ] New document (`Ctrl+N`): type something → the tab shows the unsaved dot and the title bar
  shows `●`; `Ctrl+S` opens the **native save dialog**; after saving the dot disappears and the
  document appears in recents.
- [ ] `Ctrl+Shift+S` saves a copy under another name and the tab follows the new path.
- [ ] Open the fixtures folder (menu → *Open folder…*): navigate the tree with the keyboard
  (arrows, `Enter` opens, `Home`/`End`), switch to a `.sh`/`.py` file (code view) and back.
- [ ] Open `repo/chapter.md`: the gutter marks the added lines and the status bar shows the
  branch and `+n`. Commit from the terminal, focus the window → the marks refresh.
- [ ] `empty.md` opens as an empty document without errors.

### 2.5 Outside changes and conflicts

- [ ] With a **clean** tab open, append to the file from the terminal
  (`echo more >> small.md`), focus the app → the new content appears without asking.
- [ ] With a **dirty** tab, append from the terminal, focus the app → a one-time message says
  the file changed on disk.
- [ ] Now `Ctrl+S` → the conflict dialog appears. Test the three answers on three files:
  *Overwrite* keeps your text, *Reload* takes the disk version, *Cancel* does nothing.
- [ ] Edit without saving, then menu → *Reload from disk* → local edits are discarded and the
  message says so.

### 2.6 Encodings and file-system corners

- [ ] `utf16le.md` opens correctly; edit and `Ctrl+S`; reopen with `file`/hexdump → it is still
  UTF-16 LE with BOM.
- [ ] `latin1.md` is **refused** with a message about the encoding (it must not open full of
  `�`).
- [ ] `chmod 444 small.md`, edit it, save → an explicit "read-only" message, the file is
  untouched.
- [ ] Create a symlink (`ln -s small.md link.md`), open the link, save → the link is still a
  link and the target has the new content.

### 2.7 Sessions, drafts, window state

- [ ] Move and resize the window, change the split, resize the explorer, zoom the preview.
  Quit and reopen → geometry, split, explorer width and zoom all come back.
- [ ] Open two documents, quit, reopen → both are restored. Turn *Reopen the last session* off
  in Settings → they don't.
- [ ] Type in a new document without saving, then `kill -9` the app. Reopen → the
  "Unsaved drafts" dialog appears; *Recover* restores the text (dirty). Repeat and choose
  *Discard* → no dialog on the next launch.
- [ ] Quit normally with an unsaved document → the dialog offers Save, Save all and Discard;
  each behaves (saving from the dialog closes the app only when it succeeded).

### 2.8 Export and print

- [ ] **PDF**: paginated, light theme even with a dark palette, page breaks respected.
- [ ] **HTML**: single self-contained file; images and diagrams are embedded (open it with the
  network disconnected).
- [ ] **PNG pages (ZIP)**: one A4 image per page.
- [ ] **SVG**: vector file; the Mermaid diagram is vector too (zoom in without blur).
- [ ] **PNG / JPG / WebP** and **TXT** produce the expected files.
- [ ] `big.md` (9 MB, over the preview limit) → export asks for confirmation and the result
  message says the export is partial; *Cancel* aborts.
- [ ] Print from the export menu uses the system print dialog with the light stylesheet.

### 2.9 Performance

- [ ] `huge.md` (~100 MB): opens with the "opening MB" notice; typing is responsive; switching
  tabs costs no visible freeze; the preview shows only the first lines (by design).
- [ ] A folder with thousands of files opens the explorer without freezing (the tree caps at
  20,000 entries and says when it truncated).

### 2.10 Accessibility and language

- [ ] Keyboard only: `Ctrl+Shift+E` opens the explorer, arrows move, `Enter` opens, `Delete`
  closes a dirty tab, the splitters resize with `←`/`→` and expose their value.
- [ ] With a screen reader (Orca): saving and errors are announced; the tree announces level
  and expanded state.
- [ ] Settings → Language: Spanish; check the menus, dialogs, toasts and the message of a
  forced error (for example opening a file without permissions). Reload → the language persists.

### 2.11 Verify the download

- [ ] `sha256sum --check SHA256SUMS` against the release assets.
- [ ] The APT repository lists `0.7.0` for `amd64` and `arm64`.

## 3. Windows 🪟

Use a clean VM or a spare machine. Run the same sections as Linux with these differences:

- [ ] `.msi` and `-setup.exe` install; SmartScreen warns **once** ("More info → Run anyway");
  the app then starts.
- [ ] `.md` association: double-click opens; a second launch reuses the window.
- [ ] All shortcuts use `Ctrl`, the labels match; native dialogs open for open/save/save-as.
- [ ] **PDF is disabled with an explanation** in the export menu (expected; Linux only).
  HTML, PNG pages, SVG, PNG/JPG/WebP and TXT work.
- [ ] Window geometry, session restore, drafts (`Task Manager → End task`), conflict dialog and
  reload behave as on Linux.
- [ ] DPI: at 150 % scaling the layout is still correct (no clipped toolbars, no blurry text).
- [ ] Uninstall from Settings → Apps: only the config folder (`recents.json`, `drafts.json`)
  remains under `%APPDATA%\com.mdview.desktop`.
- [ ] Test the fixtures from section 1.2 (PowerShell variant); `latin1.md` needs an ANSI file:
  `Set-Content -Encoding Default latin1.md "café"` with a non-UTF8 code page, or copy one from
  Linux.

## 4. macOS 🍎

- [ ] `.dmg` mounts, the app is dragged to Applications, the first launch warns (unsigned) and
  *right-click → Open* makes it stick.
- [ ] `.md` association works; the second launch reuses the window.
- [ ] Shortcuts use `⌘`, labels included.
- [ ] **PDF is disabled with an explanation** (expected).
- [ ] Native dialogs, window geometry, session restore, drafts (`kill -9` from Activity
  Monitor or `killall md-view`), conflict dialog and reload behave as on Linux.
- [ ] Moving the window between a Retina and a non-Retina display keeps text crisp.
- [ ] Quitting with unsaved work offers Save / Save all / Discard / Cancel.

## 5. Result sheet

Copy this into the issue/PR when you finish:

| Section | Result | Notes |
| --- | --- | --- |
| 2.1 Install | | |
| 2.2 Integration | | |
| 2.3 Reading | | |
| 2.4 Editing | | |
| 2.5 Conflicts | | |
| 2.6 Encodings / FS | | |
| 2.7 Sessions / drafts | | |
| 2.8 Export | | |
| 2.9 Performance | | |
| 2.10 Accessibility | | |
| 2.11 Verification | | |

## 6. Known expected behaviours (not bugs)

- macOS and Windows warn on first launch and PDF is Linux-only.
- Documents above the limits (8 MB / 1.5 MB / 1.2 MB / 400 KB) lose copy fidelity or diagrams,
  and say so in the preview.
- The outline and the find bar degrade on windowed documents.
- Images outside the folder you opened may not load in the preview.
- There is no auto-update: the new version is downloaded by hand.
