//! md-view backend.
//!
//! The frontend (React) handles rendering; only what needs access to the
//! system lives here: reading and writing files, remembering recents,
//! opening links with the browser and receiving files from the command line.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

/// How many files we remember in the recent list.
const RECENT_LIMIT: usize = 12;
/// Folder tree limits, so the app does not freeze on huge repos.
const TREE_MAX_ENTRIES: usize = 20_000;
const TREE_MAX_DEPTH: u32 = 16;

/// Folders that add nothing and are usually huge.
const TREE_IGNORED_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "target",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".next",
    ".cache",
    ".gradle",
    ".idea",
];

/// Extensions we consider text without reading the content.
const TEXT_EXTENSIONS: &[&str] = &[
    "md",
    "markdown",
    "mdx",
    "mdown",
    "mkd",
    "mkdn",
    "mdwn",
    "mdtxt",
    "mdtext",
    "mdoc",
    "rmd",
    "qmd",
    "txt",
    "text",
    "rst",
    "adoc",
    "asciidoc",
    "org",
    "tex",
    "bib",
    "json",
    "jsonc",
    "json5",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "properties",
    "env",
    "csv",
    "tsv",
    "log",
    "xml",
    "html",
    "htm",
    "xhtml",
    "svg",
    "css",
    "scss",
    "sass",
    "less",
    "styl",
    "js",
    "mjs",
    "cjs",
    "jsx",
    "ts",
    "tsx",
    "mts",
    "cts",
    "vue",
    "svelte",
    "astro",
    "py",
    "pyi",
    "rb",
    "go",
    "rs",
    "java",
    "kt",
    "kts",
    "c",
    "h",
    "cc",
    "cpp",
    "cxx",
    "hpp",
    "hh",
    "cs",
    "php",
    "swift",
    "m",
    "mm",
    "scala",
    "clj",
    "cljs",
    "ex",
    "exs",
    "erl",
    "hrl",
    "hs",
    "lhs",
    "lua",
    "r",
    "pl",
    "pm",
    "sh",
    "bash",
    "zsh",
    "fish",
    "ksh",
    "ps1",
    "bat",
    "cmd",
    "sql",
    "graphql",
    "gql",
    "proto",
    "dockerfile",
    "makefile",
    "cmake",
    "gradle",
    "lock",
    "gitignore",
    "gitattributes",
    "editorconfig",
    "nix",
    "dart",
    "sol",
    "gleam",
    "zig",
    "nim",
    "v",
    "vala",
    "purs",
    "elm",
    "wat",
    "wgsl",
    "glsl",
    "shader",
    "diff",
    "patch",
    "srt",
    "vtt",
    "po",
    "pot",
];

/// Clearly binary extensions (no need to read them).
const BINARY_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "icns", "tif", "tiff", "psd", "xcf",
    "pdf", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "zst", "lz4", "mp3", "m4a", "ogg",
    "oga", "opus", "wav", "flac", "aac", "wma", "mp4", "m4v", "webm", "mov", "avi", "mkv", "wmv",
    "flv", "woff", "woff2", "ttf", "otf", "eot", "wasm", "so", "dll", "dylib", "exe", "msi", "bin",
    "class", "jar", "war", "pyc", "pyo", "o", "a", "lib", "obj", "sqlite", "sqlite3", "db", "mdb",
    "dmg", "iso", "img", "deb", "rpm", "apk", "ipa", "blend", "fbx", "glb", "gltf", "stl", "heic",
    "heif", "raw", "cr2", "nef", "arw",
];

