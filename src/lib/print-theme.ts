/**
 * Light PDF from a dark window, without touching the screen.
 *
 * The PDF is the page printed with the @media print rules, so the light
 * palette only needs to exist for print: its CSS variables go into a
 * `<style media="print">`, and Mermaid diagrams (which bake their colors into
 * the SVG) get a light copy that only print shows.
 */

import { diagramSource } from './enhance';
import { renderDiagram } from './mermaid';
import type { Palette } from './theme';

function paletteRule(palette: Palette): CSSStyleRule | null {
  const pattern = new RegExp(`data-palette=['"]?${palette}['"]?\\]\\[data-theme=['"]?light`);
  const search = (rules: CSSRuleList): CSSStyleRule | null => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && pattern.test(rule.selectorText)) return rule;
      if ('cssRules' in rule) {
        const found = search((rule as CSSGroupingRule).cssRules);
        if (found) return found;
      }
    }
    return null;
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const found = search(sheet.cssRules);
      if (found) return found;
    } catch {
      // Cross-origin sheet: not ours.
    }
  }
  return null;
}

/** CSS variables (and color-scheme) of the light variant of a palette. */
function lightVariables(palette: Palette): Record<string, string> {
  const rule = paletteRule(palette);
  const variables: Record<string, string> = {};
  if (!rule) return variables;
  for (const name of Array.from(rule.style)) {
    if (name.startsWith('--') || name === 'color-scheme') {
      variables[name] = rule.style.getPropertyValue(name).trim();
    }
  }
  return variables;
}

/**
 * Makes print use the light palette while `run` executes. The screen keeps
 * its theme the whole time.
 */
export async function withLightPrint<T>(
  palette: Palette,
  article: HTMLElement,
  run: () => Promise<T>,
): Promise<T> {
  const variables = lightVariables(palette);
  const style = document.createElement('style');
  style.media = 'print';
  // One more :root than the palette rules, so it wins over the dark ones.
  style.textContent = `:root:root[data-palette][data-theme] {${Object.entries(variables)
    .map(([name, value]) => `${name}: ${value};`)
    .join('')}}`;
  document.head.appendChild(style);

  const copies: HTMLElement[] = [];
  for (const block of Array.from(article.querySelectorAll<HTMLElement>('.mermaid-block'))) {
    const source = diagramSource(block);
    if (source === undefined) continue;
    try {
      const svg = await renderDiagram(source, { theme: 'light', palette, variables });
      const copy = document.createElement('div');
      copy.className = 'mermaid-stage mermaid-print';
      copy.innerHTML = svg;
      block.appendChild(copy);
      block.classList.add('has-print-copy');
      copies.push(copy);
    } catch {
      // Keeps the on-screen diagram in the PDF.
    }
  }

  try {
    return await run();
  } finally {
    style.remove();
    for (const copy of copies) {
      copy.parentElement?.classList.remove('has-print-copy');
      copy.remove();
    }
  }
}
