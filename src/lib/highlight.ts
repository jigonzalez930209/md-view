/** Syntax highlighting with highlight.js (the "common" languages subset). */

import hljs from 'highlight.js/lib/common';

/**
 * Returns the highlighted HTML or null if we don't know the language (in that
 * case markdown-it escapes it as plain text).
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
