//! Backend de md-view.
//!
//! El frontend (React) se encarga del render; aca solo vive lo que necesita
//! acceso al sistema: leer y escribir archivos, recordar los recientes,
//! abrir enlaces con el navegador y recibir archivos desde la linea de comandos.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

/// Cuantos archivos recordamos en la lista de recientes.
const RECENT_LIMIT: usize = 12;
/// Limites del arbol de carpetas, para no congelar la app con repos enormes.
const TREE_MAX_ENTRIES: usize = 20_000;
const TREE_MAX_DEPTH: u32 = 16;

/// Carpetas que no aportan y suelen ser gigantes.
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

/// Extensiones que consideramos texto sin mirar el contenido.
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

/// Extensiones claramente binarias (no hace falta leerlas).
const BINARY_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "icns", "tif", "tiff", "psd", "xcf",
    "pdf", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "zst", "lz4", "mp3", "m4a", "ogg",
    "oga", "opus", "wav", "flac", "aac", "wma", "mp4", "m4v", "webm", "mov", "avi", "mkv", "wmv",
    "flv", "woff", "woff2", "ttf", "otf", "eot", "wasm", "so", "dll", "dylib", "exe", "msi", "bin",
    "class", "jar", "war", "pyc", "pyo", "o", "a", "lib", "obj", "sqlite", "sqlite3", "db", "mdb",
    "dmg", "iso", "img", "deb", "rpm", "apk", "ipa", "blend", "fbx", "glb", "gltf", "stl", "heic",
    "heif", "raw", "cr2", "nef", "arw",
];

/// Nombres sin extension que igual son texto.
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
    /// "dir" o "file".
    kind: &'static str,
    /// Solo tiene sentido para archivos: se puede abrir con el editor.
    is_text: bool,
    size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeEntry>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderTree {
    root: TreeEntry,
    /// true si se corto por cantidad de archivos o profundidad.
    truncated: bool,
}

fn extension_of(path: &Path) -> String {
    path.extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// Decide si un archivo se puede leer como texto, mirando la extension y, si
/// no alcanza, los primeros bytes (sin NUL y UTF-8 valido).
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
        return false; // demasiado grande para el editor
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
        // Los enlaces simbolicos se ignoran para no entrar en ciclos.
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

/// Recorre una carpeta y devuelve el arbol completo (asincronico: no bloquea la UI).
#[tauri::command]
async fn read_tree(path: String) -> Result<FolderTree, String> {
    build_folder_tree(path)
}

/// Archivos pedidos por linea de comandos que el frontend todavia no consumio.
#[derive(Default)]
struct PendingOpen(Mutex<Vec<String>>);

#[derive(Debug, Serialize)]
struct Document {
    /// Ruta absoluta del archivo.
    path: String,
    /// Nombre del archivo, sin carpetas.
    name: String,
    /// Contenido normalizado a LF (el editor trabaja siempre con LF).
    content: String,
    /// Fin de linea original: "\n" o "\r\n".
    eol: String,
    /// Si el archivo empezaba con BOM UTF-8.
    bom: bool,
}

/* ------------------------------------------------------------------ */
/* Lectura y escritura                                                 */
/* ------------------------------------------------------------------ */

// Los comandos de archivos grandes son asincronicos: leer, serializar y
// devolver varios megabytes por IPC no debe congelar la interfaz.
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

/// Lectura de disco (bloqueante); el comando la corre fuera del hilo principal.
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

/// Escribe en un temporal y renombra: si algo falla, el archivo original queda intacto.
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
        .unwrap_or_else(|| String::from("documento.md"));
    let temp = dir.join(format!(".{name}.md-view.tmp"));

    fs::write(&temp, bytes).map_err(|err| format!("Could not write {}: {err}", temp.display()))?;

    // Conservamos permisos del archivo original cuando ya existia.
    if let Ok(metadata) = fs::metadata(target) {
        let _ = fs::set_permissions(&temp, metadata.permissions());
    }

    fs::rename(&temp, target).map_err(|err| {
        let _ = fs::remove_file(&temp);
        format!("Could not save {}: {err}", target.display())
    })
}

/* ------------------------------------------------------------------ */
/* Exportacion                                                         */
/* ------------------------------------------------------------------ */

/// Escribe un archivo de texto cualquiera (HTML, SVG, TXT...).
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    write_atomically(Path::new(&path), content.as_bytes())
}

/// Escribe un archivo binario que llega como base64 (PNG, JPG, WebP...).
#[tauri::command]
fn write_base64_file(path: String, data: String) -> Result<(), String> {
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|err| format!("Invalid binary data: {err}"))?;
    write_atomically(Path::new(&path), &bytes)
}

