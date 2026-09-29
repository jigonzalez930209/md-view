/**
 * Find inside the rendered preview.
 *
 * Matches are wrapped in `<mark class="preview-match">` elements so they can be
 * counted, navigated and highlighted; `clearPreviewMatches` puts the text back
 * exactly as it was. SVG subtrees are skipped: an HTML element inside a Mermaid
 * diagram would break its labels.
 */

const MATCH_CLASS = 'preview-match';
const CURRENT_CLASS = 'preview-match--current';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);

/** Removes every match and restores the original text nodes. */
export function clearPreviewMatches(article: HTMLElement): void {
  article.querySelectorAll(`mark.${MATCH_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark);
    parent.normalize();
  });
}

/** Wraps every occurrence of `query`; returns how many matches were found. */
export function highlightPreview(article: HTMLElement, query: string): number {
  clearPreviewMatches(article);
  const needle = query.trim();
  if (needle.length === 0) return 0;

  const lower = needle.toLowerCase();
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      // No marks inside diagrams or inline SVG: they would not render.
      if (parent.closest('svg')) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.toLowerCase().includes(lower)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  let index = 0;
  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const pieces: Node[] = [];
    let cursor = 0;
    for (;;) {
      const at = text.toLowerCase().indexOf(lower, cursor);
      if (at < 0) break;
      if (at > cursor) pieces.push(document.createTextNode(text.slice(cursor, at)));
      const mark = document.createElement('mark');
      mark.className = MATCH_CLASS;
      mark.dataset.match = String(index);
      mark.textContent = text.slice(at, at + needle.length);
      pieces.push(mark);
      index += 1;
      cursor = at + needle.length;
    }
    if (pieces.length === 0) continue;
    const parent = node.parentNode;
    if (!parent) continue;
    pieces.forEach((piece) => parent.insertBefore(piece, node));
    parent.removeChild(node);
  }

  return index;
}

/** Marks one match as current and brings it into view. */
export function focusPreviewMatch(article: HTMLElement, index: number): void {
  article
    .querySelectorAll(`mark.${MATCH_CLASS}`)
    .forEach((mark) => mark.classList.remove(CURRENT_CLASS));
  const mark = article.querySelector(`mark.${MATCH_CLASS}[data-match="${index}"]`);
  if (!(mark instanceof HTMLElement)) return;
  mark.classList.add(CURRENT_CLASS);
  mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
