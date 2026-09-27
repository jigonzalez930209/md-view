/**
 * Document export to output formats.
 *
 * - Self-contained HTML: CSS, KaTeX fonts and images embedded.
 * - PDF: WebKitGTK prints it with the @media print rules (vector output).
 * - PNG/JPG/WebP: rasterizes the DOM with modern-screenshot (PNG in A4 pages).
 * - SVG: DOM wrapped in foreignObject, also self-contained.
 * - TXT: plain text of the render.
 */

import { domToCanvas, domToJpeg, domToWebp, type Options } from 'modern-screenshot';
import { elementToSVG, inlineResources } from 'dom-to-svg';
import { zipSync } from 'fflate';
import katexCss from 'katex/dist/katex.min.css?raw';
import markdownCss from '@/styles/markdown.css?raw';
import themeCss from '@/styles/theme.css?raw';
import * as backend from './backend';
import { basename, dirname, extname } from './paths';
import { t, type TranslationKey } from './i18n';
import type { Palette, Theme } from './theme';

export type ExportFormat = 'pdf' | 'html' | 'png-pages' | 'png-full' | 'jpg' | 'webp' | 'svg' | 'txt';

export interface ExportFormatInfo {
  id: ExportFormat;
  /** Translation keys (resolved by the UI). */
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  filterKey: TranslationKey;
  extension: string;
}

export const EXPORT_FORMATS: ExportFormatInfo[] = [
  {
    id: 'pdf',
    labelKey: 'export.pdf.label',
    hintKey: 'export.pdf.hint',
    filterKey: 'filter.pdf',
    extension: 'pdf',
  },
  {
    id: 'html',
    labelKey: 'export.html.label',
    hintKey: 'export.html.hint',
    filterKey: 'filter.html',
    extension: 'html',
  },
  {
    id: 'png-pages',
    labelKey: 'export.zip.label',
    hintKey: 'export.zip.hint',
    filterKey: 'filter.zip',
    extension: 'zip',
  },
  {
    id: 'png-full',
    labelKey: 'export.png.label',
    hintKey: 'export.png.hint',
    filterKey: 'filter.png',
    extension: 'png',
  },
  {
    id: 'jpg',
    labelKey: 'export.jpg.label',
    hintKey: 'export.jpg.hint',
    filterKey: 'filter.jpg',
    extension: 'jpg',
  },
  {
    id: 'webp',
    labelKey: 'export.webp.label',
    hintKey: 'export.webp.hint',
    filterKey: 'filter.webp',
    extension: 'webp',
  },
  {
    id: 'svg',
    labelKey: 'export.svg.label',
    hintKey: 'export.svg.hint',
    filterKey: 'filter.svg',
    extension: 'svg',
  },
  {
    id: 'txt',
    labelKey: 'export.txt.label',
    hintKey: 'export.txt.hint',
    filterKey: 'filter.text',
    extension: 'txt',
  },
];

export { t as translateExport };

export interface ExportContext {
  title: string;
  theme: Theme;
  palette: Palette;
}

/** A4 sheet at 96 dpi. */
const A4 = { width: 794, height: 1123 };
const MAX_SCALE = 2;
const MAX_PIXELS = 60_000_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function mimeFor(path: string): string {
  return MIME_BY_EXTENSION[extname(path)] ?? 'application/octet-stream';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Local path from a Tauri asset URL (or null when remote). */
function assetPath(url: string): string | null {
  if (url.startsWith('http://asset.localhost/')) {
    return decodeURIComponent(url.slice('http://asset.localhost/'.length));
  }
  if (url.startsWith('asset://localhost/')) {
    return decodeURIComponent(url.slice('asset://localhost/'.length));
  }
  if (url.startsWith('asset://')) {
    return decodeURIComponent(url.replace(/^asset:\/\/[^/]*/, ''));
  }
  return null;
}

/** Reads a local image and returns it as a data URL. */
async function imageToDataUrl(url: string, source?: string | null): Promise<string | null> {
  const path = source ?? assetPath(url);
  if (path && backend.isTauri) {
    try {
      const base64 = await backend.readFileBase64(path);
      return `data:${mimeFor(path)};base64,${base64}`;
    } catch {
      /* fall back to fetch */
    }
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Common rasterization options: no UI buttons or anchors. */
function captureOptions(theme: Theme): Options {
  return {
    backgroundColor: cssVar('--background', theme === 'dark' ? '#0d1117' : '#ffffff'),
    timeout: 15_000,
    filter: (node) =>
      !(
        node instanceof Element &&
        (node.classList.contains('code-copy') ||
          node.classList.contains('md-anchor') ||
          node.classList.contains('mermaid-source'))
      ),
    fetchFn: async (url) => {
      const path = assetPath(url);
      if (path && backend.isTauri) {
        const data = await imageToDataUrl(url, path);
        if (data) return data;
      }
      return false;
    },
  };
}

/**
 * Off-screen images with `loading="lazy"` never load and the capture used to
 * wait half a minute. We force them and wait.
 */
async function withEagerImages<T>(article: HTMLElement, task: () => Promise<T>): Promise<T> {
  const images = Array.from(article.querySelectorAll('img'));
  const previous = images.map((image) => image.loading);

  images.forEach((image) => {
    image.loading = 'eager';
  });
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)));

  try {
    return await task();
  } finally {
    images.forEach((image, index) => {
      image.loading = previous[index];
    });
  }
}