/// Names without an extension that are still text.
const TEXT_FILE_NAMES: &[&str] = &[
    "dockerfile",
    "makefile",
    "license",
    "licence",
    "readme",
    "changelog",
    "notice",
    "authors",
    "contributing",
    "codeowners",
    "gemfile",
    "rakefile",
    "procfile",
    "brewfile",
    "justfile",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeEntry {
    name: String,
    path: String,
    /// "dir" or "file".
    kind: &'static str,
    /// Only meaningful for files: it can be opened with the editor.
    is_text: bool,
    size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeEntry>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderTree {
    root: TreeEntry,
    /// true if it was cut short by file count or depth.
    truncated: bool,
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Decides whether a file can be read as text, looking at the extension and, if
/// that is not enough, the first bytes (no NUL and valid UTF-8).
fn looks_like_text(path: &Path, size: u64) -> bool {
    let extension = extension_of(path);
    if !extension.is_empty() {
        if TEXT_EXTENSIONS.contains(&extension.as_str()) {
            return true;
        }
        if BINARY_EXTENSIONS.contains(&extension.as_str()) {
            return false;
        }
    }

    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if TEXT_FILE_NAMES
        .iter()
        .any(|candidate| name == *candidate || name.starts_with(&format!("{candidate}.")))
    {
        return true;
    }

    if size == 0 {
        return true;
    }
    if size > 5 * 1024 * 1024 {
        return false; // too large for the editor
    }

    let Ok(file) = fs::File::open(path) else {
        return false;
    };
    let mut buffer = [0u8; 4096];
    let mut limited = std::io::BufReader::new(file).take(4096);
    let read = limited.read(&mut buffer).unwrap_or(0);
    let sample = &buffer[..read];
    if sample.contains(&0) {
        return false;
    }
    std::str::from_utf8(sample).is_ok()
}

fn read_tree_dir(path: &Path, depth: u32, budget: &mut usize) -> (Vec<TreeEntry>, bool) {
    let mut entries: Vec<TreeEntry> = Vec::new();
    let mut truncated = false;

    let Ok(reader) = fs::read_dir(path) else {
        return (entries, truncated);
    };

    for item in reader.flatten() {
        if *budget == 0 {
            truncated = true;
            break;
        }

        let Ok(metadata) = item.metadata() else {
            continue;
        };
        // Symbolic links are ignored to avoid cycles.
        if item
            .file_type()
            .map(|kind| kind.is_symlink())
            .unwrap_or(false)
        {
            continue;
        }

        let name = item.file_name().to_string_lossy().into_owned();
        let child_path = item.path();
        let path_string = child_path.to_string_lossy().into_owned();

        if metadata.is_dir() {
            if TREE_IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }
            *budget -= 1;
            let (children, cut) = if depth + 1 >= TREE_MAX_DEPTH {
                (Vec::new(), true)
            } else {
                read_tree_dir(&child_path, depth + 1, budget)
            };
            truncated |= cut;
            entries.push(TreeEntry {
                name,
                path: path_string,
                kind: "dir",
                is_text: true,
                size: 0,
                children: Some(children),
            });
        } else if metadata.is_file() {
            *budget -= 1;
            entries.push(TreeEntry {
                name,
                path: path_string,
                kind: "file",
                is_text: looks_like_text(&child_path, metadata.len()),
                size: metadata.len(),
                children: None,
            });
        }
    }

    entries.sort_by(|a, b| {
        let kind = |entry: &TreeEntry| if entry.kind == "dir" { 0 } else { 1 };
        kind(a)
            .cmp(&kind(b))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    (entries, truncated)
}

fn build_folder_tree(path: String) -> Result<FolderTree, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let mut budget = TREE_MAX_ENTRIES;
    let (children, truncated) = read_tree_dir(&root, 0, &mut budget);
    let name = root
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());

    Ok(FolderTree {
        root: TreeEntry {
            name,
            path,
            kind: "dir",
            is_text: true,
            size: 0,
            children: Some(children),
        },
        truncated,
    })
}

/// Walks a folder and returns the full tree (async: does not block the UI).
#[tauri::command]
async fn read_tree(path: String) -> Result<FolderTree, String> {
    build_folder_tree(path)
}

/// Files requested from the command line that the frontend has not consumed yet.
#[derive(Default)]
struct PendingOpen(Mutex<Vec<String>>);

#[derive(Debug, Serialize)]
struct Document {
    /// Absolute path of the file.
    path: String,
    /// File name, without folders.
    name: String,
    /// Content normalized to LF (the editor always works with LF).
    content: String,
    /// Original end of line: "\n" or "\r\n".
    eol: String,
    /// Whether the file started with a UTF-8 BOM.
    bom: bool,
}

/* ------------------------------------------------------------------ */
/* Reading and writing                                                 */
/* ------------------------------------------------------------------ */

// Large-file commands are async: reading, serializing and sending back
// several megabytes over IPC must not freeze the interface.
#[tauri::command]
async fn read_document(path: String) -> Result<Document, String> {
    read_document_impl(path)
}

#[tauri::command]
async fn write_document(
    path: String,
    content: String,
    eol: Option<String>,
    bom: Option<bool>,
) -> Result<(), String> {
    write_document_impl(path, content, eol, bom)
}

#[tauri::command]
async fn read_file_base64(path: String) -> Result<String, String> {
    read_file_base64_impl(path)
}

/// Disk read (blocking); the command runs it off the main thread.
fn read_document_impl(path: String) -> Result<Document, String> {
    let file = PathBuf::from(&path);
    if !file.is_file() {
        return Err(format!("File not found: {path}"));
    }

    let bytes = fs::read(&file).map_err(|err| format!("Could not read {path}: {err}"))?;
    let (text, bom) = decode(&bytes);

    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let name = file
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());

    Ok(Document {
        path: file.to_string_lossy().into_owned(),
        name,
        content: text.replace("\r\n", "\n").replace('\r', "\n"),
        eol: eol.to_string(),
        bom,
    })
}

fn write_document_impl(
    path: String,
    content: String,
    eol: Option<String>,
    bom: Option<bool>,
) -> Result<(), String> {
    let target = PathBuf::from(&path);

    let text = if eol.as_deref() == Some("\r\n") {
        content.replace('\n', "\r\n")
    } else {
        content
    };

    let mut bytes = Vec::with_capacity(text.len() + 3);
    if bom.unwrap_or(false) {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(text.as_bytes());

    write_atomically(&target, &bytes)
}

/// Writes to a temp file and renames: if anything fails, the original file stays intact.
fn write_atomically(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = match target.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|err| format!("Could not create the folder {}: {err}", dir.display()))?;
    }

    let name = target
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| String::from("document.md"));
    let temp = dir.join(format!(".{name}.md-view.tmp"));

    fs::write(&temp, bytes).map_err(|err| format!("Could not write {}: {err}", temp.display()))?;

    // We keep the original file's permissions when it already existed.
    if let Ok(metadata) = fs::metadata(target) {
        let _ = fs::set_permissions(&temp, metadata.permissions());
    }

    fs::rename(&temp, target).map_err(|err| {
        let _ = fs::remove_file(&temp);
        format!("Could not save {}: {err}", target.display())
    })
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/// Writes any text file (HTML, SVG, TXT...).
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    write_atomically(Path::new(&path), content.as_bytes())
}