/// Lee un archivo y lo devuelve en base64 (para incrustar imagenes al exportar).
fn read_file_base64_impl(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|err| format!("Could not read {path}: {err}"))?;
    Ok(BASE64.encode(bytes))
}

/// Exporta la pagina actual a PDF con el motor de impresion de WebKitGTK.
///
/// Usa el backend "Print to File" de GTK y espera a que la operacion termine
/// para avisar al frontend. En otros sistemas se usa el dialogo de impresion.
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

/// Detecta BOM UTF-8 / UTF-16 y devuelve el texto como UTF-8.
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
/* Utilidades del sistema                                              */
/* ------------------------------------------------------------------ */

/// Tamaño en bytes de un archivo (0 si no existe), para avisar antes de abrir.
#[tauri::command]
fn document_size(path: String) -> u64 {
    fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
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
/* Archivos recientes                                                  */
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
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

#[tauri::command]
fn take_pending_open(state: tauri::State<'_, PendingOpen>) -> Vec<String> {
    match state.0.lock() {
        Ok(mut pending) => std::mem::take(&mut *pending),
        Err(_) => Vec::new(),
    }
}

/// Toma los argumentos de la linea de comandos y se queda con los archivos reales.
fn files_from_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1) // el primero es la ruta del ejecutable
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| percent_decode(arg.strip_prefix("file://").unwrap_or(&arg)))
        .filter(|path| !path.is_empty() && Path::new(path).is_file())
        .collect()
}

/// Decodifica %20, %C3%B1, etc. (util cuando el SO pasa una URL file://).
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