/**
 * Prepares the *live* article for a capture: hides the UI decorations and
 * embeds the images as data URLs (to avoid depending on the asset protocol
 * when converting to SVG). Restores everything when done.
 */
async function withPreparedArticle<T>(article: HTMLElement, task: () => Promise<T>): Promise<T> {
  const decorations = Array.from(article.querySelectorAll<HTMLElement>('.code-copy, .md-anchor'));
  const previousDisplay = decorations.map((node) => node.style.display);
  decorations.forEach((node) => {
    node.style.display = 'none';
  });

  const images = Array.from(article.querySelectorAll('img'));
  const previousSources = images.map((image) => image.getAttribute('src') ?? '');
  await Promise.all(
    images.map(async (image, index) => {
      const data = await imageToDataUrl(image.src, image.dataset.source ?? null);
      if (data) image.setAttribute('src', data);
      else image.setAttribute('src', previousSources[index]);
    }),
  );

  try {
    return await task();
  } finally {
    decorations.forEach((node, index) => {
      node.style.display = previousDisplay[index];
    });
    images.forEach((image, index) => image.setAttribute('src', previousSources[index]));
  }
}

/** Leaves the clone ready to export: no decorations or internal attributes. */
function cleanClone(article: HTMLElement): HTMLElement {
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.code-copy, .md-anchor, .mermaid-source').forEach((node) => node.remove());
  clone.querySelectorAll('[data-line]').forEach((node) => node.removeAttribute('data-line'));
  clone.querySelectorAll('.md-image--broken').forEach((node) => node.classList.remove('md-image--broken'));
  return clone;
}

/* ------------------------------------------------------------------ */
/* Self-contained HTML                                                */
/* ------------------------------------------------------------------ */

/** Data URLs of the fonts the page already has loaded (KaTeX). */
async function fontDataUrls(): Promise<Map<string, string>> {
  const fonts = new Map<string, string>();

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // a stylesheet from another origin
    }
    if (!rules) continue;

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const src = rule.style.getPropertyValue('src');
      for (const match of src.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        const url = match[1];
        const name = url.split('/').pop() ?? url;
        if (fonts.has(name)) continue;
        const data = await imageToDataUrl(url);
        if (data) fonts.set(name, data);
      }
    }
  }

  return fonts;
}

