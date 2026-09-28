/**
 * Post-processing of the rendered HTML.
 *
 * markdown-it returns "plain" HTML; here we finish turning it into the
 * GitHub-like experience:
 *
 *  - ids + anchors on the headings,
 *  - `> [!NOTE]` / `[!TIP]` / ... alerts,
 *  - images and links resolved against the document folder,
 *  - "copy" button on every code block,
 *  - Mermaid diagrams drawn in place of the fence.
 *
 * It always works on DOM nodes already inserted, so it serves both Markdown
 * and hand-written embedded HTML.
 */

import { isMarkdownPath, resolveReference } from './paths';
import { openExternal, openPath, pathExists, toAssetUrl } from './backend';
import { renderDiagram, type Appearance } from './mermaid';
import { t } from './i18n';
import type { Palette, Theme } from './theme';

export interface PreviewHandlers {
  docPath: string | null;
  onOpenFile: (path: string) => void;
  onMessage: (text: string, kind: 'info' | 'error') => void;
}

export interface EnhanceOptions extends PreviewHandlers {
  theme: Theme;
  palette: Palette;
  /** false for huge documents: leaves the diagrams as code. */
  diagrams?: boolean;
}

/** Candidate paths for each local link, resolved only on click. */
const linkTargets = new WeakMap<HTMLAnchorElement, string[]>();

/* ------------------------------------------------------------------ */
/* Headings: id + anchor                                              */
/* ------------------------------------------------------------------ */

/** Simplified version of the slug GitHub uses for anchors. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s+/g, '-');
}

const ANCHOR_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="m7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z"/></svg>';

function addHeadingAnchors(root: HTMLElement): void {
  const used = new Map<string, number>();

  for (const heading of root.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6')) {
    const text = heading.textContent ?? '';
    const base = slugify(text);
    if (!base) continue;

    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen}`;

    heading.id = id;

    const anchor = document.createElement('a');
    anchor.className = 'md-anchor';
    anchor.href = `#${id}`;
    anchor.tabIndex = -1;
    anchor.setAttribute('aria-hidden', 'true');
    anchor.innerHTML = ANCHOR_ICON;
    heading.prepend(anchor);
  }
}

/* ------------------------------------------------------------------ */
/* GitHub alerts                                                      */
/* ------------------------------------------------------------------ */

type AlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/;
const ALERT_LABEL_KEY: Record<AlertType, 'enhance.alertNote' | 'enhance.alertTip' | 'enhance.alertImportant' | 'enhance.alertWarning' | 'enhance.alertCaution'> = {
  note: 'enhance.alertNote',
  tip: 'enhance.alertTip',
  important: 'enhance.alertImportant',
  warning: 'enhance.alertWarning',
  caution: 'enhance.alertCaution',
};

const ALERT_ICON: Record<AlertType, string> = {
  note: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM7.25 4.75a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5Z"/></svg>',
  tip: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a4.5 4.5 0 0 0-2.7 8.1c.3.22.45.55.45.9v.5h4.5v-.5c0-.35.15-.68.45-.9A4.5 4.5 0 0 0 8 1.5ZM4.5 11.75h7v1.1h-7v-1.1Zm1 2.35h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1 0-1.5Z"/></svg>',
  important:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0 16 8l-8 8-8-8 8-8Zm0 2.12L2.12 8 8 13.88 13.88 8 8 2.12ZM8.75 11a.75.75 0 0 1-1.5 0V6.5a.75.75 0 0 1 1.5 0V11Zm-.75-6a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"/></svg>',
  warning:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M6.99 1.9a1.17 1.17 0 0 1 2.02 0l6.3 10.9A1.17 1.17 0 0 1 14.3 14.6H1.7a1.17 1.17 0 0 1-1.01-1.8l6.3-10.9Zm.97.92L1.7 13.6h12.6L7.96 2.82ZM8.75 11a.75.75 0 0 1-1.5 0V7.4a.75.75 0 0 1 1.5 0V11Zm-.75 1.05a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z"/></svg>',
  caution:
    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M5.2.6h5.6L15.4 5.2v5.6l-4.6 4.6H5.2L.6 10.8V5.2L5.2.6Zm.62 1.4L1.5 6.32v3.36l4.32 4.32h3.36l4.32-4.32V6.32L9.18 2H5.82ZM8.75 11a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 1.5 0v4Zm-.75 1.05a.85.85 0 1 1 0 1.7.85.85 0 0 1 0-1.7Z"/></svg>',
};

