/**
 * Scroll sync between the editor and the preview.
 *
 * Mapping proportionally (scrollTop / scrollHeight) drifts off as soon as the
 * preview has images, tables or diagrams: the same point of the text ends up at
 * different heights. Instead, markdown.ts tags each preview block with
 * `data-line` (its source line) and here we look for the equivalent line.
 *
 * `PreviewAnchors` caches the positions and is invalidated when the content
 * or its height changes (images finishing loading, Mermaid, etc.).
 */

import type { EditorView } from '@codemirror/view';

interface Mark {
  /** 1-based source line where the block starts. */
  line: number;
  /** Distance from the start of the host content. */
  top: number;
  /** Height of the block up to the next one (includes margins). */
  height: number;
  /** How many source lines it spans (for interpolation). */
  span: number;
}

export interface PreviewAnchors {
  dirty: boolean;
  marks: Mark[];
}

export function createPreviewAnchors(): PreviewAnchors {
  return { dirty: true, marks: [] };
}

export function invalidatePreviewAnchors(anchors: PreviewAnchors): void {
  anchors.dirty = true;
}

function collect(host: HTMLElement): Mark[] {
  const hostTop = host.getBoundingClientRect().top;
  const nodes = host.querySelectorAll<HTMLElement>('[data-line]');
  const marks: Mark[] = [];

  for (const element of nodes) {
    const rect = element.getBoundingClientRect();
    marks.push({
      line: Number(element.dataset.line),
      top: rect.top - hostTop + host.scrollTop,
      height: Math.max(1, rect.height),
      span: 1,
    });
  }

  // We adjust each mark to the gap separating it from the next one: this way
  // the interpolation inside the block keeps the relative position.
  for (let index = 0; index < marks.length; index += 1) {
    const next = marks[index + 1];
    if (next) {
      marks[index].height = Math.max(1, next.top - marks[index].top);
      marks[index].span = Math.max(1, next.line - marks[index].line);
    }
  }

  return marks;
}

function ensure(host: HTMLElement, anchors: PreviewAnchors): Mark[] {
  if (anchors.dirty || anchors.marks.length === 0) {
    anchors.marks = collect(host);
    anchors.dirty = false;
  }
  return anchors.marks;
}

/** Line (fractional) visible at the very top of the preview. */
export function lineAtTopOfPreview(host: HTMLElement, anchors: PreviewAnchors): number | null {
  const marks = ensure(host, anchors);
  if (marks.length === 0) return null;

  const scrollTop = host.scrollTop;
  for (const mark of marks) {
    if (mark.top + mark.height > scrollTop + 1) {
      const fraction = Math.min(1, Math.max(0, (scrollTop - mark.top) / mark.height));
      return mark.line + fraction * mark.span;
    }
  }
  const last = marks[marks.length - 1];
  return last.line + last.span;
}

/** Scrolls the preview so the given line is at the top (may be fractional). */
export function scrollPreviewToLine(host: HTMLElement, anchors: PreviewAnchors, line: number): boolean {
  const marks = ensure(host, anchors);
  if (marks.length === 0) return false;

  let match: Mark | null = null;
  for (const mark of marks) {
    if (mark.line <= line) match = mark;
    else break;
  }
  if (!match) {
    host.scrollTop = 0;
    return true;
  }

  const fraction = Math.min(1, Math.max(0, (line - match.line) / match.span));
  host.scrollTop = Math.max(0, match.top + fraction * match.height);
  return true;
}

/** Line (fractional) visible at the very top of the editor. */
export function lineAtTopOfEditor(view: EditorView): number {
  const scroller = view.scrollDOM;
  const block = view.lineBlockAtHeight(scroller.scrollTop + 1);
  const line = view.state.doc.lineAt(block.from);
  const fraction = block.height > 0 ? (scroller.scrollTop - block.top) / block.height : 0;
  return line.number + Math.min(1, Math.max(0, fraction));
}

/** Scrolls the editor so the given line is at the top (may be fractional). */
export function scrollEditorToLine(view: EditorView, line: number): void {
  const total = view.state.doc.lines;
  const clamped = Math.min(total, Math.max(1, line));
  const number = Math.floor(clamped);
  const docLine = view.state.doc.line(number);
  const block = view.lineBlockAt(docLine.from);
  const fraction = clamped - number;
  view.scrollDOM.scrollTop = Math.max(0, block.top + fraction * block.height);
}

/** Plan B when the preview has no marks (documents with only HTML). */
export function syncProportional(from: HTMLElement, to: HTMLElement): void {
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  if (fromMax <= 4 || toMax <= 4) return;
  const target = Math.round((from.scrollTop / fromMax) * toMax);
  if (Math.abs(to.scrollTop - target) > 1) to.scrollTop = target;
}
