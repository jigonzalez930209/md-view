/**
 * Capa de acceso al sistema de archivos.
 *
 * Cuando la app corre dentro de Tauri usa los comandos de Rust (src-tauri) y los
 * plugins oficiales. Si el mismo frontend se abre en un navegador (util para
 * desarrollar o para probar el render) cae a APIs del navegador: elegir archivo
 * con <input>, descargar al guardar y recordar recientes en localStorage.
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { ask, open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { basename, extname, MARKDOWN_EXTENSIONS } from './paths';
import { t } from './i18n';
import type { Theme } from './theme';

export interface Doc {
  /** Ruta absoluta en Tauri; solo el nombre en el navegador. */
  path: string;
  name: string;
  content: string;
  /** Fin de linea original del archivo, para no reescribirlo entero. */
  eol: '\n' | '\r\n';
  /** true si el archivo tenia BOM UTF-8. */
  bom: boolean;
}

export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

/** Filtros del dialogo nativo (se resuelven en el idioma activo). */
function markdownFilters(): FileFilter[] {
  return [
    { name: t('filter.markdown'), extensions: MARKDOWN_EXTENSIONS },
    { name: t('filter.text'), extensions: ['txt', 'text'] },
    { name: t('filter.all'), extensions: ['*'] },
  ];
}

const RECENTS_KEY = 'md-view:recents';
const MAX_RECENTS = 12;

/* ------------------------------------------------------------------ */
/* Modo navegador                                                      */
/* ------------------------------------------------------------------ */

/** Archivos elegidos con <input type=file>, para poder reabrirlos desde recientes. */
const browserFiles = new Map<string, File>();

function browserPickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdx,.txt,text/markdown,text/plain';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    });
    // Si el usuario cancela no hay evento fiable: nos quedamos esperando.
    input.click();
  });
}

function browserReadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function browserWriteRecents(list: string[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {
    /* ignoramos cuotas o modo privado */
  }
}

function toDoc(path: string, name: string, content: string): Doc {
  const bom = content.charCodeAt(0) === 0xfeff;
  const body = bom ? content.slice(1) : content;
  return {
    path,
    name,
    content: body.replace(/\r\n?/g, '\n'),
    eol: /\r\n/.test(content) ? '\r\n' : '\n',
    bom,
  };
}

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  downloadBlob(name, blob);
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------------ */
/* API publica                                                         */
/* ------------------------------------------------------------------ */

/** Abre el dialogo del sistema y devuelve el documento elegido. */
export async function pickAndRead(): Promise<Doc | null> {
  if (isTauri) {
    const selected = await openFileDialog({
      multiple: false,
      directory: false,
      filters: markdownFilters(),
    });
    if (typeof selected !== 'string') return null;
    return readFile(selected);
  }

  const file = await browserPickFile();
  if (!file) return null;
  browserFiles.set(file.name, file);
  return toDoc(file.name, file.name, await file.text());
}

export async function readFile(path: string): Promise<Doc> {
  if (!isTauri) {
    const file = browserFiles.get(path);
    if (!file) throw new Error(t('app.browserReopenOnly'));
    return toDoc(path, path, await file.text());
  }
  return (await invoke('read_document', { path })) as Doc;
}

export async function saveFile(doc: Doc, content: string): Promise<void> {
  if (!isTauri) {
    download(doc.name, doc.eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content);
    return;
  }
  await invoke('write_document', { path: doc.path, content, eol: doc.eol, bom: doc.bom });
}

/** Pide una ruta nueva para "Guardar como". Devuelve null si se cancela. */
export async function pickSavePath(
  suggestedPath: string,
  filters: FileFilter[] = markdownFilters(),
): Promise<string | null> {
  if (!isTauri) return suggestedPath;
  const selected = await saveFileDialog({ defaultPath: suggestedPath, filters });
  return typeof selected === 'string' ? selected : null;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

/* ------------------------------------------------------------------ */
/* Arbol de carpetas                                                   */
/* ------------------------------------------------------------------ */

export interface TreeEntry {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  /** Solo para archivos: se puede abrir con el editor. */
  isText: boolean;
  size: number;
  children?: TreeEntry[];
}

export interface FolderTree {
  root: TreeEntry;
  /** true si el recorrido se corto por cantidad de archivos o profundidad. */
  truncated: boolean;
}

/** Clasificacion rapida para el fallback del navegador (no puede olfatear bytes). */
const BROWSER_TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'mdx', 'mdown', 'mkd', 'mkdn', 'mdwn', 'mdtxt', 'mdtext', 'mdoc', 'rmd',
  'qmd', 'txt', 'text', 'rst', 'adoc', 'org', 'tex', 'json', 'jsonc', 'json5', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'conf', 'env', 'csv', 'tsv', 'log', 'xml', 'html', 'htm', 'svg', 'css',
  'scss', 'less', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'astro', 'py', 'rb',
  'go', 'rs', 'java', 'kt', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'swift', 'lua', 'r', 'pl',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'graphql', 'proto', 'lock',
  'gitignore', 'gitattributes', 'editorconfig', 'nix', 'dart', 'diff', 'patch',
]);