/** Replaces `url(fonts/...)` with the data URLs already collected. */
function inlineFontUrls(css: string, fonts: Map<string, string>): string {
  return css.replace(/url\((["']?)([^"')]+)\1\)/g, (full, _quote, url: string) => {
    const name = url.split('/').pop() ?? url;
    const data = fonts.get(name);
    return data ? `url(${data})` : full;
  });
}

export async function buildSelfContainedHtml(article: HTMLElement, context: ExportContext): Promise<string> {
  const clone = cleanClone(article);

  for (const image of Array.from(clone.querySelectorAll('img'))) {
    const data = await imageToDataUrl(image.src, image.dataset.source ?? null);
    if (data) image.src = data;
  }

  const fonts = await fontDataUrls();
  const katex = inlineFontUrls(katexCss, fonts);

  return `<!doctype html>
<html lang="es" data-theme="${context.theme}" data-palette="${context.palette}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(context.title)}</title>
<style>
${themeCss}
${markdownCss}
${katex}
html { color-scheme: ${context.theme === 'dark' ? 'dark' : 'light'}; }
html, body { background: var(--background); color: var(--foreground); }
body { margin: 0; padding: 0; }
.markdown-body { max-width: 980px; margin: 0 auto; padding: 36px 32px 120px; }
</style>
</head>
<body class="markdown-body">
${clone.innerHTML}
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Images                                                             */
/* ------------------------------------------------------------------ */

function canvasToBase64(canvas: HTMLCanvasElement, type: string, quality?: number): string {
  const data = canvas.toDataURL(type, quality);
  return data.slice(data.indexOf(',') + 1);
}

async function canvasBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(t('export.imageError'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** btoa does not accept large arrays at once: it goes in chunks. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function captureCanvas(article: HTMLElement, theme: Theme): Promise<HTMLCanvasElement> {
  const width = Math.max(1, article.scrollWidth);
  const height = Math.max(1, article.scrollHeight);
  const fit = Math.sqrt(MAX_PIXELS / (width * height));
  const scale = Math.max(1, Math.min(MAX_SCALE, fit));

  return withEagerImages(article, () =>
    domToCanvas(article, { ...captureOptions(theme), scale }),
  );
}

/** Writes a full image (PNG/JPG/WebP) and returns the path. */
async function exportImage(
  format: 'png-full' | 'jpg' | 'webp',
  article: HTMLElement,
  target: string,
  theme: Theme,
): Promise<string> {
  if (format === 'png-full') {
    const canvas = await captureCanvas(article, theme);
    await backend.writeBase64File(target, canvasToBase64(canvas, 'image/png'));
    return t('export.imageSaved', { dir: dirname(target) });
  }

  const dataUrl =
    format === 'jpg'
      ? await withEagerImages(article, () =>
          domToJpeg(article, { ...captureOptions(theme), quality: 0.92 }),
        )
      : await withEagerImages(article, () =>
          domToWebp(article, { ...captureOptions(theme), quality: 0.92 }),
        );
  await backend.writeBase64File(target, dataUrl.slice(dataUrl.indexOf(',') + 1));
  return t('export.imageSaved', { dir: dirname(target) });
}

/** Splits the capture into A4 pages and packs them into a ZIP. */
async function exportPngPages(article: HTMLElement, target: string, theme: Theme): Promise<string> {
  const canvas = await captureCanvas(article, theme);
  const pageHeight = Math.max(1, Math.round(canvas.width * (A4.height / A4.width)));
  const pages = Math.max(1, Math.ceil(canvas.height / pageHeight));
  const name = basename(target).replace(/\.[^.]+$/, '') || 'page';

  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < pages; index += 1) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(pageHeight, canvas.height - index * pageHeight);
    const context = slice.getContext('2d');
    if (!context) throw new Error(t('export.canvasError'));
    context.fillStyle = cssVar('--background', '#ffffff');
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, index * pageHeight, canvas.width, slice.height, 0, 0, canvas.width, slice.height);

    files[`${name}-${String(index + 1).padStart(2, '0')}.png`] = await canvasBytes(slice);
  }

  const zip = zipSync(files, { level: 0 });
  await backend.writeBase64File(target, bytesToBase64(zip));

  const file = basename(target);
  return pages === 1
    ? t('export.pageSaved', { file })
    : t('export.pagesSaved', { count: pages, file });
}

/* ------------------------------------------------------------------ */
/* SVG and text                                                       */
/* ------------------------------------------------------------------ */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * `dom-to-svg` does not render pseudo-elements (`::marker`) and does not
 * resolve `<input type=checkbox>` well: we replace them with real text/vectors
 * before converting and restore the DOM when done.
 */
function decorateForSvg(article: HTMLElement): () => void {
  const markers: HTMLElement[] = [];
  const swaps: Array<{ replacement: SVGElement; input: HTMLInputElement }> = [];

  const addMarker = (item: HTMLElement, text: string) => {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.marginRight = '0.4em';
    span.style.fontStyle = 'normal';
    item.prepend(span);
    markers.push(span);
  };

  for (const item of Array.from(article.querySelectorAll<HTMLLIElement>('li'))) {
    if (item.classList.contains('task-list-item')) continue;
    const list = item.parentElement;
    if (!list) continue;

    if (list.tagName === 'OL') {
      const siblings = Array.from(list.children).filter((child) => child.tagName === 'LI');
      addMarker(item, `${siblings.indexOf(item) + 1}.`);
    } else if (list.tagName === 'UL') {
      // Discs per level, like GitHub's CSS.
      let depth = 0;
      let ancestor: HTMLElement | null = list;
      while (ancestor && ancestor.tagName === 'UL') {
        depth += 1;
        ancestor = ancestor.parentElement?.closest('ul') ?? null;
      }
      const glyph = depth >= 3 ? '▪' : depth === 2 ? '◦' : '•';
      addMarker(item, glyph);
    }
  }

  for (const input of Array.from(article.querySelectorAll<HTMLInputElement>('input[type=checkbox]'))) {
    const box = document.createElementNS(SVG_NS, 'svg');
    box.classList.add('svg-checkbox');
    box.setAttribute('width', '13');
    box.setAttribute('height', '13');
    box.setAttribute('viewBox', '0 0 16 16');
    box.innerHTML =
      '<rect x="1.25" y="1.25" width="13.5" height="13.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      (input.checked
        ? '<path d="M4.5 8.2 7 10.7l4.6-5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
        : '');
    input.replaceWith(box);
    swaps.push({ replacement: box, input });
  }

  // The arrow of closed <details> elements.
  const summaries: HTMLElement[] = [];
  for (const summary of Array.from(article.querySelectorAll<HTMLElement>('summary'))) {
    if (summary.closest('details[open]')) continue;
    const arrow = document.createElement('span');
    arrow.textContent = '▸';
    arrow.style.marginRight = '0.4em';
    summary.prepend(arrow);
    summaries.push(arrow);
  }

  return () => {
    markers.forEach((marker) => marker.remove());
    swaps.forEach(({ replacement, input }) => replacement.replaceWith(input));
    summaries.forEach((arrow) => arrow.remove());
  };
}

/**
 * `dom-to-svg` measures with `getBoundingClientRect`: if the preview is
 * scrolled, the SVG comes out displaced. We put it at the top for an instant.
 */
async function withArticleAtTop<T>(article: HTMLElement, task: () => Promise<T>): Promise<T> {
  const host = article.parentElement;
  const previous = host?.scrollTop ?? 0;

  if (host) host.scrollTop = 0;
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

  try {
    return await task();
  } finally {
    if (host) host.scrollTop = previous;
  }
}

/**
 * Real vector SVG: `dom-to-svg` computes the layout and emits real text
 * (not a `<foreignObject>`), .md images are embedded and the embedded SVGs
 * (Mermaid) are nested as vectors.
 */
async function exportSvg(article: HTMLElement, target: string, _theme: Theme): Promise<string> {
  await withArticleAtTop(article, () =>
    withEagerImages(article, () =>
      withPreparedArticle(article, async () => {
        const restore = decorateForSvg(article);
        try {
          const svgDocument = elementToSVG(article, { keepLinks: true });

          // KaTeX fonts, embedded so the formulas look right.
          const fonts = await fontDataUrls();
          const style = svgDocument.createElementNS(SVG_NS, 'style');
          style.textContent = inlineFontUrls(katexCss, fonts);
          svgDocument.documentElement.prepend(style);

          await inlineResources(svgDocument.documentElement);
          const svg = new XMLSerializer().serializeToString(svgDocument);
          await backend.writeTextFile(target, svg);
        } finally {
          restore();
        }
      }),
    ),
  );

  return t('export.svgSaved', { dir: dirname(target) });
}

function exportText(article: HTMLElement, target: string): Promise<string> {
  return backend
    .writeTextFile(target, article.innerText)
    .then(() => t('export.textSaved', { dir: dirname(target) }));
}

/* ------------------------------------------------------------------ */

/** Leaves the view ready to print: images loaded and layout settled. */
export async function prepareForPrint(article: HTMLElement): Promise<void> {
  await withEagerImages(article, async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  });
}

/** Runs the requested export and returns the message for the status bar. */
export async function exportDocument(
  format: ExportFormat,
  article: HTMLElement,
  target: string,
  context: ExportContext,
): Promise<string> {
  switch (format) {
    case 'html':
      await backend.writeTextFile(target, await buildSelfContainedHtml(article, context));
      return t('export.htmlSaved', { dir: dirname(target) });
    case 'pdf':
      await prepareForPrint(article);
      await backend.exportPdf(target);
      return t('export.pdfSaved', { dir: dirname(target) });
    case 'png-pages':
      return exportPngPages(article, target, context.theme);
    case 'png-full':
    case 'jpg':
    case 'webp':
      return exportImage(format, article, target, context.theme);
    case 'svg':
      return exportSvg(article, target, context.theme);
    case 'txt':
      return exportText(article, target);
  }
}
