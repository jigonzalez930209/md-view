/**
 * Filesystem access layer.
 *
 * When the app runs inside Tauri it uses the Rust commands (src-tauri) and the
 * official plugins. If the same frontend is opened in a browser (useful for
 * developing or testing the render) it falls back to browser APIs: pick a file
 * with <input>, download on save and remember recents in localStorage.
 */

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { open as openFileDialog, save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { basename, extname, MARKDOWN_EXTENSIONS } from './paths';
import { MAX_DOCUMENT_BYTES } from './limits';
import { t, type TranslationKey } from './i18n';
import type { Theme } from './theme';

export type DocEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

/** Modification stamp of a file on disk: it changes when anybody else writes it. */
export interface FileStamp {
  mtimeMs: number;
  size: number;
}

export interface Doc {
  /** Absolute path in Tauri; just the name in the browser. */
  path: string;
  name: string;
  content: string;
  /** Original line ending of the file, so it is not rewritten whole. */
  eol: '\n' | '\r\n';
  /** true if the file had a BOM (UTF-16 files always have one). */
  bom: boolean;
  /** Encoding the file was read with, preserved when saving. */
  encoding: DocEncoding;
  /** Stamp taken when it was read (zero in the browser). */
  mtimeMs: number;
  size: number;
}

export const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

/** Native dialog filters (resolved in the active language). */
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
/* Browser mode                                                        */
/* ------------------------------------------------------------------ */

/** Files picked with <input type=file>, so they can be reopened from recents. */
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
    // If the user cancels there is no reliable event: we keep waiting.
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
    /* ignore quotas or private mode */
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
    // The browser decodes picked files as UTF-8; it cannot tell us the real encoding.
    encoding: 'utf-8',
    // Stamps are only meaningful in Tauri; here saving always downloads a copy.
    mtimeMs: 0,
    size: content.length,
  };
}

/** Encodes the text the way the file was read: BOM and UTF-16 included. */
function encodeDocument(doc: Doc, content: string): BlobPart {
  const text = doc.eol === '\r\n' ? content.replace(/\n/g, '\r\n') : content;
  if (doc.encoding === 'utf-8') return doc.bom ? `\uFEFF${text}` : text;

  const littleEndian = doc.encoding === 'utf-16le';
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = littleEndian ? 0xff : 0xfe;
  bytes[1] = littleEndian ? 0xfe : 0xff;
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    const offset = 2 + index * 2;
    bytes[offset] = littleEndian ? unit & 0xff : unit >> 8;
    bytes[offset + 1] = littleEndian ? unit >> 8 : unit & 0xff;
  }
  return bytes;
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
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Opens the system dialog and returns the chosen document. */
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
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new Error(
        t('app.fileTooLarge', {
          mb: Math.round(file.size / 1_000_000),
          limit: Math.round(MAX_DOCUMENT_BYTES / 1_000_000),
        }),
      );
    }
    return toDoc(path, path, await file.text());
  }
  return (await invoke('read_document', { path })) as Doc;
}

export async function saveFile(doc: Doc, content: string): Promise<FileStamp> {
  if (!isTauri) {
    const type = doc.encoding === 'utf-8' ? 'text/markdown;charset=utf-8' : 'text/markdown';
    downloadBlob(doc.name, new Blob([encodeDocument(doc, content)], { type }));
    return { mtimeMs: 0, size: content.length };
  }
  return (await invoke('write_document', {
    path: doc.path,
    content,
    eol: doc.eol,
    bom: doc.bom,
    encoding: doc.encoding,
  })) as FileStamp;
}

/** Lets the asset protocol serve this path (previews load images through it). */
export async function allowAsset(path: string, recursive: boolean): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke('allow_asset', { path, recursive });
  } catch {
    /* without the grant the preview loses some images, nothing else */
  }
}

/** true when the file still has the stamp it was read with (browser: always). */export async function documentUnchanged(
  path: string,
  mtimeMs: number,
  size: number,
): Promise<boolean> {
  if (!isTauri) return true;
  return (await invoke('check_document', { path, mtimeMs, size })) as boolean;
}

/* ------------------------------------------------------------------ */
/* Drafts (unsaved work kept across crashes)                           */
/* ------------------------------------------------------------------ */

export interface Draft {
  /** Stable id: the absolute path, or `untitled:<name>`. */
  key: string;
  name: string;
  path: string | null;
  content: string;
  eol: '\n' | '\r\n';
  bom: boolean;
  encoding: DocEncoding;
}

