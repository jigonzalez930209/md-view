/**
 * Utilidades de rutas.
 *
 * El proyecto tiene que funcionar igual en Linux, macOS y Windows, asi que
 * tratamos ambos separadores y detectamos el estilo a partir de la propia ruta.
 * No usamos el modulo `path` de Node porque esto corre en el webview.
 */

/** Extensiones que abrimos como documento editable. */
export const MARKDOWN_EXTENSIONS = [
  'md',
  'markdown',
  'mdx',
  'mdown',
  'mkd',
  'mkdn',
  'mdwn',
  'mdtxt',
  'mdtext',
  'mdoc',
  'rmd',
  'qmd',
  'txt',
];

export function isWindowsPath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || isWindowsPath(p);
}

/** Separador predominante de una ruta (para recomponer sin mezclar estilos). */
export function sepOf(p: string): string {
  return p.includes('\\') && !p.includes('/') ? '\\' : '/';
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (i < 0) return '';
  if (i === 0) return '/';
  // No cortar "C:\archivo.md" en "C:".
  if (i === 2 && /^[a-zA-Z]:[\\/]/.test(p)) return p.slice(0, 3);
  return p.slice(0, i);
}

export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i < 0 ? p : p.slice(i + 1);
}

export function extname(p: string): string {
  const name = basename(p);
  const i = name.lastIndexOf('.');
  return i <= 0 ? '' : name.slice(i).toLowerCase();
}

export function isMarkdownPath(p: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(extname(p).replace(/^\./, ''));
}

/** Los .mdx llevan JSX y sentencias ESM: hay que preprocesarlos. */
export function isMdxPath(p: string | null): boolean {
  return p !== null && extname(p) === '.mdx';
}

/**
 * Extensiones que se renderizan como Markdown. El resto de los archivos de
 * texto se muestran como codigo (con su resaltado) para no destrozar el
 * formato original: un `.ts` no es un párrafo.
 */
const MARKDOWN_RENDER_EXTENSIONS = new Set([
  'md',
  'markdown',
  'mdx',
  'mdown',
  'mkd',
  'mkdn',
  'mdwn',
  'mdtxt',
  'mdtext',
  'mdoc',
  'rmd',
  'qmd',
]);

/** true si el documento se debe renderizar como Markdown (no como codigo). */
export function isMarkdownRenderable(p: string | null): boolean {
  // Sin ruta (documento nuevo o demo) asumimos Markdown.
  if (p === null) return true;
  return MARKDOWN_RENDER_EXTENSIONS.has(extname(p).replace(/^\./, ''));
}

/** Lenguaje para el resaltado, a partir de la extension. */
export function languageOfPath(p: string | null): string {
  if (p === null) return '';
  const extension = extname(p).replace(/^\./, '').toLowerCase();
  const aliases: Record<string, string> = {
    tsx: 'typescript',
    ts: 'typescript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    yml: 'yaml',
    htm: 'html',
    md: 'markdown',
    mdx: 'markdown',
    sh: 'bash',
    zsh: 'bash',
  };
  return aliases[extension] ?? extension;
}

export function joinPath(dir: string, rel: string): string {
  if (!dir) return rel;
  const sep = sepOf(dir);
  return dir.replace(/[\\/]+$/, '') + sep + rel.replace(/^[\\/]+/, '');
}

/** Resuelve `.` y `..` sin tocar el disco. */
export function normalizePath(input: string): string {
  if (!input) return '';
  const sep = sepOf(input);
  const drive = /^[a-zA-Z]:/.exec(input)?.[0] ?? '';
  const rest = drive ? input.slice(drive.length) : input;
  const absolute = /^[\\/]/.test(rest);

  const parts: string[] = [];
  for (const part of rest.split(/[\\/]+/)) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (!absolute) parts.push('..');
      continue;
    }
    parts.push(part);
  }

  let out = parts.join(sep);
  if (absolute) out = sep + out;
  if (drive) out = drive + out;
  return out || (absolute ? sep : '.');
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface ResolvedRef {
  /** Ruta sin `#ancla` ni `?query`. */
  path: string;
  /** Sufijo `#ancla` que habia en el original. */
  hash: string;
}

/**
 * Resuelve una referencia relativa (imagen o enlace) contra el documento actual.
 * Devuelve `null` cuando la referencia no es un archivo local (http, data:, mailto...).
 */
export function resolveReference(
  raw: string,
  docPath: string | null,
): (ResolvedRef & { candidates: string[] }) | null {
  const original = raw.trim();
  if (!original) return null;

  // Cualquier cosa con esquema (http:, data:, asset:, file:, mailto:...) la dejamos como esta.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(original)) return null;
  // Protocolo relativo (//cdn...) o ancla interna del propio documento.
  if (original.startsWith('//') || original.startsWith('#')) return null;

  const hashIndex = original.indexOf('#');
  const hash = hashIndex >= 0 ? original.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? original.slice(0, hashIndex) : original;
  const path = decodeSafe(withoutHash.replace(/[?#].*$/, '')).trim();
  if (!path) return null;

  const candidates: string[] = [];
  if (isAbsolutePath(path)) {
    // Ruta absoluta del sistema: es la interpretacion principal.
    candidates.push(normalizePath(path));
    // Y como respaldo, relativa al documento (habitual en README con "/assets/x.png").
    if (docPath) candidates.push(normalizePath(joinPath(dirname(docPath), path.replace(/^[\\/]+/, ''))));
  } else {
    if (!docPath) return null;
    candidates.push(normalizePath(joinPath(dirname(docPath), path)));
  }

  return { path, hash, candidates };
}