const BROWSER_BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'icns', 'tiff', 'psd', 'pdf', 'zip',
  'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'tar', 'zst', 'mp3', 'm4a', 'ogg', 'opus', 'wav', 'flac',
  'aac', 'mp4', 'm4v', 'webm', 'mov', 'avi', 'mkv', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'wasm',
  'so', 'dll', 'dylib', 'exe', 'bin', 'class', 'jar', 'pyc', 'o', 'a', 'lib', 'sqlite', 'db',
  'dmg', 'iso', 'img', 'deb', 'rpm', 'apk', 'heic', 'heif', 'blend', 'glb', 'gltf', 'stl',
]);

function browserLooksLikeText(file: File): boolean {
  const extension = extname(file.name).replace(/^\./, '');
  if (BROWSER_TEXT_EXTENSIONS.has(extension)) return true;
  if (BROWSER_BINARY_EXTENSIONS.has(extension)) return false;
  if (file.type) {
    return (
      file.type.startsWith('text/') ||
      ['application/json', 'application/xml', 'application/javascript', 'application/x-sh'].includes(
        file.type,
      )
    );
  }
  return true;
}

function sortTree(entry: TreeEntry): void {
  if (!entry.children) return;
  entry.children.sort((a, b) => {
    const kindA = a.kind === 'dir' ? 0 : 1;
    const kindB = b.kind === 'dir' ? 0 : 1;
    return kindA - kindB || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  entry.children.forEach(sortTree);
}

function browserPickFolder(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    const finish = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      resolve(files);
    };
    // Algunos motores solo emiten `input`, otros `change`: escuchamos ambos.
    input.addEventListener('change', finish, { once: true });
    input.addEventListener('input', finish, { once: true });

    input.click();
  });
}

function browserTreeFromFiles(files: File[]): FolderTree | null {
  if (files.length === 0) return null;

  const rootName = files[0].webkitRelativePath.split('/')[0] || 'carpeta';
  const root: TreeEntry = {
    name: rootName,
    path: rootName,
    kind: 'dir',
    isText: true,
    size: 0,
    children: [],
  };
  const directories = new Map<string, TreeEntry>([[rootName, root]]);

  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    const parts = relative.split('/');
    browserFiles.set(relative, file);

    let parent = root;
    for (let index = 1; index < parts.length - 1; index += 1) {
      const key = parts.slice(0, index + 1).join('/');
      let directory = directories.get(key);
      if (!directory) {
        directory = { name: parts[index], path: key, kind: 'dir', isText: true, size: 0, children: [] };
        directories.set(key, directory);
        parent.children?.push(directory);
      }
      parent = directory;
    }

    parent.children?.push({
      name: file.name,
      path: relative,
      kind: 'file',
      isText: browserLooksLikeText(file),
      size: file.size,
    });
  }

  sortTree(root);
  return { root, truncated: false };
}

/** Abre el dialogo de carpetas y devuelve el arbol completo. */
export async function pickFolder(): Promise<FolderTree | null> {
  if (isTauri) {
    const selected = await openFileDialog({ directory: true, multiple: false });
    if (typeof selected !== 'string') return null;
    return readTree(selected);
  }
  return browserTreeFromFiles(await browserPickFolder());
}

/** Vuelve a leer una carpeta ya abierta. */
export async function readTree(path: string): Promise<FolderTree> {
  if (!isTauri) throw new Error(t('app.browserFolderOnly'));
  return (await invoke('read_tree', { path })) as FolderTree;
}

/* ------------------------------------------------------------------ */
/* Exportacion                                                         */
/* ------------------------------------------------------------------ */

/** Escribe un archivo de texto (HTML autocontenido, SVG, TXT...). */
export async function writeTextFile(path: string, content: string): Promise<void> {
  if (!isTauri) {
    download(basename(path), content);
    return;
  }
  await invoke('write_text_file', { path, content });
}

/** Escribe un archivo binario que viene en base64 (PNG, JPG, WebP...). */
export async function writeBase64File(path: string, data: string): Promise<void> {
  if (!isTauri) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    downloadBlob(basename(path), new Blob([bytes]));
    return;
  }
  await invoke('write_base64_file', { path, data });
}

/** Lee un archivo arbitrario y lo devuelve en base64 (imagenes al exportar). */
export async function readFileBase64(path: string): Promise<string> {
  return (await invoke('read_file_base64', { path })) as string;
}

/** Genera un PDF de la pagina actual. En el navegador abre el dialogo de impresion. */
export async function exportPdf(path: string): Promise<void> {
  if (!isTauri) {
    window.print();
    return;
  }
  await invoke('export_pdf', { path });
}

export async function recentFiles(): Promise<string[]> {
  if (!isTauri) return browserReadRecents();
  return (await invoke('get_recents')) as string[];
}

export async function addRecent(path: string): Promise<string[]> {
  if (!isTauri) {
    const next = [path, ...browserReadRecents().filter((p) => p !== path)].slice(0, MAX_RECENTS);
    browserWriteRecents(next);
    return next;
  }
  return (await invoke('push_recent', { path })) as string[];
}