const BROWSER_DRAFTS_KEY = 'md-view:drafts';

/** Reads the drafts left by an unexpected exit (empty when there are none). */
export async function loadDrafts(): Promise<Draft[]> {
  if (!isTauri) {
    try {
      const raw = localStorage.getItem(BROWSER_DRAFTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as Draft[]) : [];
    } catch {
      return [];
    }
  }
  return (await invoke('load_drafts')) as Draft[];
}

/** Replaces the draft file with the current dirty documents (empty clears it). */
export async function saveDrafts(drafts: Draft[]): Promise<void> {
  if (!isTauri) {
    try {
      if (drafts.length === 0) localStorage.removeItem(BROWSER_DRAFTS_KEY);
      else localStorage.setItem(BROWSER_DRAFTS_KEY, JSON.stringify(drafts));
    } catch {
      /* private mode: drafts are simply not kept */
    }
    return;
  }
  await invoke('save_drafts', { drafts });
}

export async function clearDrafts(): Promise<void> {
  if (!isTauri) {
    try {
      localStorage.removeItem(BROWSER_DRAFTS_KEY);
    } catch {
      /* nothing to clear */
    }
    return;
  }
  await invoke('clear_drafts');
}

/** Asks for a new path for "Save as". Returns null if cancelled. */
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
/* Folder tree                                                         */
/* ------------------------------------------------------------------ */

export interface TreeEntry {
  name: string;
  path: string;
  kind: 'dir' | 'file';
  /** Files only: it can be opened with the editor. */
  isText: boolean;
  size: number;
  children?: TreeEntry[];
}

export interface FolderTree {
  root: TreeEntry;
  /** true if the walk was cut off by file count or depth. */
  truncated: boolean;
}

/** Quick classification for the browser fallback (it cannot sniff bytes). */
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
    // Some engines only emit `input`, others `change`: we listen to both.
    input.addEventListener('change', finish, { once: true });
    input.addEventListener('input', finish, { once: true });

    input.click();
  });
}

function browserTreeFromFiles(files: File[]): FolderTree | null {
  if (files.length === 0) return null;

  const rootName = files[0].webkitRelativePath.split('/')[0] || 'folder';
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

/** Opens the folder dialog and returns the full tree. */
export async function pickFolder(): Promise<FolderTree | null> {
  if (isTauri) {
    const selected = await openFileDialog({ directory: true, multiple: false });
    if (typeof selected !== 'string') return null;
    return readTree(selected);
  }
  return browserTreeFromFiles(await browserPickFolder());
}

/** Re-reads a folder that is already open. */
export async function readTree(path: string): Promise<FolderTree> {
  if (!isTauri) throw new Error(t('app.browserFolderOnly'));
  return (await invoke('read_tree', { path })) as FolderTree;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/** Writes a text file (self-contained HTML, SVG, TXT...). */
export async function writeTextFile(path: string, content: string): Promise<void> {
  if (!isTauri) {
    downloadBlob(
      basename(path),
      new Blob([content], { type: 'text/plain;charset=utf-8' }),
    );
    return;
  }
  await invoke('write_text_file', { path, content });
}

/** Writes a binary file that comes in base64 (PNG, JPG, WebP...). */
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

/** Reads an arbitrary file and returns it in base64 (images when exporting). */
export async function readFileBase64(path: string): Promise<string> {
  return (await invoke('read_file_base64', { path })) as string;
}

/** Generates a PDF of the current page. In the browser it opens the print dialog. */
export async function exportPdf(path: string): Promise<void> {
  if (!isTauri) {
    window.print();
    return;
  }
  await invoke('export_pdf', { path });
}

/**
 * true when PDF export can run: native printing on Linux, the print dialog in
 * the browser. On macOS/Windows the platform cannot print the webview, so the
 * menu disables the entry instead of failing at the end of the flow.
 */
export async function supportsPdf(): Promise<boolean> {
  if (!isTauri) return true;
  return (await invoke('supports_pdf')) as boolean;
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

/** File size in bytes (0 if it cannot be determined). */
export async function documentSize(path: string): Promise<number> {
  if (!isTauri) return browserFiles.get(path)?.size ?? 0;
  return (await invoke('document_size', { path })) as number;
}

/** true if the path exists on disk. In the browser we can only look at the local cache. */
export interface GitBaseline {
  /** The file as committed in HEAD (LF). */
  text: string;
  branch: string;
}

/** Committed version of a file tracked by git; null outside a repository. */
export async function gitBaseline(path: string): Promise<GitBaseline | null> {
  if (!isTauri) return null;
  try {
    return (await invoke('git_baseline', { path })) as GitBaseline | null;
  } catch {
    return null;
  }
}

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

/** Opens a local path with the system's default application. */
export async function openPath(path: string): Promise<void> {
  if (!isTauri) return;
  await invoke('open_path', { path });
}

/** Converts an absolute path into a URL the webview can display. */
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
    /* no permission: not critical */
  }
}

/** Standard message for documents with unsaved changes. */
export function dirtyMessage(names: string[]): string {
  if (names.length === 1) return t('app.dirtyOne', { name: names[0] });
  return t('app.dirtyMany', { count: names.length });
}

/** Backend error codes → translation keys (the backend sends "code: detail"). */
const ERROR_KEYS: Record<string, TranslationKey> = {
  not_found: 'error.notFound',
  not_a_file: 'error.notAFile',
  not_a_directory: 'error.notADirectory',
  permission_denied: 'error.permission',
  too_large: 'error.tooLarge',
  invalid_encoding: 'error.encoding',
  unsupported_encoding: 'error.unsupportedEncoding',
  read_only: 'error.readOnly',
  io_error: 'error.io',
  invalid_data: 'error.invalidData',
  invalid_path: 'error.invalidPath',
  print_failed: 'error.printFailed',
  timeout: 'error.timeout',
  unsupported: 'error.unsupported',
};

/** Translates a backend error, keeping the technical detail the OS returned. */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^([a-z_]+):\s*([\s\S]*)$/.exec(raw);
  const key = match ? ERROR_KEYS[match[1]] : undefined;
  return key && match ? t(key, { detail: match[2] }) : raw;
}

