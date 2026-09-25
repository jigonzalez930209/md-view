/**
 * Pipeline de Markdown -> HTML.
 *
 * Objetivo: que se vea igual que en GitHub. Usamos markdown-it con la
 * configuracion de GFM (tablas, tachado, autolinks, listas de tareas,
 * notas al pie y emojis) mas KaTeX para las formulas.
 *
 * El HTML resultante SIEMPRE pasa por DOMPurify: un .md puede venir de
 * cualquier lado y en la app se ejecuta dentro del webview.
 */

import MarkdownIt from 'markdown-it';
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';
import type { MarkdownKatexOptions } from '@vscode/markdown-it-katex';
import footnotePlugin from 'markdown-it-footnote';
import taskListPlugin from 'markdown-it-task-lists';
import { full as emojiPlugin } from 'markdown-it-emoji';
import DOMPurify from 'dompurify';
import type { Config as PurifyConfig } from 'dompurify';
import 'katex/dist/katex.min.css';
import { highlightCode } from './highlight';

type KatexPlugin = (md: MarkdownItInstance, options?: MarkdownKatexOptions) => void;

/**
 * @vscode/markdown-it-katex se publica como CommonJS con `exports.default`, y el
 * interop de ESM puede devolver el objeto del modulo en lugar de la funcion.
 * Desenvolvemos hasta encontrar algo invocable.
 */
function unwrapPlugin<T>(module: unknown): T {
  let candidate: unknown = module;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate === 'function') return candidate as T;
    if (candidate && typeof candidate === 'object' && 'default' in candidate) {
      candidate = (candidate as { default: unknown }).default;
      continue;
    }
    break;
  }
  throw new Error('No se pudo cargar el plugin de KaTeX para markdown-it');
}

const katexPlugin = unwrapPlugin<KatexPlugin>(katexModule as unknown);

const md = new MarkdownIt({
  html: true, // permitimos HTML embebido (luego se sanitiza)
  linkify: true, // URLs sueltas se vuelven enlaces, como en GFM
  typographer: false, // GitHub no reemplaza comillas ni guiones
  breaks: false, // un salto simple no es <br> en los .md de un repo
  highlight: (code, language) => highlightCode(code, language) ?? '',
});

md.use(footnotePlugin);
// enabled: false => casillas deshabilitadas, igual que en GitHub.
md.use(taskListPlugin, { enabled: false });
md.use(emojiPlugin);
md.use(katexPlugin, {
  throwOnError: false,
  enableFencedBlocks: true, // ```math ... ```
  enableMathBlockInHtml: true,
  enableMathInlineInHtml: true,
});

const PURIFY_CONFIG: PurifyConfig = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  // <style> y compañia quedan fuera: KaTeX usa atributos style inline, que si permitimos.
  FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base'],
  FORBID_ATTR: ['srcset', 'formaction', 'ping'],
  ADD_ATTR: ['loading', 'decoding', 'align', 'aria-hidden', 'aria-label', 'role', 'target', 'rel'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

/** Markdown -> HTML sanitizado, listo para insertar en el DOM. */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source), PURIFY_CONFIG);
}

/** true si el documento tiene algun fence de Mermaid (para precargar la libreria). */
export function hasDiagrams(source: string): boolean {
  return /^[ \t]*(`{3,}|~{3,})[ \t]*mermaid\b/m.test(source);
}
