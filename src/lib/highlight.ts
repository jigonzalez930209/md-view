/** Resaltado de sintaxis con highlight.js (subconjunto de lenguajes "common"). */

import hljs from 'highlight.js/lib/common';

/**
 * Devuelve el HTML resaltado o null si no conocemos el lenguaje (en ese caso
 * markdown-it se encarga de escaparlo como texto plano).
 */
export function highlightCode(code: string, language: string): string | null {
  const lang = language.trim().toLowerCase().split(/[\s:]/)[0];
  if (!lang || !hljs.getLanguage(lang)) return null;
  try {
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  } catch {
    return null;
  }
}
