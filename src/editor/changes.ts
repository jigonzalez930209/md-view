/**
 * Change indicator: marks in the gutter for the lines added, modified or
 * removed against a baseline (the file in git HEAD, or the last saved text).
 *
 * The diff comes from @codemirror/merge and is updated incrementally on every
 * edit, so typing stays cheap even on long documents.
 */

import { Chunk } from '@codemirror/merge';
import { RangeSet, StateEffect, StateField, Text, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';

export interface ChangeStats {
  added: number;
  modified: number;
  removed: number;
}

export const NO_CHANGES: ChangeStats = { added: 0, modified: 0, removed: 0 };

type Kind = 'added' | 'modified' | 'removed';

class ChangeMarker extends GutterMarker {
  constructor(readonly kind: Kind) {
    super();
  }

  eq(other: ChangeMarker): boolean {
    return other.kind === this.kind;
  }

  toDOM(): Node {
    const mark = document.createElement('div');
    mark.className = `cm-change cm-change-${this.kind}`;
    return mark;
  }
}

const markers: Record<Kind, ChangeMarker> = {
  added: new ChangeMarker('added'),
  modified: new ChangeMarker('modified'),
  removed: new ChangeMarker('removed'),
};

interface ChangeState {
  baseline: Text | null;
  chunks: readonly Chunk[];
  marks: RangeSet<GutterMarker>;
  stats: ChangeStats;
}

const EMPTY: ChangeState = { baseline: null, chunks: [], marks: RangeSet.empty, stats: NO_CHANGES };

/** Sets (or clears, with null) the text the document is compared against. */
export const setBaseline = StateEffect.define<string | null>();

function lineSpan(doc: Text, from: number, end: number): [number, number] {
  return [doc.lineAt(from).number, doc.lineAt(end).number];
}

function summarize(baseline: Text, doc: Text, chunks: readonly Chunk[]): ChangeState {
  const ranges = [];
  const stats = { added: 0, modified: 0, removed: 0 };

  for (const chunk of chunks) {
    const emptyA = chunk.fromA === chunk.toA;
    const emptyB = chunk.fromB === chunk.toB;
    if (emptyB) {
      // Only lines removed: flag the line that now sits where they were.
      const [first, last] = lineSpan(baseline, chunk.fromA, chunk.endA);
      stats.removed += last - first + 1;
      ranges.push(markers.removed.range(doc.lineAt(Math.min(chunk.fromB, doc.length)).from));
      continue;
    }
    const [first, last] = lineSpan(doc, chunk.fromB, chunk.endB);
    const kind: Kind = emptyA ? 'added' : 'modified';
    stats[kind] += last - first + 1;
    for (let line = first; line <= last; line += 1) ranges.push(markers[kind].range(doc.line(line).from));
  }

  return { baseline, chunks, marks: RangeSet.of(ranges, true), stats };
}

const changeField = StateField.define<ChangeState>({
  create: () => EMPTY,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setBaseline)) continue;
      if (effect.value === null) return EMPTY;
      const baseline = Text.of(effect.value.split('\n'));
      return summarize(baseline, tr.state.doc, Chunk.build(baseline, tr.state.doc));
    }
    if (!value.baseline || !tr.docChanged) return value;
    const chunks = Chunk.updateB(value.chunks, value.baseline, tr.state.doc, tr.changes);
    return summarize(value.baseline, tr.state.doc, chunks);
  },
});

/** Counts of changed lines, or null while there is no baseline. */
export function changeStats(state: EditorState): ChangeStats | null {
  const value = state.field(changeField, false);
  return value?.baseline ? value.stats : null;
}

const changeTheme = EditorView.baseTheme({
  '.cm-changeGutter .cm-gutterElement': {
    width: '3px',
    padding: '0',
    marginRight: '3px',
  },
  '.cm-change': {
    height: '100%',
  },
  '.cm-change-added': {
    backgroundColor: 'var(--success)',
  },
  '.cm-change-modified': {
    backgroundColor: 'var(--primary)',
  },
  '.cm-change-removed': {
    // A small wedge on the top edge: the lines were between this one and the previous.
    height: '0',
    width: '0',
    borderTop: '4px solid transparent',
    borderBottom: '4px solid transparent',
    borderLeft: '5px solid var(--danger)',
    transform: 'translateY(-4px)',
  },
});

export function changeIndicator(): Extension {
  return [
    changeField,
    gutter({
      class: 'cm-changeGutter',
      markers: (view) => view.state.field(changeField).marks,
    }),
    changeTheme,
  ];
}
