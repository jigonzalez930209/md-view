/**
 * Comandos de formato Markdown para CodeMirror 6.
 *
 * Cada funcion trabaja sobre la seleccion principal (varias lineas cuando la
 * hay) y devuelve `true` si pudo aplicar el cambio, como espera `keymap`.
 * La idea es la misma que la barra de formato de GitHub: alternar marcas sin
 * obligar a escribir `**`, `#` o `- [ ]` a mano.
 */

import { redo, undo } from '@codemirror/commands';
import { EditorSelection, type ChangeSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

interface LineInfo {
  /** Posicion inicial de la linea. */
  from: number;
  /** Posicion final (sin el salto). */
  to: number;
  text: string;
}

function selectedLines(view: EditorView): LineInfo[] {
  const state = view.state;
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.to).number;
  const lines: LineInfo[] = [];
  for (let number = first; number <= last; number += 1) {
    const line = state.doc.line(number);
    lines.push({ from: line.from, to: line.to, text: line.text });
  }
  return lines;
}

/** Longitud de la sangria capturada en el grupo 1 del patron (si existe). */
function indentOf(match: RegExpExecArray): number {
  return match[1]?.length ?? 0;
}

/**
 * Alterna un prefijo de linea (`> `, `- `, `1. `...).
 *
 * `pattern` debe capturar la sangria en el grupo 1. Si todas las lineas ya
 * tienen el prefijo se quita; si no, se agrega a todas. Las lineas que
 * cumplen `skip` (por ejemplo una tarea al alternar vinetas) no se tocan.
 */
function toggleLinePrefix(
  view: EditorView,
  pattern: RegExp,
  marker: string | ((index: number) => string),
  skip?: RegExp,
): boolean {
  const entries = selectedLines(view).map((line) => ({
    line,
    skipped: skip ? skip.test(line.text) : false,
    match: skip?.test(line.text) ? null : pattern.exec(line.text),
  }));

  const active = entries.filter((entry) => !entry.skipped);
  if (active.length === 0) return false;

  const allMatch = active.every((entry) => entry.match !== null);
  const changes: ChangeSpec[] = active.map((entry, index) => {
    const text = typeof marker === 'function' ? marker(index) : marker;
    // Con la marca ya puesta (aunque no en todas las lineas) se reemplaza.
    if (entry.match) {
      return {
        from: entry.line.from + indentOf(entry.match),
        to: entry.line.from + entry.match[0].length,
        insert: allMatch ? '' : text,
      };
    }
    return { from: entry.line.from, insert: text };
  });

  view.dispatch({ changes });
  return true;
}

/* ---------------------------------- Bloques --------------------------------- */

const HEADING = /^(\s*)(#{1,6})\s+/;

/** H1 -> H2 -> H3 -> texto normal (y de nuevo H1). */
export function toggleHeading(view: EditorView): boolean {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(view)) {
    const match = HEADING.exec(line.text);
    if (!match) {
      changes.push({ from: line.from, insert: '# ' });
      continue;
    }
    const level = match[2].length;
    changes.push({
      from: line.from + match[1].length,
      to: line.from + match[0].length,
      insert: level >= 3 ? '' : `${'#'.repeat(level + 1)} `,
    });
  }
  view.dispatch({ changes });
  return true;
}

export function toggleQuote(view: EditorView): boolean {
  return toggleLinePrefix(view, /^(\s*)>\s?/, '> ');
}

export function toggleBulletList(view: EditorView): boolean {
  return toggleLinePrefix(view, /^(\s*)[-*+]\s+/, '- ', /^(\s*)[-*+]\s+\[[ xX]\]\s+/);
}

export function toggleOrderedList(view: EditorView): boolean {
  return toggleLinePrefix(view, /^(\s*)\d+[.)]\s+/, (index) => `${index + 1}. `);
}

export function toggleTaskList(view: EditorView): boolean {
  return toggleLinePrefix(view, /^(\s*)[-*+]\s+\[[ xX]\]\s+/, '- [ ] ');
}

/* ---------------------------------- En linea -------------------------------- */