/** Paths received from the command line (or when reusing the already open window). */
export async function takePendingOpen(): Promise<string[]> {
  if (!isTauri) return [];
  return (await invoke('take_pending_open')) as string[];
}

/** Notifies when another instance asks to open a file (single instance). */
export async function onExternalOpen(callback: () => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  const { listen: listenEvent } = await import('@tauri-apps/api/event');
  return listenEvent('md-view://open', () => callback());
}

/** Drag and drop files onto the window. */
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

/** Close the window: in Tauri we intercept the close so we can warn. */
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
/* Borderless window: the app draws its own title bar                  */
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
    /* no permission: not critical */
  }
}

/** Toggles maximized/restored and returns the resulting state. */
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

/** Closes the window going through the unsaved changes warning. */
export async function closeWindow(): Promise<void> {
  if (!isTauri) {
    window.close();
    return;
  }
  await getCurrentWindow().close();
}

/** Drags the window from the app's own title bar. */
export async function startWindowDrag(): Promise<void> {
  if (!isTauri) return;
  try {
    await getCurrentWindow().startDragging();
  } catch {
    /* Wayland sometimes rejects the request; not critical */
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

/** Resize from the edges, since the window has no native frame. */
export async function startWindowResize(direction: WindowResizeDirection): Promise<void> {
  if (!isTauri) return;
  try {
    await getCurrentWindow().startResizeDragging(direction);
  } catch {
    /* no permission: not critical */
  }
}

export interface TouchpadPinch {
  phase: 'begin' | 'update' | 'end';
  /** Relative to the start of the gesture. */
  scale: number;
  /** CSS pixels inside the window. */
  x: number;
  y: number;
}

/** Touchpad pinches (Linux: the backend blocks the native page zoom and forwards them). */
export async function onTouchpadPinch(callback: (pinch: TouchpadPinch) => void): Promise<UnlistenFn> {
  if (!isTauri) return () => {};
  try {
    return await listen<TouchpadPinch>('touchpad-pinch', (event) => callback(event.payload));
  } catch {
    return () => {};
  }
}

/** Gives the native window the page background (read from <body>). */
export async function syncWindowBackground(): Promise<void> {
  if (!isTauri) return;
  const match = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return;
  const [red, green, blue] = match.map((part) => Math.round(Number(part)));
  try {
    await invoke('set_window_background', { red, green, blue });
  } catch {
    // Cosmetic only.
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