/// Writes a binary file that arrives as base64 (PNG, JPG, WebP...).
#[tauri::command]
fn write_base64_file(path: String, data: String) -> Result<(), String> {
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|err| format!("Invalid binary data: {err}"))?;
    write_atomically(Path::new(&path), &bytes)
}

/// Reads a file and returns it as base64 (to embed images when exporting).
fn read_file_base64_impl(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|err| format!("Could not read {path}: {err}"))?;
    Ok(BASE64.encode(bytes))
}

/// Exports the current page to PDF with the WebKitGTK printing engine.
///
/// Uses GTK's "Print to File" backend and waits for the operation to finish
/// to notify the frontend. On other systems, the print dialog is used.
#[cfg(target_os = "linux")]
#[tauri::command]
async fn export_pdf(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    use webkit2gtk::PrintOperationExt;

    let uri = gtk::glib::filename_to_uri(&path, None::<&str>)
        .map_err(|err| format!("Invalid path: {err}"))?
        .to_string();

    let (sender, receiver) = std::sync::mpsc::channel::<Result<(), String>>();
    let finished = sender.clone();

    window
        .with_webview(move |webview| {
            let operation = webkit2gtk::PrintOperation::new(&webview.inner());

            let settings = gtk::PrintSettings::new();
            settings.set_printer("Print to File");
            settings.set("output-uri", Some(&uri));
            operation.set_print_settings(&settings);

            operation.connect_finished(move |_| {
                let _ = finished.send(Ok(()));
            });
            operation.connect_failed(move |_, error| {
                let _ = sender.send(Err(format!("Could not print: {error}")));
            });

            operation.print();
        })
        .map_err(|err| format!("Could not start printing: {err}"))?;

    receiver
        .recv_timeout(std::time::Duration::from_secs(180))
        .map_err(|_| String::from("PDF export timed out"))?
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
async fn export_pdf(_window: tauri::WebviewWindow, _path: String) -> Result<(), String> {
    Err(String::from(
        "Direct PDF export is not available on this system",
    ))
}

/// Detects UTF-8 / UTF-16 BOMs and returns the text as UTF-8.
fn decode(bytes: &[u8]) -> (String, bool) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(&bytes[3..]).into_owned(), true);
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return (decode_utf16(&bytes[2..], true), false);
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return (decode_utf16(&bytes[2..], false), false);
    }
    (String::from_utf8_lossy(bytes).into_owned(), false)
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| {
            if little_endian {
                u16::from_le_bytes([pair[0], pair[1]])
            } else {
                u16::from_be_bytes([pair[0], pair[1]])
            }
        })
        .collect();
    String::from_utf16_lossy(&units)
}