/** Alterna una marca alrededor de la seleccion (`**`, `*`, `` ` ``, `~~`). */
function toggleWrap(view: EditorView, marker: string): boolean {
  const state = view.state;
  const range = state.selection.main;

  if (range.empty) {
    view.dispatch({
      changes: { from: range.from, insert: marker + marker },
      selection: EditorSelection.cursor(range.from + marker.length),
    });
    return true;
  }

  const size = marker.length;
  const text = state.sliceDoc(range.from, range.to);
  const before = state.sliceDoc(Math.max(0, range.from - size), range.from);
  const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + size));
  const wrapped = text.length >= size * 2 && text.startsWith(marker) && text.endsWith(marker);

  if (before === marker && after === marker) {
    // La marca esta fuera de la seleccion: `**texto**` con "texto" elegido.
    view.dispatch({
      changes: [
        { from: range.from - size, to: range.from, insert: '' },
        { from: range.to, to: range.to + size, insert: '' },
      ],
      selection: EditorSelection.range(range.from - size, range.to - size),
    });
  } else if (wrapped) {
    // La marca esta dentro de la seleccion: `**texto**` elegido entero.
    view.dispatch({
      changes: [
        { from: range.from, to: range.from + size, insert: '' },
        { from: range.to - size, to: range.to, insert: '' },
      ],
      selection: EditorSelection.range(range.from, range.to - size * 2),
    });
  } else {
    view.dispatch({
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker },
      ],
      selection: EditorSelection.range(range.from + size, range.to + size),
    });
  }
  return true;
}

export function toggleBold(view: EditorView): boolean {
  return toggleWrap(view, '**');
}

export function toggleItalic(view: EditorView): boolean {
  return toggleWrap(view, '*');
}

export function toggleInlineCode(view: EditorView): boolean {
  return toggleWrap(view, '`');
}

export function toggleStrikethrough(view: EditorView): boolean {
  return toggleWrap(view, '~~');
}

/** Enlace: `[texto](url)`. Deja la URL seleccionada para escribirla encima. */
export function insertLink(view: EditorView): boolean {
  const range = view.state.selection.main;
  const label = view.state.sliceDoc(range.from, range.to) || 'texto';
  const markdown = `[${label}](url)`;
  const urlFrom = range.from + label.length + 3; // despues de "]("
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: markdown },
    selection: EditorSelection.range(urlFrom, urlFrom + 3),
  });
  return true;
}

export function insertImage(view: EditorView): boolean {
  const range = view.state.selection.main;
  const alt = view.state.sliceDoc(range.from, range.to) || 'imagen';
  const markdown = `![${alt}](ruta-o-url)`;
  const urlFrom = range.from + alt.length + 4; // despues de "]("
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: markdown },
    selection: EditorSelection.range(urlFrom, urlFrom + 'ruta-o-url'.length),
  });
  return true;
}

/* -------------------------------- Estructuras ------------------------------- */

const TABLE_COLUMNS = 3;

/** Inserta una tabla GFM con la primera celda seleccionada. */
export function insertTable(view: EditorView): boolean {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const prefix = range.from > line.from ? '\n' : '';
  const suffix = range.to < line.to ? '\n' : '';

  const header = `| ${Array.from({ length: TABLE_COLUMNS }, (_, i) => `Columna ${i + 1}`).join(' | ')} |`;
  const divider = `| ${Array.from({ length: TABLE_COLUMNS }, () => '---').join(' | ')} |`;
  const body = `| ${Array.from({ length: TABLE_COLUMNS }, () => ' ').join(' | ')} |`;
  const table = `${header}\n${divider}\n${body}\n`;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `${prefix}${table}${suffix}` },
    selection: EditorSelection.range(range.from + prefix.length + 2, range.from + prefix.length + 11),
  });
  return true;
}

/** Inserta una linea horizontal (`---`) en su propia linea. */
export function insertHorizontalRule(view: EditorView): boolean {
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const prefix = range.from > line.from ? '\n' : '';
  const insert = `${prefix}---\n`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
  });
  return true;
}

/* --------------------------------- Deshacer --------------------------------- */

export function undoEdit(view: EditorView): boolean {
  return undo(view);
}

export function redoEdit(view: EditorView): boolean {
  return redo(view);
}
