/**
 * Markdown render core: markdown-it + plugins + KaTeX + highlighting.
 *
 * This module does NOT touch the DOM, so it runs the same on the main thread
 * or in a worker. DOMPurify sanitization is done separately (it needs the
 * DOM), in `lib/markdown.ts`.
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
 * @vscode/markdown-it-katex ships as CommonJS with `exports.default`, and ESM
 * interop may return the module object instead of the function. We unwrap
 * until we find something callable.
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

/** Syntax highlighting is turned off for large documents. */
export const HIGHLIGHT_LIMIT = 300_000;

/** Internal flag: `highlight` is a global option of the instance. */
let highlightEnabled = true;

const md = new MarkdownIt({
  html: true, // allow embedded HTML (sanitized later)
  linkify: true, // bare URLs become links, like in GFM
  typographer: false, // GitHub does not replace quotes or dashes
  breaks: false, // a single newline is not <br> in a repo's .md files
  highlight: (code, language) =>
    highlightEnabled ? (highlightCode(code, language) ?? '') : '',
});

md.use(footnotePlugin);
// enabled: false => disabled checkboxes, same as on GitHub.
md.use(taskListPlugin, { enabled: false });
md.use(emojiPlugin);
md.use(katexPlugin, {
  throwOnError: false,
  enableFencedBlocks: true, // ```math ... ```
  enableMathBlockInHtml: true,
  enableMathInlineInHtml: true,
});

/**
 * Tags each block with its source line (`data-line`).
 *
 * Split-mode synchronized scroll uses these numbers to align the editor with
 * the preview, even when there are images or diagrams.
 */
function lineAnchorsPlugin(mdInstance: MarkdownItInstance): void {
  mdInstance.core.ruler.push('md_view_line_anchors', (state) => {
    for (const token of state.tokens) {
      if (token.map) token.attrSet('data-line', String(token.map[0] + 1));
    }
  });

  /** Inserts the attribute into the first tag of the block's HTML. */
  const inject = (html: string, line: string | number | null | undefined): string => {
    if (line === null || line === undefined) return html;
    return html.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-line="${line}"`);
  };

  // Blocks with their own renderer (they don't go through renderToken): fences,
  // code and the KaTeX formulas, which would otherwise be left without an
  // anchor and misalign everything.
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
  /** true for .mdx files (JSX + ESM statements). */
  mdx?: boolean;
}

/**
 * Can the source produce raw HTML? If there is no `<` in the Markdown,
 * markdown-it only generates its own tags and sanitization adds nothing: it
 * can be skipped. The check is conservative (when in doubt, sanitize).
 */
export function hasRawHtml(source: string): boolean {
  return /<[a-zA-Z!/?]/.test(source);
}

/** Markdown -> unsanitized HTML (fast and DOM-free). */
export function renderMarkdownCore(source: string, options: RenderOptions = {}): string {
  const markdown = options.mdx ? preprocessMdx(source) : source;
  highlightEnabled = markdown.length <= HIGHLIGHT_LIMIT;
  return md.render(markdown);
}

