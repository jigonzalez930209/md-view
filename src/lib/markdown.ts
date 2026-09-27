/**
 * Pipeline de Markdown -> HTML (lado interfaz).
 *
 * El render en si vive en `markdown-core.ts` (sin DOM) y se puede despachar a
 * un worker cuando el documento es grande. Aca queda lo que necesita el DOM:
 * la sanitizacion con DOMPurify y la cache de HTML ya renderizado.
 *
 * DOMPurify es, medido, la parte mas cara del pipeline (~45%): parsea todo el
 * HTML en un DOM y lo recorre. Por eso:
 *
 * - si el Markdown no trae HTML crudo (`hasRawHtml`), se saltea: markdown-it ya
 *   escapa el texto y valida los enlaces por su cuenta;
 * - en documentos grandes, el nucleo se renderiza en un worker y la interfaz
 *   solo sanitiza (si hace falta) e inserta.
 */

import DOMPurify from 'dompurify';
import type { Config as PurifyConfig } from 'dompurify';
import 'katex/dist/katex.min.css';
import { hasRawHtml, renderMarkdownCore, type RenderOptions } from './markdown-core';

export { HIGHLIGHT_LIMIT } from './markdown-core';
import { LARGE_DOC_LIMIT, PREVIEW_LIMIT, SIMPLIFY_LIMIT } from './limits';
import { renderCoreInWorker } from './text-tasks';

const PURIFY_CONFIG: PurifyConfig = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  // <style> y compañia quedan fuera: KaTeX usa atributos style inline, que si permitimos.
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base'],
  FORBID_ATTR: ['srcset', 'formaction', 'ping'],
  ADD_ATTR: ['loading', 'decoding', 'align', 'aria-hidden', 'aria-label', 'role', 'target', 'rel'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

/** true si conviene renderizar una version liviana (documento enorme). */
export function isSimplified(source: string): boolean {
  return source.length > SIMPLIFY_LIMIT;
}

/** true si el preview se limita a las primeras lineas (documento enorme). */
export function previewNeedsWindow(source: string): boolean {
  return source.length > PREVIEW_LIMIT;
}

/**
 * Cache de HTML ya renderizado.
 *
 * Cambiar de pestana no deberia volver a pasar markdown-it + DOMPurify por el
 * mismo texto. La clave es el propio string: V8 guarda su hash, asi que un
 * texto reutilizado se busca en O(1).
 */
const htmlCache = new Map<string, string>();
const HTML_CACHE_LIMIT = 3;

function cacheKey(source: string, options: RenderOptions): string {
  return `${options.mdx ? 'mdx' : 'md'}\u0000${source}`;
}

function remember(key: string, html: string): string {
  if (htmlCache.size >= HTML_CACHE_LIMIT) {
    const oldest = htmlCache.keys().next().value;
    if (oldest !== undefined) htmlCache.delete(oldest);
  }
  htmlCache.set(key, html);
  return html;
}

/** Sanitiza solo si el fuente puede traer HTML crudo. */
function finish(source: string, core: string): string {
  return hasRawHtml(source) ? DOMPurify.sanitize(core, PURIFY_CONFIG) : core;
}

/** Markdown -> HTML sanitizado, en el hilo actual (documentos chicos y export). */
export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const key = cacheKey(source, options);
  const cached = htmlCache.get(key);
  if (cached !== undefined) return cached;
  return remember(key, finish(source, renderMarkdownCore(source, options)));
}

/**
 * Igual que `renderMarkdown` pero sin bloquear: los documentos grandes se
 * renderizan en el worker (markdown-it + plugins) y aca solo queda la
 * sanitizacion, que necesita el DOM.
 */
export async function renderMarkdownAsync(
  source: string,
  options: RenderOptions = {},
): Promise<string> {
  const key = cacheKey(source, options);
  const cached = htmlCache.get(key);
  if (cached !== undefined) return cached;

  const core =
    source.length >= LARGE_DOC_LIMIT
      ? ((await renderCoreInWorker(source, options.mdx === true)) ??
        renderMarkdownCore(source, options))
      : renderMarkdownCore(source, options);

  return remember(key, finish(source, core));
}

/** true si el documento tiene algun fence de Mermaid (para precargar la libreria). */
export function hasDiagrams(source: string): boolean {
  return /^[ \t]*(`{3,}|~{3,})[ \t]*mermaid\b/m.test(source);
}