function markAlerts(root: HTMLElement): void {
  for (const quote of root.querySelectorAll('blockquote')) {
    const firstParagraph = quote.querySelector(':scope > p');
    const firstNode = firstParagraph?.firstChild;
    if (!firstParagraph || !firstNode || firstNode.nodeType !== Node.TEXT_NODE) continue;

    const match = ALERT_MARKER.exec(firstNode.nodeValue ?? '');
    if (!match) continue;

    const type = match[1].toLowerCase() as AlertType;
    firstNode.nodeValue = (firstNode.nodeValue ?? '').slice(match[0].length);

    // If the marker took up the whole paragraph, drop it to leave no gap.
    if (firstParagraph.childNodes.length === 1 && !(firstNode.nodeValue ?? '').trim()) {
      firstParagraph.remove();
    }

    quote.classList.add('markdown-alert', `markdown-alert--${type}`);

    const title = document.createElement('p');
    title.className = 'markdown-alert-title';
    title.innerHTML = `${ALERT_ICON[type]}<span>${t(ALERT_LABEL_KEY[type])}</span>`;
    quote.prepend(title);
  }
}

/* ------------------------------------------------------------------ */
/* Images                                                             */
/* ------------------------------------------------------------------ */

async function prepareImages(root: HTMLElement, docPath: string | null): Promise<void> {
  for (const image of root.querySelectorAll('img')) {
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');

    // With no document on disk there is no base folder: we leave the path as
    // is (that way /public images work in the demo document).
    if (!docPath) continue;

    const raw = image.getAttribute('src') ?? '';
    const resolved = resolveReference(raw, docPath);
    if (!resolved) continue;

    // We pick the first interpretation that exists on disk. If none exists
    // we keep the original path: it may be a URL from the bundle itself
    // (for example "/demo-animated.svg" served by the app).
    let found: string | null = null;
    for (const candidate of resolved.candidates) {
      if (await pathExists(candidate)) {
        found = candidate;
        break;
      }
    }
    if (!found) continue;

    image.dataset.source = found;
    image.setAttribute('src', toAssetUrl(found));
  }
}

/* ------------------------------------------------------------------ */
/* Links                                                              */
/* ------------------------------------------------------------------ */

function prepareLinks(root: HTMLElement, docPath: string | null): void {
  for (const anchor of root.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) continue;

    if (/^(https?|mailto|tel):/i.test(href)) {
      anchor.classList.add('md-link--external');
      anchor.setAttribute('rel', 'noopener noreferrer');
      continue;
    }

    // With no open file we cannot resolve relative links.
    if (!docPath) continue;

    const resolved = resolveReference(href, docPath);
    if (!resolved) continue;
    linkTargets.set(anchor, resolved.candidates);
    anchor.classList.add('md-link--local');
  }
}

/** Delegated click handler for the preview panel. */
export function handlePreviewClick(event: MouseEvent, handlers: PreviewHandlers): void {
  const anchor = (event.target as HTMLElement | null)?.closest?.('a');
  if (!anchor) return;

  const href = anchor.getAttribute('href') ?? '';
  if (!href || href.startsWith('#')) return; // internal anchors: native behavior

  event.preventDefault();

  if (/^(https?|mailto|tel):/i.test(href)) {
    void openExternal(href);
    return;
  }

  const candidates = linkTargets.get(anchor) ?? [];
  void followLocalLink(candidates, href, handlers);
}

async function followLocalLink(
  candidates: string[],
  href: string,
  handlers: PreviewHandlers,
): Promise<void> {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      if (isMarkdownPath(candidate)) handlers.onOpenFile(candidate);
      else await openPath(candidate);
      return;
    }
  }
  handlers.onMessage(t('enhance.linkNotFound', { href }), 'error');
}

/* ------------------------------------------------------------------ */
/* Code blocks                                                        */
/* ------------------------------------------------------------------ */

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>';

function isMermaidBlock(code: Element | null): boolean {
  return !!code && code.classList.contains('language-mermaid');
}

