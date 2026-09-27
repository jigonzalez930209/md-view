/**
 * Sincronizado de scroll entre el editor y la vista previa.
 *
 * Mapear proporcionalmente (scrollTop / scrollHeight) desalinea en cuanto el
 * preview tiene imagenes, tablas o diagramas: el mismo punto del texto queda en
 * alturas distintas. En su lugar, markdown.ts marca cada bloque del preview con
 * `data-line` (su linea del fuente) y aca buscamos la linea equivalente.
 *
 * `PreviewAnchors` cachea las posiciones y se invalida cuando cambia el
 * contenido o su altura (imagenes que terminan de cargar, Mermaid, etc.).
 */

import type { EditorView } from '@codemirror/view';

interface Mark {
  /** Linea 1-based del fuente donde empieza el bloque. */
  line: number;
  /** Distancia desde el inicio del contenido del host. */
  top: number;
  /** Altura del bloque hasta el proximo (incluye margenes). */
  height: number;
  /** Cuantas lineas del fuente abarca (para interpolar). */
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

  // Ajustamos cada marca al hueco que la separa de la siguiente: asi la
  // interpolacion dentro del bloque conserva la posicion relativa.
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

/** Linea (fraccionaria) que se ve arriba de todo en la vista previa. */
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

/** Deja arriba de la vista previa la linea indicada (puede ser fraccionaria). */
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

/** Linea (fraccionaria) que se ve arriba de todo en el editor. */
export function lineAtTopOfEditor(view: EditorView): number {
  const scroller = view.scrollDOM;
  const block = view.lineBlockAtHeight(scroller.scrollTop + 1);
  const line = view.state.doc.lineAt(block.from);
  const fraction = block.height > 0 ? (scroller.scrollTop - block.top) / block.height : 0;
  return line.number + Math.min(1, Math.max(0, fraction));
}

/** Deja arriba del editor la linea indicada (puede ser fraccionaria). */
export function scrollEditorToLine(view: EditorView, line: number): void {
  const total = view.state.doc.lines;
  const clamped = Math.min(total, Math.max(1, line));
  const number = Math.floor(clamped);
  const docLine = view.state.doc.line(number);
  const block = view.lineBlockAt(docLine.from);
  const fraction = clamped - number;
  view.scrollDOM.scrollTop = Math.max(0, block.top + fraction * block.height);
}

/** Plan B cuando el preview no tiene marcas (documentos solo con HTML). */
export function syncProportional(from: HTMLElement, to: HTMLElement): void {
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  if (fromMax <= 4 || toMax <= 4) return;
  const target = Math.round((from.scrollTop / fromMax) * toMax);
  if (Math.abs(to.scrollTop - target) > 1) to.scrollTop = target;
}
