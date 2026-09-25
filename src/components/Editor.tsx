import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { createEditorState, reconfigureTheme } from '../editor/setup';
import type { Theme } from '../lib/theme';

export interface CursorPosition {
  line: number;
  column: number;
}

interface EditorProps {
  value: string;
  /** Identifica el documento abierto: al cambiar se resetea el historial. */
  docKey: string;
  theme: Theme;
  onChange: (value: string) => void;
  onCursorChange: (position: CursorPosition) => void;
  onReady: (view: EditorView) => void;
}

export function Editor({
  value,
  docKey,
  theme,
  onChange,
  onCursorChange,
  onReady,
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const callbacks = useRef({ onChange, onCursorChange, onReady });

  callbacks.current = { onChange, onCursorChange, onReady };

  // Crear la vista una sola vez.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      state: createEditorState(value, theme),
      parent: host,
      dispatch: (transaction) => {
        view.update([transaction]);
        if (transaction.docChanged) callbacks.current.onChange(view.state.doc.toString());
        if (transaction.docChanged || transaction.selection) {
          const head = view.state.selection.main.head;
          const line = view.state.doc.lineAt(head);
          callbacks.current.onCursorChange({ line: line.number, column: head - line.from + 1 });
        }
      },
    });

    viewRef.current = view;
    loadedKeyRef.current = docKey;
    callbacks.current.onReady(view);

    return () => {
      viewRef.current = null;
      view.destroy();
    };
    // Solo en el montaje: los cambios de doc/tema se manejan en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Documento distinto => estado nuevo (asi no se mezcla el historial de deshacer).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || loadedKeyRef.current === docKey) return;
    loadedKeyRef.current = docKey;
    view.setState(createEditorState(value, theme));
    callbacks.current.onCursorChange({ line: 1, column: 1 });
  }, [docKey, value, theme]);

  // Cambios que vienen de afuera (por ejemplo al revertir o recargar el archivo).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) reconfigureTheme(view, theme);
  }, [theme]);

  return <div className="editor-host" ref={hostRef} />;
}