function decorateCodeBlocks(root: HTMLElement, onMessage: EnhanceOptions['onMessage']): void {
  for (const pre of root.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (isMermaidBlock(code)) continue; // diagrams are replaced further down

    const wrapper = document.createElement('div');
    wrapper.className = 'code-wrap';
    pre.replaceWith(wrapper);
    wrapper.appendChild(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.title = t('enhance.copyCode');
    button.setAttribute('aria-label', t('enhance.copyCode'));
    button.innerHTML = COPY_ICON;

    button.addEventListener('click', () => {
      void copyText((code ?? pre).textContent ?? '').then((ok) => {
        if (!ok) {
          onMessage(t('enhance.copyError'), 'error');
          return;
        }
        button.innerHTML = CHECK_ICON;
        button.classList.add('is-copied');
        setTimeout(() => {
          button.innerHTML = COPY_ICON;
          button.classList.remove('is-copied');
        }, 1200);
      });
    });

    wrapper.appendChild(button);
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* WebKit sometimes requires the classic fallback */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Mermaid diagrams                                                   */
/* ------------------------------------------------------------------ */

/**
 * Last diagram drawn successfully at each position of each document. The
 * preview is rebuilt on every edit: while a new version is drawn, or while
 * its source is half-typed and invalid, the previous one stays on screen
 * instead of flashing the source code or a parse error.
 */
const lastDiagrams = new Map<string, string>();
const LAST_DIAGRAMS_LIMIT = 100;
const STALE_NOTICE_DELAY = 900;

function rememberDiagram(key: string, svg: string): void {
  lastDiagrams.delete(key);
  lastDiagrams.set(key, svg);
  if (lastDiagrams.size > LAST_DIAGRAMS_LIMIT) {
    const oldest = lastDiagrams.keys().next().value;
    if (oldest !== undefined) lastDiagrams.delete(oldest);
  }
}

const diagramSources = new WeakMap<Element, string>();

/** Mermaid source of a rendered `.mermaid-block`. */
export function diagramSource(block: Element): string | undefined {
  return diagramSources.get(block);
}

async function renderDiagrams(root: HTMLElement, appearance: Appearance, docPath: string | null): Promise<void> {
  const blocks = Array.from(root.querySelectorAll('code.language-mermaid'));
  if (blocks.length === 0) return;

  for (const [index, code] of blocks.entries()) {
    const source = code.textContent ?? '';
    const previous = code.closest('.code-wrap') ?? code.closest('pre');
    if (!previous) continue;
    // We keep the source line for synchronized scrolling.
    const line = code.closest('pre')?.getAttribute('data-line') ?? null;
    const key = `${docPath ?? ''}#${index}`;
    const last = lastDiagrams.get(key);

    const holder = document.createElement('div');
    holder.className = 'mermaid-block';
    if (line) holder.dataset.line = line;
    diagramSources.set(holder, source);

    const stage = document.createElement('div');
    stage.className = 'mermaid-stage';
    holder.appendChild(stage);

    let ghost: HTMLPreElement | null = null;
    if (last !== undefined) {
      stage.innerHTML = last;
    } else {
      holder.classList.add('is-loading');
      holder.dataset.loading = t('enhance.diagramLoading');
      ghost = document.createElement('pre');
      ghost.className = 'mermaid-source';
      ghost.textContent = source;
      holder.appendChild(ghost);
    }

    previous.replaceWith(holder);

    try {
      const svg = await renderDiagram(source, appearance);
      if (!holder.isConnected) continue;
      stage.innerHTML = svg;
      holder.classList.remove('is-loading');
      ghost?.remove();
      rememberDiagram(key, svg);
    } catch (error) {
      if (!holder.isConnected) continue;
      const detail = error instanceof Error ? error.message : String(error);
      if (last !== undefined) {
        // Only flag it if the error outlives the keystrokes that caused it.
        window.setTimeout(() => {
          if (!holder.isConnected) return;
          holder.classList.add('is-stale');
          const note = document.createElement('p');
          note.className = 'mermaid-stale-note';
          note.textContent = t('enhance.diagramStale');
          note.title = detail;
          holder.appendChild(note);
        }, STALE_NOTICE_DELAY);
        continue;
      }
      holder.classList.remove('is-loading');
      holder.classList.add('mermaid-block--error');
      const message = document.createElement('p');
      message.className = 'mermaid-error-title';
      message.textContent = t('enhance.diagramError', { detail });
      stage.remove();
      holder.prepend(message);
    }
  }
}

/* ------------------------------------------------------------------ */

export async function enhance(root: HTMLElement, options: EnhanceOptions): Promise<void> {
  markAlerts(root);
  addHeadingAnchors(root);
  await prepareImages(root, options.docPath);
  prepareLinks(root, options.docPath);
  decorateCodeBlocks(root, options.onMessage);
  if (options.diagrams !== false) {
    await renderDiagrams(root, { theme: options.theme, palette: options.palette }, options.docPath);
  }
}
