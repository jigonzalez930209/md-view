/**
 * Post-proceso del HTML renderizado.
 *
 * markdown-it devuelve HTML "plano"; aca lo terminamos de convertir en la
 * experiencia tipo GitHub:
 *
 *  - ids + anclas en los titulos,
 *  - alertas `> [!NOTE]` / `[!TIP]` / ...,
 *  - imagenes y enlaces resueltos contra la carpeta del documento,
 *  - boton "copiar" en cada bloque de codigo,
 *  - diagramas Mermaid dibujados en el lugar del fence.
 *
 * Trabaja siempre sobre nodos del DOM ya insertados, asi que sirve tanto para
 * Markdown como para HTML embebido a mano.
 */

import { isMarkdownPath, resolveReference } from './paths';
import { openExternal, openPath, pathExists, toAssetUrl } from './backend';
import { renderDiagram } from './mermaid';
import type { Theme } from './theme';

export interface PreviewHandlers {
  docPath: string | null;
  onOpenFile: (path: string) => void;
  onMessage: (text: string, kind: 'info' | 'error') => void;
}

export interface EnhanceOptions extends PreviewHandlers {
  theme: Theme;
}

/** Rutas candidatas de cada enlace local, resueltas recien al hacer click. */
const linkTargets = new WeakMap<HTMLAnchorElement, string[]>();

/* ------------------------------------------------------------------ */
/* Titulos: id + ancla                                                 */
/* ------------------------------------------------------------------ */

/** Version simplificada del slug que usa GitHub para los anclas. */
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
/* Alertas de GitHub                                                   */
/* ------------------------------------------------------------------ */

type AlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const ALERT_MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n?/;
const ALERT_LABEL: Record<AlertType, string> = {
  note: 'Nota',
  tip: 'Tip',
  important: 'Importante',
  warning: 'Advertencia',
  caution: 'Precaucion',
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

    // Si el marcador ocupaba todo el parrafo, lo sacamos para no dejar un hueco.
    if (firstParagraph.childNodes.length === 1 && !(firstNode.nodeValue ?? '').trim()) {
      firstParagraph.remove();
    }

    quote.classList.add('markdown-alert', `markdown-alert--${type}`);

    const title = document.createElement('p');
    title.className = 'markdown-alert-title';
    title.innerHTML = `${ALERT_ICON[type]}<span>${ALERT_LABEL[type]}</span>`;
    quote.prepend(title);
  }
}

/* ------------------------------------------------------------------ */
/* Imagenes                                                            */
/* ------------------------------------------------------------------ */

function prepareImages(root: HTMLElement, docPath: string | null): void {
  for (const image of root.querySelectorAll('img')) {
    image.setAttribute('loading', 'lazy');
    image.setAttribute('decoding', 'async');

    // Sin documento en disco no hay carpeta base: dejamos la ruta tal cual
    // (asi funcionan las imagenes de /public en el documento de demo).
    if (!docPath) continue;

    const raw = image.getAttribute('src') ?? '';
    const resolved = resolveReference(raw, docPath);
    if (!resolved) continue;

    let index = 0;
    const apply = () => image.setAttribute('src', toAssetUrl(resolved.candidates[index]));

    // Si la primera interpretacion no existe, probamos la alternativa
    // (tipico en README: "/assets/x.png" relativo a la raiz del repo).
    image.addEventListener('error', () => {
      index += 1;
      if (index < resolved.candidates.length) {
        apply();
      } else {
        image.classList.add('md-image--broken');
        image.setAttribute('title', `No se encontro la imagen: ${raw}`);
      }
    });

    apply();
  }
}

/* ------------------------------------------------------------------ */
/* Enlaces                                                             */
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

    // Sin archivo abierto no podemos resolver enlaces relativos.
    if (!docPath) continue;

    const resolved = resolveReference(href, docPath);
    if (!resolved) continue;
    linkTargets.set(anchor, resolved.candidates);
    anchor.classList.add('md-link--local');
  }
}

/** Manejador de click delegado para el panel de preview. */
export function handlePreviewClick(event: MouseEvent, handlers: PreviewHandlers): void {
  const anchor = (event.target as HTMLElement | null)?.closest?.('a');
  if (!anchor) return;

  const href = anchor.getAttribute('href') ?? '';
  if (!href || href.startsWith('#')) return; // anclas internas: comportamiento nativo

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
  handlers.onMessage(`No se encontro el destino del enlace: ${href}`, 'error');
}

/* ------------------------------------------------------------------ */
/* Bloques de codigo                                                   */
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
    if (isMermaidBlock(code)) continue; // los diagramas se reemplazan mas abajo

    const wrapper = document.createElement('div');
    wrapper.className = 'code-wrap';
    pre.replaceWith(wrapper);
    wrapper.appendChild(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-copy';
    button.title = 'Copiar codigo';
    button.setAttribute('aria-label', 'Copiar codigo');
    button.innerHTML = COPY_ICON;

    button.addEventListener('click', () => {
      void copyText((code ?? pre).textContent ?? '').then((ok) => {
        if (!ok) {
          onMessage('No se pudo copiar al portapapeles.', 'error');
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
    /* WebKit a veces exige el fallback clasico */
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
/* Diagramas Mermaid                                                   */
/* ------------------------------------------------------------------ */

async function renderDiagrams(root: HTMLElement, theme: Theme): Promise<void> {
  const blocks = Array.from(root.querySelectorAll('code.language-mermaid'));
  if (blocks.length === 0) return;

  for (const code of blocks) {
    const source = code.textContent ?? '';
    const previous = code.closest('.code-wrap') ?? code.closest('pre');
    if (!previous) continue;

    const holder = document.createElement('div');
    holder.className = 'mermaid-block is-loading';

    const stage = document.createElement('div');
    stage.className = 'mermaid-stage';
    holder.appendChild(stage);

    const ghost = document.createElement('pre');
    ghost.className = 'mermaid-source';
    ghost.textContent = source;
    holder.appendChild(ghost);

    previous.replaceWith(holder);

    try {
      const svg = await renderDiagram(source, theme);
      if (!holder.isConnected) continue;
      stage.innerHTML = svg;
      holder.classList.remove('is-loading');
      ghost.remove();
    } catch (error) {
      if (!holder.isConnected) continue;
      holder.classList.remove('is-loading');
      holder.classList.add('mermaid-block--error');
      const detail = error instanceof Error ? error.message : String(error);
      const message = document.createElement('p');
      message.className = 'mermaid-error-title';
      message.textContent = `No se pudo dibujar el diagrama: ${detail}`;
      stage.remove();
      holder.prepend(message);
    }
  }
}

/* ------------------------------------------------------------------ */

export async function enhance(root: HTMLElement, options: EnhanceOptions): Promise<void> {
  markAlerts(root);
  addHeadingAnchors(root);
  prepareImages(root, options.docPath);
  prepareLinks(root, options.docPath);
  decorateCodeBlocks(root, options.onMessage);
  await renderDiagrams(root, options.theme);
}