/* ------------------------------------------------------------------ */
/* System utilities                                                    */
/* ------------------------------------------------------------------ */

/// Size in bytes of a file (0 if it does not exist), to warn before opening.
#[tauri::command]
fn document_size(path: String) -> u64 {
    fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/* ------------------------------------------------------------------ */
/* Git                                                                 */
/* ------------------------------------------------------------------ */

#[derive(Debug, Serialize, PartialEq)]
struct GitBaseline {
    /// The file as committed in HEAD, normalized to LF.
    text: String,
    /// Current branch (or short commit when detached).
    branch: String,
}

/// Runs git inside `dir`; None if git is missing or the command fails.
fn git(dir: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let mut command = std::process::Command::new("git");
    command.current_dir(dir).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: no console flashing on every file opened.
        command.creation_flags(0x0800_0000);
    }
    let output = command.output().ok()?;
    output.status.success().then_some(output.stdout)
}

fn git_line(dir: &Path, args: &[&str]) -> Option<String> {
    let out = git(dir, args)?;
    let text = String::from_utf8_lossy(&out).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// The committed version of a file tracked by git, to show changed lines.
/// None when the file is not in a repository, is untracked or git is absent.
fn git_baseline_impl(path: &Path) -> Option<GitBaseline> {
    let dir = path.parent()?;
    let name = path.file_name()?.to_str()?;
    if git_line(dir, &["rev-parse", "--is-inside-work-tree"])? != "true" {
        return None;
    }
    git(dir, &["ls-files", "--error-unmatch", "--", name])?;
    let branch = git_line(dir, &["symbolic-ref", "--short", "-q", "HEAD"])
        .or_else(|| git_line(dir, &["rev-parse", "--short", "HEAD"]))?;
    // Staged but never committed: everything is new.
    let committed = git(dir, &["show", &format!("HEAD:./{name}")]).unwrap_or_default();
    let (text, _) = decode(&committed);
    Some(GitBaseline {
        text: text.replace("\r\n", "\n"),
        branch,
    })
}

#[tauri::command]
async fn git_baseline(path: String) -> Option<GitBaseline> {
    git_baseline_impl(Path::new(&path))
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| format!("Could not open the link: {err}"))
}

#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|err| format!("Could not open the file: {err}"))
}

/* ------------------------------------------------------------------ */
/* Recent files                                                        */
/* ------------------------------------------------------------------ */

fn recents_file(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("recents.json"))
}

fn read_recents(app: &AppHandle) -> Vec<String> {
    let Some(file) = recents_file(app) else {
        return Vec::new();
    };
    let Ok(data) = fs::read_to_string(file) else {
        return Vec::new();
    };
    serde_json::from_str(&data).unwrap_or_default()
}