pub fn run() {
    let pending = PendingOpen(Mutex::new(files_from_args(std::env::args())));

    tauri::Builder::default()
        // Debe registrarse primero: si la app ya esta abierta, le pasa el archivo.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = files_from_args(argv);
            if files.is_empty() {
                return;
            }
            if let Some(state) = app.try_state::<PendingOpen>() {
                if let Ok(mut slot) = state.0.lock() {
                    slot.extend(files);
                }
            }
            let _ = app.emit("md-view://open", ());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(pending)
        .setup(|app| {
            // El "smooth scrolling" de WebKitGTK agrega un impulso que sigue
            // frenandose despues de la rueda: lo dejamos apagado (default) para
            // que el scroll responda seco, como en el navegador.
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.with_webview(|webview| {
                    use webkit2gtk::{SettingsExt, WebViewExt};

                    if let Some(settings) = webview.inner().settings() {
                        settings.set_enable_smooth_scrolling(false);
                    }
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
            open_external,
            open_path,
            take_pending_open,
            get_recents,
            push_recent,
            clear_recents
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar md-view");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("md-view-test-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("carpeta temporal");
        dir
    }

    #[test]
    fn percent_decode_resuelve_escapes_y_deja_lo_invalido() {
        assert_eq!(percent_decode("hola%20mundo.md"), "hola mundo.md");
        assert_eq!(percent_decode("%C3%B1andu.md"), "ñandu.md");
        assert_eq!(percent_decode("100%.md"), "100%.md");
        assert_eq!(percent_decode("%ZZ.md"), "%ZZ.md");
    }

    #[test]
    fn decode_detecta_bom_y_utf16() {
        let (texto, bom) = decode(&[0xEF, 0xBB, 0xBF, b'h', b'o', b'l', b'a']);
        assert_eq!((texto.as_str(), bom), ("hola", true));

        // "ñ" en UTF-16 little endian, con BOM.
        let utf16 = [0xFF, 0xFE, 0xF1, 0x00];
        let (texto, bom) = decode(&utf16);
        assert_eq!((texto.as_str(), bom), ("ñ", false));

        let (texto, bom) = decode(b"sin bom");
        assert_eq!((texto.as_str(), bom), ("sin bom", false));
    }

    #[test]
    fn files_from_args_ignora_banderas_y_archivos_inexistentes() {
        let dir = temp_dir();
        let real = dir.join("documento.md");
        fs::write(&real, "# hola").expect("escribir archivo");

        let args = vec![
            String::from("/usr/bin/md-view"),
            String::from("--verbose"),
            real.to_string_lossy().into_owned(),
            dir.join("no-existe.md").to_string_lossy().into_owned(),
        ];

        assert_eq!(
            files_from_args(args),
            vec![real.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn files_from_args_entiende_urls_file() {
        let dir = temp_dir();
        let ruta = dir.join("con espacio.md");
        fs::write(&ruta, "contenido").expect("escribir archivo");

        let url = format!("file://{}", ruta.to_string_lossy().replace(' ', "%20"));
        assert_eq!(
            files_from_args(vec![String::from("md-view"), url]),
            vec![ruta.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn write_document_respeta_crlf_bom_y_crea_carpetas() {
        let dir = temp_dir().join("anidada").join("sub");
        let destino = dir.join("salida.md");
        let ruta = destino.to_string_lossy().into_owned();

        write_document_impl(
            ruta.clone(),
            String::from("uno\ndos\n"),
            Some(String::from("\r\n")),
            Some(true),
        )
        .expect("guardar");

        let bytes = fs::read(&destino).expect("leer");
        assert!(bytes.starts_with(&[0xEF, 0xBB, 0xBF]));
        assert_eq!(&bytes[3..], b"uno\r\ndos\r\n");

        // Y al reabrirlo se normaliza a LF, conservando el dato original.
        let documento = read_document_impl(ruta).expect("abrir");
        assert_eq!(documento.content, "uno\ndos\n");
        assert_eq!(documento.eol, "\r\n");
        assert!(documento.bom);
        assert_eq!(documento.name, "salida.md");
    }

    #[test]
    fn looks_like_text_usa_extension_y_contenido() {
        let dir = temp_dir();

        // Extension conocida: no hace falta leer.
        let md = dir.join("doc.md");
        fs::write(&md, "# hola").expect("escribir");
        assert!(looks_like_text(&md, 6));

        // Binaria conocida.
        let png = dir.join("foto.png");
        fs::write(&png, "contenido").expect("escribir");
        assert!(!looks_like_text(&png, 9));

        // Desconocida: se mira el contenido (sin NUL y UTF-8 valido).
        let rara = dir.join("notas.weird");
        fs::write(&rara, "hola\nmundo").expect("escribir");
        assert!(looks_like_text(&rara, 10));

        let binaria = dir.join("datos.weird");
        fs::write(&binaria, [0x00, 0x01, 0x02]).expect("escribir");
        assert!(!looks_like_text(&binaria, 3));

        // Sin extension pero con nombre conocido.
        let makefile = dir.join("Makefile");
        fs::write(&makefile, "all:").expect("escribir");
        assert!(looks_like_text(&makefile, 4));
    }

    #[test]
    fn read_tree_ordena_y_omite_carpetas_pesadas() {
        let dir = temp_dir().join("arbol");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("node_modules")).expect("carpeta");
        fs::write(dir.join("node_modules/x.js"), "x").expect("escribir");
        fs::create_dir_all(dir.join("docs")).expect("carpeta");
        fs::write(dir.join("docs/guia.md"), "# guia").expect("escribir");
        fs::write(dir.join("z.txt"), "texto").expect("escribir");
        fs::write(dir.join("imagen.png"), [0x89, 0x50]).expect("escribir");

        let tree = build_folder_tree(dir.to_string_lossy().into_owned()).expect("arbol");
        let children = tree.root.children.expect("hijos");

        let names: Vec<&str> = children.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["docs", "imagen.png", "z.txt"]);
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
            .find(|entry| entry.name == "imagen.png")
            .expect("png");
        assert!(!png.is_text);
    }

    #[test]
    fn el_arbol_se_serializa_en_camel_case() {
        let dir = temp_dir().join("camel");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("carpeta");
        fs::write(dir.join("nota.md"), "# nota").expect("escribir");

        let tree = build_folder_tree(dir.to_string_lossy().into_owned()).expect("arbol");
        let json = serde_json::to_value(&tree).expect("json");
        let children = json["root"]["children"].as_array().expect("hijos");

        // El frontend lee `isText`; con `is_text` todos los archivos quedaban
        // deshabilitados en el explorador.
        assert!(children[0].get("isText").is_some());
        assert!(children[0].get("is_text").is_none());
        assert_eq!(children[0]["isText"], serde_json::json!(true));
        assert!(json["root"]["children"].is_array());
        assert!(json.get("truncated").is_some());
    }

    #[test]
    fn read_document_falla_con_ruta_inexistente() {
        assert!(read_document_impl(String::from("/no/existe/archivo.md")).is_err());
    }

    #[test]
    fn write_atomically_no_deja_temporales() {
        let dir = temp_dir().join("atomico");
        let destino = dir.join("doc.md");
        write_atomically(&destino, b"hola").expect("escribir");
        write_atomically(&destino, b"chau").expect("reescribir");

        assert_eq!(fs::read(&destino).expect("leer"), b"chau");
        let sobrantes: Vec<_> = fs::read_dir(&dir)
            .expect("listar")
            .filter_map(Result::ok)
            .filter(|entrada| entrada.file_name().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(sobrantes.is_empty(), "quedaron temporales: {sobrantes:?}");
    }
}
