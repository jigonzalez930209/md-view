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

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'mdown', 'mkd', 'mkdn', 'mdwn'] },
  { name: 'Texto', extensions: ['txt'] },
  { name: 'Todos los archivos', extensions: ['*'] },
];

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
    const selected = await openFileDialog({ multiple: false, directory: false, filters: MD_FILTERS });
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
    if (!file) throw new Error('En el navegador solo se pueden reabrir los archivos elegidos en esta sesion.');
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
export async function pickSavePath(suggestedPath: string): Promise<string | null> {
  if (!isTauri) return suggestedPath;
  const selected = await saveFileDialog({ defaultPath: suggestedPath, filters: MD_FILTERS });
  return typeof selected === 'string' ? selected : null;
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
export async function confirmDiscard(fileName: string): Promise<boolean> {
  const message = `"${fileName}" tiene cambios sin guardar.`;
  if (!isTauri) return window.confirm(`${message}\n\nQueres descartarlos?`);
  return ask(message, { title: 'md-view', kind: 'warning', okLabel: 'Descartar', cancelLabel: 'Cancelar' });
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

export type { Theme };
