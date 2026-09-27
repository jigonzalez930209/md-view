import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import {
  createEditorState,
  PLAIN_LIMIT,
  reconfigureEditor,
  reconfigureTheme,
  type EditorSettings,
} from '@/editor/setup';
import { HUGE_DOC_LIMIT } from '@/lib/limits';
import { useI18n } from '@/lib/i18n-react';
import type { Theme } from '@/lib/theme';

export interface CursorPosition {
  line: number;
  column: number;
}

interface EditorProps {
  value: string;
  theme: Theme;
  fontSize: number;
  lineNumbers: boolean;
  wrap: boolean;
  onChange: (value: string) => void;
  /** En documentos enormes no se copia el texto: solo se avisa del cambio. */
  onDirty: () => void;
  captureContent: boolean;
  onCursorChange: (position: CursorPosition) => void;
  onReady: (view: EditorView) => void;
  onDestroy?: () => void;
}

function cursorPosition(view: EditorView): CursorPosition {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

/**
 * Un editor por pestana (como en VS Code): cambiar de pestana es solo
 * mostrar/ocultar, sin instalar estados ni perder scroll ni historial.
 */
export function Editor({
  value,
  theme,
  fontSize,
  lineNumbers,
  wrap,
  onChange,
  onDirty,
  captureContent,
  onCursorChange,
  onReady,
  onDestroy,
}: EditorProps) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const plain = value.length > PLAIN_LIMIT;
  const settingsRef = useRef<EditorSettings>({ fontSize, lineNumbers, wrap });
  settingsRef.current = { fontSize, lineNumbers, wrap };
  const callbacks = useRef({
    onChange,
    onDirty,
    captureContent,
    onCursorChange,
    onReady,
    onDestroy,
    ariaLabel: t('editor.ariaLabel'),
  });
  /** Ultimo texto que le pasamos a la app: comparar por referencia no copia. */
  const reportedRef = useRef<string | null>(null);

  callbacks.current = {
    onChange,
    onDirty,
    captureContent,
    onCursorChange,
    onReady,
    onDestroy,
    ariaLabel: t('editor.ariaLabel'),
  };

  // Crear la vista una sola vez por pestana.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      state: createEditorState(
        value,
        theme,
        { plain: value.length > PLAIN_LIMIT, ariaLabel: callbacks.current.ariaLabel },
        settingsRef.current,
      ),
      parent: host,
      dispatch: (transaction) => {
        view.update([transaction]);
        if (transaction.docChanged) {
          if (callbacks.current.captureContent) {
            const text = view.state.doc.toString();
            reportedRef.current = text;
            callbacks.current.onChange(text);
          } else {
            callbacks.current.onDirty();
          }
        }
        if (transaction.docChanged || transaction.selection) {
          callbacks.current.onCursorChange(cursorPosition(view));
        }
      },
    });

    viewRef.current = view;
    callbacks.current.onReady(view);

    return () => {
      viewRef.current = null;
      view.destroy();
      callbacks.current.onDestroy?.();
    };
    // Solo en el montaje: los cambios de contenido/tema van en los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios que vienen de afuera (por ejemplo al revertir o recargar el archivo).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Si es el mismo texto que le reportamos a la app no hay nada que hacer
    // (comparar por referencia evita copiar el documento entero en cada tecla).
    if (value === reportedRef.current) return;
    if (value.length > HUGE_DOC_LIMIT) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) reconfigureTheme(view, theme);
  }, [theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) reconfigureEditor(view, { fontSize, lineNumbers, wrap }, plain);
  }, [fontSize, lineNumbers, plain, wrap]);

  return <div className="h-full overflow-hidden" ref={hostRef} />;
}
