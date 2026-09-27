/**
 * Nucleo del render de Markdown: markdown-it + plugins + KaTeX + resaltado.
 *
 * Este modulo NO toca el DOM, asi que corre igual en el hilo principal o en un
 * worker. La sanitizacion con DOMPurify se hace aparte (necesita DOM), en
 * `lib/markdown.ts`.
 */

import MarkdownIt from 'markdown-it';
import type { MarkdownIt as MarkdownItInstance } from 'markdown-it';
import katexModule from '@vscode/markdown-it-katex';
import type { MarkdownKatexOptions } from '@vscode/markdown-it-katex';
import footnotePlugin from 'markdown-it-footnote';
import taskListPlugin from 'markdown-it-task-lists';
import { full as emojiPlugin } from 'markdown-it-emoji';
import { highlightCode } from './highlight';
import { preprocessMdx } from './mdx';

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

/** El resaltado de sintaxis se apaga en documentos grandes. */
export const HIGHLIGHT_LIMIT = 300_000;

/** Bandera interna: `highlight` es una opcion global de la instancia. */
let highlightEnabled = true;

const md = new MarkdownIt({
  html: true, // permitimos HTML embebido (luego se sanitiza)
  linkify: true, // URLs sueltas se vuelven enlaces, como en GFM
  typographer: false, // GitHub no reemplaza comillas ni guiones
  breaks: false, // un salto simple no es <br> en los .md de un repo
  highlight: (code, language) =>
    highlightEnabled ? (highlightCode(code, language) ?? '') : '',
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

/**
 * Marca cada bloque con su linea del fuente (`data-line`).
 *
 * El scroll sincronizado del modo dividido usa estos numeros para alinear el
 * editor con la vista previa, incluso cuando hay imagenes o diagramas.
 */
function lineAnchorsPlugin(mdInstance: MarkdownItInstance): void {
  mdInstance.core.ruler.push('md_view_line_anchors', (state) => {
    for (const token of state.tokens) {
      if (token.map) token.attrSet('data-line', String(token.map[0] + 1));
    }
  });

  /** Inserta el atributo en la primera etiqueta del HTML del bloque. */
  const inject = (html: string, line: string | number | null | undefined): string => {
    if (line === null || line === undefined) return html;
    return html.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-line="${line}"`);
  };

  // Bloques con renderer propio (no pasan por renderToken): fences, codigo y
  // las formulas de KaTeX, que si no quedarian sin ancla y desalinearian todo.
  const withCustomRenderer = ['fence', 'code_block', 'math_block', 'math_inline_block', 'math_inline_bare_block'];
  for (const type of withCustomRenderer) {
    const original = mdInstance.renderer.rules[type];
    if (!original) continue;
    mdInstance.renderer.rules[type] = (tokens, index, options, env, self) =>
      inject(original(tokens, index, options, env, self), tokens[index].attrGet('data-line'));
  }
}

md.use(lineAnchorsPlugin);

export interface RenderOptions {
  /** true para archivos .mdx (JSX + sentencias ESM). */
  mdx?: boolean;
}

/**
 * ¿El fuente puede producir HTML crudo? Si no hay ningún `<` en el Markdown,
 * markdown-it solo genera etiquetas propias y la sanitizacion no aporta: se
 * puede saltear. La comprobacion es conservadora (ante la duda, sanitizar).
 */
export function hasRawHtml(source: string): boolean {
  return /<[a-zA-Z!/?]/.test(source);
}

/** Markdown -> HTML sin sanitizar (rapido y sin DOM). */
export function renderMarkdownCore(source: string, options: RenderOptions = {}): string {
  const markdown = options.mdx ? preprocessMdx(source) : source;
  highlightEnabled = markdown.length <= HIGHLIGHT_LIMIT;
  return md.render(markdown);
}

