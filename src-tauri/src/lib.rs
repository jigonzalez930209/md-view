//! Backend de md-view.
//!
//! El frontend (React) se encarga del render; aca solo vive lo que necesita
//! acceso al sistema: leer y escribir archivos, recordar los recientes,
//! abrir enlaces con el navegador y recibir archivos desde la linea de comandos.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

/// Cuantos archivos recordamos en la lista de recientes.
const RECENT_LIMIT: usize = 12;

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

#[tauri::command]
fn read_document(path: String) -> Result<Document, String> {
    let file = PathBuf::from(&path);
    if !file.is_file() {
        return Err(format!("No se encontro el archivo: {path}"));
    }

    let bytes = fs::read(&file).map_err(|err| format!("No se pudo leer {path}: {err}"))?;
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

#[tauri::command]
fn write_document(
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
            .map_err(|err| format!("No se pudo crear la carpeta {}: {err}", dir.display()))?;
    }

    let name = target
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| String::from("documento.md"));
    let temp = dir.join(format!(".{name}.md-view.tmp"));

    fs::write(&temp, bytes).map_err(|err| format!("No se pudo escribir {}: {err}", temp.display()))?;

    // Conservamos permisos del archivo original cuando ya existia.
    if let Ok(metadata) = fs::metadata(target) {
        let _ = fs::set_permissions(&temp, metadata.permissions());
    }

    fs::rename(&temp, target).map_err(|err| {
        let _ = fs::remove_file(&temp);
        format!("No se pudo guardar {}: {err}", target.display())
    })
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

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| format!("No se pudo abrir el enlace: {err}"))
}

#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|err| format!("No se pudo abrir el archivo: {err}"))
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
        .invoke_handler(tauri::generate_handler![
            read_document,
            write_document,
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

        assert_eq!(files_from_args(args), vec![real.to_string_lossy().into_owned()]);
    }

    #[test]
    fn files_from_args_entiende_urls_file() {
        let dir = temp_dir();
        let ruta = dir.join("con espacio.md");
        fs::write(&ruta, "contenido").expect("escribir archivo");

        let url = format!("file://{}", ruta.to_string_lossy().replace(' ', "%20"));
        assert_eq!(files_from_args(vec![String::from("md-view"), url]), vec![ruta.to_string_lossy().into_owned()]);
    }

    #[test]
    fn write_document_respeta_crlf_bom_y_crea_carpetas() {
        let dir = temp_dir().join("anidada").join("sub");
        let destino = dir.join("salida.md");
        let ruta = destino.to_string_lossy().into_owned();

        write_document(
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
        let documento = read_document(ruta).expect("abrir");
        assert_eq!(documento.content, "uno\ndos\n");
        assert_eq!(documento.eol, "\r\n");
        assert!(documento.bom);
        assert_eq!(documento.name, "salida.md");
    }

    #[test]
    fn read_document_falla_con_ruta_inexistente() {
        assert!(read_document(String::from("/no/existe/archivo.md")).is_err());
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