fn write_recents(app: &AppHandle, list: &[String]) {
    let Some(file) = recents_file(app) else {
        return;
    };
    if let Ok(data) = serde_json::to_vec_pretty(list) {
        let _ = fs::write(file, data);
    }
}

#[tauri::command]
fn get_recents(app: AppHandle) -> Vec<String> {
    read_recents(&app)
}

#[tauri::command]
fn push_recent(app: AppHandle, path: String) -> Vec<String> {
    let mut list = read_recents(&app);
    list.retain(|item| item != &path);
    list.insert(0, path);
    list.truncate(RECENT_LIMIT);
    write_recents(&app, &list);
    list
}

#[tauri::command]
fn clear_recents(app: AppHandle) -> Vec<String> {
    write_recents(&app, &[]);
    Vec::new()
}

/* ------------------------------------------------------------------ */
/* Startup                                                             */
/* ------------------------------------------------------------------ */

#[tauri::command]
fn take_pending_open(state: tauri::State<'_, PendingOpen>) -> Vec<String> {
    match state.0.lock() {
        Ok(mut pending) => std::mem::take(&mut *pending),
        Err(_) => Vec::new(),
    }
}

/// Takes the command-line arguments and keeps the actual files.
fn files_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1) // the first one is the executable path
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| percent_decode(arg.strip_prefix("file://").unwrap_or(&arg)))
        .filter(|path| !path.is_empty() && Path::new(path).is_file())
        .collect()
}

/// Decodes %20, %C3%B1, etc. (useful when the OS passes a file:// URL).
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                .ok()
                .and_then(|digits| u8::from_str_radix(digits, 16).ok());
            if let Some(byte) = hex {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

/// Queues files the system asks us to open and tells the UI to pick them up.
///
/// The frontend consumes them with `take_pending_open` (startup) or on the
/// `md-view://open` event (already running), so the same path works whether the
/// app was just launched or is in the background.
fn queue_open_files(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<PendingOpen>() {
        if let Ok(mut slot) = state.0.lock() {
            slot.extend(files);
        }
    }
    let _ = app.emit("md-view://open", ());
}

/// Turns `file://` URLs into existing paths.
///
/// macOS (and iOS) deliver documents opened from the Finder as URLs instead of
/// command-line arguments, so this is the equivalent of `files_from_args`.
#[cfg_attr(
    not(any(target_os = "macos", target_os = "ios", target_os = "android")),
    allow(dead_code)
)]
fn files_from_urls<I: IntoIterator<Item = tauri::Url>>(urls: I) -> Vec<String> {
    urls.into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty() && Path::new(path).is_file())
        .collect()
}

fn background_file(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("background"))
}

fn apply_background(window: &tauri::WebviewWindow, [red, green, blue]: [u8; 3]) {
    let _ = window.set_background_color(Some(tauri::window::Color(red, green, blue, 255)));
}

/// Last theme background, so the window opens in its color before the page loads.
fn saved_background(app: &AppHandle) -> Option<[u8; 3]> {
    let data = fs::read_to_string(background_file(app)?).ok()?;
    let mut parts = data.split(',').map(|part| part.trim().parse::<u8>().ok());
    Some([parts.next()??, parts.next()??, parts.next()??])
}

/// Paints the native window and webview with the theme background, so the
/// area uncovered while growing the window is not black until WebKit repaints.
#[tauri::command]
fn set_window_background(
    app: AppHandle,
    window: tauri::WebviewWindow,
    red: u8,
    green: u8,
    blue: u8,
) {
    apply_background(&window, [red, green, blue]);
    if saved_background(&app) != Some([red, green, blue]) {
        if let Some(file) = background_file(&app) {
            let _ = fs::write(file, format!("{red},{green},{blue}"));
        }
    }
}

/// WebKitGTK's DMA-BUF renderer hands frames to the compositor late during a
/// resize: growing the window shows a black band and shrinking it clips the
/// content until the page catches up (Wayland, hybrid GPUs). The older path
/// keeps GPU rendering and follows the window like a native app. Runs before
/// GTK starts; a value set by the user wins.
#[cfg(target_os = "linux")]
fn prefer_synchronous_resize() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