export async function clearRecents(): Promise<string[]> {
  if (!isTauri) {
    browserWriteRecents([]);
    return [];
  }
  await invoke('clear_recents');
  return [];
}

/** Tamaño en bytes del archivo (0 si no se puede saber). */
export async function documentSize(path: string): Promise<number> {
  if (!isTauri) return browserFiles.get(path)?.size ?? 0;
  return (await invoke('document_size', { path })) as number;
}

/** true si la ruta existe en disco. En el navegador solo podemos mirar la cache local. */
export async function pathExists(path: string): Promise<boolean> {
  if (!isTauri) return browserFiles.has(path);
  return (await invoke('path_exists', { path })) as boolean;
}

export async function openExternal(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await invoke('open_external', { url });
}

/** Abre una ruta local con la aplicacion predeterminada del sistema. */
export async function openPath(path: string): Promise<void> {
  if (!isTauri) return;
  await invoke('open_path', { path });
}

/** Convierte una ruta absoluta en una URL que el webview puede mostrar. */
export function toAssetUrl(absolutePath: string): string {
  if (!isTauri) return absolutePath;
  try {
    return convertFileSrc(absolutePath);
  } catch {
    return absolutePath;
  }
}

export async function setWindowTitle(title: string): Promise<void> {
  if (!isTauri) {
    document.title = title;
    return;
  }
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    /* sin permiso: no es critico */
  }
}

/** Pregunta al usuario antes de perder cambios. */
export async function confirmDiscard(message: string): Promise<boolean> {
  if (!isTauri) return window.confirm(`${message}\n\n${t('app.discardQuestion')}`);
  return ask(message, {
    title: 'md-view',
    kind: 'warning',
    okLabel: t('common.discard'),
    cancelLabel: t('common.cancel'),
  });
}

/** Mensaje estandar para documentos con cambios sin guardar. */
export function dirtyMessage(names: string[]): string {
  if (names.length === 1) return t('app.dirtyOne', { name: names[0] });
  return t('app.dirtyMany', { count: names.length });
}

/** Rutas recibidas por linea de comandos (o al reusar la ventana ya abierta). */
export async function takePendingOpen(): Promise<string[]> {
  if (!isTauri) return [];
  return (await invoke('take_pending_open')) as string[];
}

/** Avisa cuando otra instancia pide abrir un archivo (single instance). */
export async function onExternalOpen(callback: () => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen('md-view://open', () => callback());
}

/** Arrastrar y soltar archivos sobre la ventana. */
export async function onDragDrop(
  callback: (state: 'enter' | 'over' | 'leave' | 'drop', paths: string[]) => void,
): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === 'over') callback('over', []);
    else if (payload.type === 'enter') callback('enter', payload.paths);
    else if (payload.type === 'leave') callback('leave', []);
    else callback('drop', payload.paths);
  });
}

/** Cerrar la ventana: en Tauri interceptamos el cierre para poder avisar. */
export async function onCloseRequested(callback: () => boolean): Promise<UnlistenFn> {
  if (!isTauri) {
    const handler = (event: BeforeUnloadEvent) => {
      if (callback()) event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }
  const win = getCurrentWindow();
  return win.onCloseRequested(async (event) => {
    if (callback()) {
      event.preventDefault();
      return;
    }
    await win.destroy();
  });
}

export async function destroyWindow(): Promise<void> {
  if (!isTauri) return;
  await getCurrentWindow().destroy();
}

/* ------------------------------------------------------------------ */
/* Ventana sin decoraciones: la barra de titulo la dibuja la app       */
/* ------------------------------------------------------------------ */

export async function isWindowMaximized(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await getCurrentWindow().isMaximized();
  } catch {
    return false;
  }
}

export async function minimizeWindow(): Promise<void> {
  if (!isTauri) return;
  try {
    await getCurrentWindow().minimize();
  } catch {
    /* sin permiso: no es critico */
  }
}

/** Alterna maximizado/restaurado y devuelve el estado resultante. */
export async function toggleMaximizeWindow(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const win = getCurrentWindow();
    await win.toggleMaximize();
    return await win.isMaximized();
  } catch {
    return false;
  }
}

/** Cerrar la ventana pasando por el aviso de cambios sin guardar. */
export async function closeWindow(): Promise<void> {
  if (!isTauri) {
    window.close();
    return;
  }
  await getCurrentWindow().close();
}

/** Arrastrar la ventana desde la barra de titulo propia. */
export async function startWindowDrag(): Promise<void> {
  if (!isTauri) return;
  try {
    await getCurrentWindow().startDragging();
  } catch {
    /* Wayland a veces rechaza el pedido; no es critico */
  }
}

export type WindowResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

/** Redimensionar desde los bordes, ya que la ventana no tiene marco nativo. */
export async function startWindowResize(direction: WindowResizeDirection): Promise<void> {
  if (!isTauri) return;
  try {
    await getCurrentWindow().startResizeDragging(direction);
  } catch {
    /* sin permiso: no es critico */
  }
}

export async function onWindowResized(callback: () => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  try {
    return await getCurrentWindow().onResized(callback);
  } catch {
    return () => {};
  }
}

export type { Theme };
