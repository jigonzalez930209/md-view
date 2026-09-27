/**
 * Markdown -> HTML pipeline (UI side).
 *
 * The render itself lives in `markdown-core.ts` (DOM-free) and can be
 * dispatched to a worker when the document is large. Here remains what needs
 * the DOM: DOMPurify sanitization and the cache of already-rendered HTML.
 *
 * Measured, DOMPurify is the most expensive part of the pipeline (~45%): it
 * parses all the HTML into a DOM and walks it. That is why:
 *
 * - if the Markdown carries no raw HTML (`hasRawHtml`), it is skipped:
 *   markdown-it already escapes the text and validates links on its own;
 * - for large documents, the core is rendered in a worker and the UI only
 *   sanitizes (if needed) and inserts.
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
  // <style> and friends stay out: KaTeX uses inline style attributes, which we do allow.
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base'],
  FORBID_ATTR: ['srcset', 'formaction', 'ping'],
  ADD_ATTR: ['loading', 'decoding', 'align', 'aria-hidden', 'aria-label', 'role', 'target', 'rel'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

/** true when a lightweight version should be rendered (huge document). */
export function isSimplified(source: string): boolean {
  return source.length > SIMPLIFY_LIMIT;
}

/** true when the preview is limited to the first lines (huge document). */
export function previewNeedsWindow(source: string): boolean {
  return source.length > PREVIEW_LIMIT;
}

/**
 * Cache of already-rendered HTML.
 *
 * Switching tabs should not run markdown-it + DOMPurify over the same text
 * again. The key is the string itself: V8 stores its hash, so reused text is
 * looked up in O(1).
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

/** Sanitizes only if the source can carry raw HTML. */
function finish(source: string, core: string): string {
  return hasRawHtml(source) ? DOMPurify.sanitize(core, PURIFY_CONFIG) : core;
}

/** Markdown -> sanitized HTML, on the current thread (small documents and export). */
export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const key = cacheKey(source, options);
  const cached = htmlCache.get(key);
  if (cached !== undefined) return cached;
  return remember(key, finish(source, renderMarkdownCore(source, options)));
}

/**
 * Same as `renderMarkdown` but non-blocking: large documents are rendered in
 * the worker (markdown-it + plugins) and here only sanitization remains, which
 * needs the DOM.
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

/** true if the document has any Mermaid fence (to preload the library). */
export function hasDiagrams(source: string): boolean {
  return /^[ \t]*(`{3,}|~{3,})[ \t]*mermaid\b/m.test(source);
}