/// Touchpad pinch forwarded to the frontend. `scale` is relative to the start
/// of the gesture; `x`/`y` are CSS pixels inside the webview.
#[cfg(target_os = "linux")]
#[derive(Clone, Serialize)]
struct PinchEvent {
    phase: &'static str,
    scale: f64,
    x: f64,
    y: f64,
}

/// Share of the monitor's work area the window may take when it does not fit.
const FIT_RATIO: f64 = 0.92;

/// The window has no frame, so if the configured size is larger than the
/// screen (small laptops, fractional scaling) the window buttons end up off
/// screen with no title bar to drag it back. Shrink it to the work area.
fn fit_to_monitor(window: &tauri::WebviewWindow) {
    let (Ok(Some(monitor)), Ok(size)) = (window.current_monitor(), window.outer_size()) else {
        return;
    };
    let area = monitor.work_area().size;
    if size.width <= area.width && size.height <= area.height {
        return;
    }
    let width = size.width.min((f64::from(area.width) * FIT_RATIO) as u32);
    let height = size.height.min((f64::from(area.height) * FIT_RATIO) as u32);
    let _ = window.set_size(tauri::PhysicalSize::new(width, height));
    let _ = window.center();
}

pub fn run() {
    #[cfg(target_os = "linux")]
    prefer_synchronous_resize();

    let pending = PendingOpen(Mutex::new(files_from_args(std::env::args())));

    let app = tauri::Builder::default()
        // Must be registered first: if the app is already open, it hands it the file.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            queue_open_files(app, files_from_args(argv));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(pending)
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Some(color) = saved_background(app.handle()) {
                    apply_background(&window, color);
                }
                fit_to_monitor(&window);
                // Created hidden (tauri.conf.json) so the first frame already has the theme color.
                let _ = window.show();
            }

            // WebKitGTK's "smooth scrolling" adds momentum that keeps coasting
            // after the wheel stops: we leave it off (default) so scrolling
            // responds crisply, like in the browser.
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                let target = window.clone();
                let _ = window.with_webview(move |webview| {
                    use gtk::prelude::*;
                    use webkit2gtk::{SettingsExt, WebViewExt};

                    let view = webview.inner();
                    if let Some(settings) = WebViewExt::settings(&view) {
                        settings.set_enable_smooth_scrolling(false);
                    }

                    // A touchpad pinch would scale the whole page and leave
                    // the app overflowing its window. We swallow it and hand
                    // it to the frontend, which zooms only the preview.
                    view.connect_event(move |_, event| {
                        let Some(pinch) = event.downcast_ref::<gtk::gdk::EventTouchpadPinch>()
                        else {
                            return gtk::glib::Propagation::Proceed;
                        };
                        // gdk-rs only exposes the phase as a bool: read the C field.
                        let raw: &gtk::gdk::ffi::GdkEventTouchpadPinch = pinch.as_ref();
                        let phase = match i32::from(raw.phase) {
                            gtk::gdk::ffi::GDK_TOUCHPAD_GESTURE_PHASE_BEGIN => "begin",
                            gtk::gdk::ffi::GDK_TOUCHPAD_GESTURE_PHASE_UPDATE => "update",
                            _ => "end",
                        };
                        let (x, y) = pinch.position();
                        let _ = target.emit(
                            "touchpad-pinch",
                            PinchEvent {
                                phase,
                                scale: pinch.scale(),
                                x,
                                y,
                            },
                        );
                        gtk::glib::Propagation::Stop
                    });
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_document,
            document_size,
            read_tree,
            write_document,
            write_text_file,
            write_base64_file,
            read_file_base64,
            export_pdf,
            path_exists,
            git_baseline,
            set_window_background,
            open_external,
            open_path,
            take_pending_open,
            get_recents,
            push_recent,
            clear_recents
        ])
        .build(tauri::generate_context!())
        .expect("failed to start md-view");

    app.run(|app_handle, event| {
        // macOS delivers documents opened from the Finder as an Apple Event, so
        // they arrive here (Linux and Windows use argv instead, handled above).
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { urls } = event {
            queue_open_files(app_handle, files_from_urls(urls));
        }

        #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
        let _ = (app_handle, event);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("md-view-test-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("temp folder");
        dir
    }

    #[test]
    fn git_baseline_reads_head_and_skips_untracked() {
        let dir = temp_dir().join("git-baseline");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("repo folder");
        let tracked = dir.join("notes.md");
        let untracked = dir.join("draft.md");
        fs::write(&tracked, "one\r\ntwo\r\n").expect("write tracked");
        fs::write(&untracked, "draft").expect("write untracked");
        assert_eq!(git_baseline_impl(&tracked), None, "not a repository yet");

        let setup: &[&[&str]] = &[
            &["init", "-q", "-b", "main"],
            &["add", "notes.md"],
            &[
                "-c",
                "user.name=t",
                "-c",
                "user.email=t@t",
                "commit",
                "-q",
                "-m",
                "init",
            ],
        ];
        for args in setup {
            if git(&dir, args).is_none() {
                return; // git is not installed: nothing to test.
            }
        }
        fs::write(&tracked, "one\nchanged\n").expect("edit tracked");

        assert_eq!(
            git_baseline_impl(&tracked),
            Some(GitBaseline {
                text: String::from("one\ntwo\n"),
                branch: String::from("main")
            })
        );
        assert_eq!(git_baseline_impl(&untracked), None);
    }

    #[test]
    fn percent_decode_resolves_escapes_and_keeps_invalid() {
        assert_eq!(percent_decode("hello%20world.md"), "hello world.md");
        assert_eq!(percent_decode("na%C3%AFve.md"), "naïve.md");
        assert_eq!(percent_decode("100%.md"), "100%.md");
        assert_eq!(percent_decode("%ZZ.md"), "%ZZ.md");
    }

    #[test]
    fn decode_detects_bom_and_utf16() {
        let (text, bom) = decode(&[0xEF, 0xBB, 0xBF, b'h', b'e', b'l', b'l', b'o']);
        assert_eq!((text.as_str(), bom), ("hello", true));

        // "é" in UTF-16 little endian, with BOM.
        let utf16 = [0xFF, 0xFE, 0xE9, 0x00];
        let (text, bom) = decode(&utf16);
        assert_eq!((text.as_str(), bom), ("é", false));

        let (text, bom) = decode(b"plain");
        assert_eq!((text.as_str(), bom), ("plain", false));
    }

    #[test]
    fn files_from_args_ignores_flags_and_missing_files() {
        let dir = temp_dir();
        let real = dir.join("document.md");
        fs::write(&real, "# hello").expect("write file");

        let args = vec![
            String::from("/usr/bin/md-view"),
            String::from("--verbose"),
            real.to_string_lossy().into_owned(),
            dir.join("missing.md").to_string_lossy().into_owned(),
        ];

        assert_eq!(
            files_from_args(args),
            vec![real.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn files_from_args_understands_file_urls() {
        let dir = temp_dir();
        let path = dir.join("with space.md");
        fs::write(&path, "content").expect("write file");

        let url = format!("file://{}", path.to_string_lossy().replace(' ', "%20"));
        assert_eq!(
            files_from_args(vec![String::from("md-view"), url]),
            vec![path.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn write_document_keeps_crlf_bom_and_creates_folders() {
        let dir = temp_dir().join("nested").join("sub");
        let target = dir.join("output.md");
        let path = target.to_string_lossy().into_owned();

        write_document_impl(
            path.clone(),
            String::from("one\ntwo\n"),
            Some(String::from("\r\n")),
            Some(true),
        )
        .expect("save");

        let bytes = fs::read(&target).expect("read");
        assert!(bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert_eq!(&bytes[3..], b"one\r\ntwo\r\n");

        // And on reopening it is normalized to LF, keeping the original value.
        let document = read_document_impl(path).expect("open");
        assert_eq!(document.content, "one\ntwo\n");
        assert_eq!(document.eol, "\r\n");
        assert!(document.bom);
        assert_eq!(document.name, "output.md");
    }

    #[test]
    fn looks_like_text_uses_extension_and_content() {
        let dir = temp_dir();

        // Known extension: no need to read.
        let md = dir.join("doc.md");
        fs::write(&md, "# hello").expect("write");
        assert!(looks_like_text(&md, 6));

        // Known binary.
        let png = dir.join("photo.png");
        fs::write(&png, "content").expect("write");
        assert!(!looks_like_text(&png, 9));

        // Unknown: the content is inspected (no NUL and valid UTF-8).
        let odd = dir.join("notes.weird");
        fs::write(&odd, "hello\nworld").expect("write");
        assert!(looks_like_text(&odd, 10));

        let binary = dir.join("data.weird");
        fs::write(&binary, [0x00, 0x01, 0x02]).expect("write");
        assert!(!looks_like_text(&binary, 3));

        // No extension, but a known name.
        let makefile = dir.join("Makefile");
        fs::write(&makefile, "all:").expect("write");
        assert!(looks_like_text(&makefile, 4));
    }

    #[test]
    fn read_tree_sorts_and_skips_heavy_folders() {
        let dir = temp_dir().join("tree");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("node_modules")).expect("folder");
        fs::write(dir.join("node_modules/x.js"), "x").expect("write");
        fs::create_dir_all(dir.join("docs")).expect("folder");
        fs::write(dir.join("docs/guide.md"), "# guide").expect("write");
        fs::write(dir.join("z.txt"), "text").expect("write");
        fs::write(dir.join("image.png"), [0x89, 0x50]).expect("write");

        let tree = build_folder_tree(dir.to_string_lossy().into_owned()).expect("tree");
        let children = tree.root.children.expect("children");

        let names: Vec<&str> = children.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["docs", "image.png", "z.txt"]);
        assert!(!children.iter().any(|entry| entry.name == "node_modules"));

        let docs = children
            .iter()
            .find(|entry| entry.name == "docs")
            .expect("docs");
        assert_eq!(docs.kind, "dir");
        assert_eq!(docs.children.as_ref().map(Vec::len), Some(1));
        assert!(docs.children.as_ref().unwrap()[0].is_text);

        let png = children
            .iter()
            .find(|entry| entry.name == "image.png")
            .expect("png");
        assert!(!png.is_text);
    }

    #[test]
    fn tree_serializes_in_camel_case() {
        let dir = temp_dir().join("camel");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("folder");
        fs::write(dir.join("note.md"), "# note").expect("write");

        let tree = build_folder_tree(dir.to_string_lossy().into_owned()).expect("tree");
        let json = serde_json::to_value(&tree).expect("json");
        let children = json["root"]["children"].as_array().expect("children");

        // The frontend reads `isText`; with `is_text` all files were left
        // disabled in the explorer.
        assert!(children[0].get("isText").is_some());
        assert!(children[0].get("is_text").is_none());
        assert_eq!(children[0]["isText"], serde_json::json!(true));
        assert!(json["root"]["children"].is_array());
        assert!(json.get("truncated").is_some());
    }

    #[test]
    fn files_from_urls_keeps_existing_files() {
        let dir = temp_dir();
        let file = dir.join("with space.md");
        fs::write(&file, "# hello").expect("write file");
        let encoded = file.to_string_lossy().replace(' ', "%20");

        let found = files_from_urls([
            tauri::Url::parse(&format!("file://{encoded}")).expect("url"),
            tauri::Url::parse("file:///no/such/file.md").expect("url"),
            tauri::Url::parse("https://example.com/readme.md").expect("url"),
        ]);

        assert_eq!(found, vec![file.to_string_lossy().into_owned()]);
    }

    #[test]
    fn read_document_fails_with_missing_path() {
        assert!(read_document_impl(String::from("/no/such/file.md")).is_err());
    }

    #[test]
    fn write_atomically_leaves_no_temp_files() {
        let dir = temp_dir().join("atomic");
        let target = dir.join("doc.md");
        write_atomically(&target, b"hello").expect("write");
        write_atomically(&target, b"bye").expect("rewrite");

        assert_eq!(fs::read(&target).expect("read"), b"bye");
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .expect("list")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "leftover temp files: {leftovers:?}");
    }
}
