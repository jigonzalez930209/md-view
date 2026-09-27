/**
 * Path utilities.
 *
 * The project has to work the same on Linux, macOS and Windows, so we handle
 * both separators and detect the style from the path itself. We do not use
 * Node's `path` module because this runs in the webview.
 */

/** Extensions we open as an editable document. */
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

/** Predominant separator of a path (to recompose without mixing styles). */
export function sepOf(p: string): string {
  return p.includes('\\') && !p.includes('/') ? '\\' : '/';
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (i < 0) return '';
  if (i === 0) return '/';
  // Do not cut "C:\file.md" into "C:".
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

/** .mdx files carry JSX and ESM statements: they have to be preprocessed. */
export function isMdxPath(p: string | null): boolean {
  return p !== null && extname(p) === '.mdx';
}

/**
 * Extensions that are rendered as Markdown. The remaining text files are
 * shown as code (with their highlighting) so the original format is not
 * mangled: a `.ts` is not a paragraph.
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

/** true if the document must be rendered as Markdown (not as code). */
export function isMarkdownRenderable(p: string | null): boolean {
  // Without a path (new or demo document) we assume Markdown.
  if (p === null) return true;
  return MARKDOWN_RENDER_EXTENSIONS.has(extname(p).replace(/^\./, ''));
}

/** Language for highlighting, based on the extension. */
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

/** Resolves `.` and `..` without touching the disk. */
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
  /** Path without the `#anchor` or `?query`. */
  path: string;
  /** `#anchor` suffix that was in the original. */
  hash: string;
}

/**
 * Resolves a relative reference (image or link) against the current document.
 * Returns `null` when the reference is not a local file (http, data:, mailto...).
 */
export function resolveReference(
  raw: string,
  docPath: string | null,
): (ResolvedRef & { candidates: string[] }) | null {
  const original = raw.trim();
  if (!original) return null;

  // Anything with a scheme (http:, data:, asset:, file:, mailto:...) is left as is.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(original)) return null;
  // Relative protocol (//cdn...) or an anchor inside the document itself.
  if (original.startsWith('//') || original.startsWith('#')) return null;

  const hashIndex = original.indexOf('#');
  const hash = hashIndex >= 0 ? original.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? original.slice(0, hashIndex) : original;
  const path = decodeSafe(withoutHash.replace(/[?#].*$/, '')).trim();
  if (!path) return null;

  const candidates: string[] = [];
  if (isAbsolutePath(path)) {
    // Absolute system path: it is the primary interpretation.
    candidates.push(normalizePath(path));
    // And as a fallback, relative to the document (common in READMEs with "/assets/x.png").
    if (docPath) candidates.push(normalizePath(joinPath(dirname(docPath), path.replace(/^[\\/]+/, ''))));
  } else {
    if (!docPath) return null;
    candidates.push(normalizePath(joinPath(dirname(docPath), path)));
  }

  return { path, hash, candidates };
}
