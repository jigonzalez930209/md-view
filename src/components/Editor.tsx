import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import {
  createEditorState,
  PLAIN_LIMIT,
  reconfigureEditor,
  reconfigureTheme,
  type EditorSettings,
} from '@/editor/setup';
import { changeStats, setBaseline, type ChangeStats } from '@/editor/changes';
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
  /** For huge documents the text is not copied: only the change is reported. */
  onDirty: () => void;
  captureContent: boolean;
  onCursorChange: (position: CursorPosition) => void;
  onReady: (view: EditorView) => void;
  onDestroy?: () => void;
  /** Text the gutter compares against (git HEAD or last save); null hides the marks. */
  baseline: string | null;
  onChangeStats: (stats: ChangeStats | null) => void;
}

function cursorPosition(view: EditorView): CursorPosition {
  const head = view.state.selection.main.head;
  const line = view.state.doc.lineAt(head);
  return { line: line.number, column: head - line.from + 1 };
}

/**
 * One editor per tab (like in VS Code): switching tabs only shows/hides,
 * without reinstalling state or losing scroll or history.
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
  baseline,
  onChangeStats,
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
    onChangeStats,
    ariaLabel: t('editor.ariaLabel'),
  });
  /** Last text we reported to the app: comparing by reference does not copy. */
  const reportedRef = useRef<string | null>(null);

  callbacks.current = {
    onChange,
    onDirty,
    captureContent,
    onCursorChange,
    onReady,
    onDestroy,
    onChangeStats,
    ariaLabel: t('editor.ariaLabel'),
  };

  // Create the view only once per tab.
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
        const stats = changeStats(view.state);
        view.update([transaction]);
        const nextStats = changeStats(view.state);
        if (nextStats !== stats) callbacks.current.onChangeStats(nextStats);
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
    // Mount only: content/theme changes go in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changes coming from outside (for example when reverting or reloading the file).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // If it is the same text we reported to the app there is nothing to do
    // (comparing by reference avoids copying the whole document on every keystroke).
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
    if (view) view.dispatch({ effects: setBaseline.of(plain ? null : baseline) });
  }, [baseline, plain]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) reconfigureEditor(view, { fontSize, lineNumbers, wrap }, plain);
  }, [fontSize, lineNumbers, plain, wrap]);

  return <div className="h-full overflow-hidden" ref={hostRef} />;
}
