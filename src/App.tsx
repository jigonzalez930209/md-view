import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { Editor, type CursorPosition } from './components/Editor';
import { Preview } from './components/Preview';
import { StatusBar } from './components/StatusBar';
import { Toolbar, type ViewMode } from './components/Toolbar';
import { Welcome } from './components/Welcome';
import * as backend from './lib/backend';
import type { Doc } from './lib/backend';
import { applyTheme, getInitialTheme, persistTheme, type Theme } from './lib/theme';
import { basename, dirname, joinPath } from './lib/paths';
import { hasDiagrams } from './lib/markdown';
import { preloadDiagrams } from './lib/mermaid';
import demoMarkdown from './demo.md?raw';

interface OpenDoc {
  /** null cuando el documento todavia no se guardo en disco. */
  path: string | null;
  name: string;
  eol: '\n' | '\r\n';
  bom: boolean;
}

interface Message {
  text: string;
  kind: 'info' | 'error';
}

export default function App() {
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [mode, setMode] = useState<ViewMode>('split');
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [ratio, setRatio] = useState(0.5);
  const [recents, setRecents] = useState<string[]>([]);
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 });
  const [message, setMessage] = useState<Message | null>(null);
  const [dropping, setDropping] = useState(false);
  const [draggingSplitter, setDraggingSplitter] = useState(false);

  const editorViewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const panesRef = useRef<HTMLElement | null>(null);
  const scrollSyncLock = useRef<'editor' | 'preview' | null>(null);
  const messageTimer = useRef<number | null>(null);

  const dirty = doc !== null && content !== savedContent;
  const unsaved = doc !== null && doc.path === null;

  /* ----------------------------- estado en refs ----------------------------- */

  const themeRef = useRef(theme);
  themeRef.current = theme;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const docRef = useRef(doc);
  docRef.current = doc;
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const showMessage = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setMessage({ text, kind });
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(null), kind === 'error' ? 8000 : 3000);
  }, []);

  /* ------------------------------- documento -------------------------------- */

  const applyDoc = useCallback(
    (file: Doc) => {
      setDoc({ path: file.path, name: file.name, eol: file.eol, bom: file.bom });
      setContent(file.content);
      setSavedContent(file.content);
      if (hasDiagrams(file.content)) preloadDiagrams(themeRef.current);

      previewRef.current?.scrollTo({ top: 0 });
      const view = editorViewRef.current;
      if (view) {
        view.dispatch({ selection: { anchor: 0 }, scrollIntoView: false });
        view.scrollDOM.scrollTop = 0;
      }
    },
    [],
  );

  const openFile = useCallback(
    async (path: string) => {
      try {
        const file = await backend.readFile(path);
        applyDoc(file);
        setRecents(await backend.addRecent(file.path));
      } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 'error');
      }
    },
    [applyDoc, showMessage],
  );

  const openFromDialog = useCallback(async () => {
    try {
      const file = await backend.pickAndRead();
      if (!file) return;
      applyDoc(file);
      setRecents(await backend.addRecent(file.path));
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [applyDoc, showMessage]);

  const newDocument = useCallback(() => {
    setDoc({ path: null, name: 'sin-titulo.md', eol: '\n', bom: false });
    setContent('');
    setSavedContent('');
    setMode((current) => (current === 'preview' ? 'split' : current));
  }, []);

  const openDemo = useCallback(() => {
    setDoc({ path: null, name: 'demo.md', eol: '\n', bom: false });
    setContent(demoMarkdown);
    setSavedContent(demoMarkdown);
  }, []);

  const save = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    // Un documento nuevo todavia no tiene ruta: pedimos una.
    if (!current.path) {
      await saveAsRef.current();
      return;
    }
    try {
      await backend.saveFile(
        { path: current.path, name: current.name, content, eol: current.eol, bom: current.bom },
        content,
      );
      setSavedContent(content);
      showMessage('Guardado');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [content, showMessage]);

  /** Referencia para que `save` pueda pedir "Guardar como" sin dependencia circular. */
  const saveAsRef = useRef<() => Promise<void>>(async () => {});

  const saveAs = useCallback(async () => {
    const current = docRef.current;
    if (!current) return;
    try {
      const suggested = current.path ?? joinPath('', current.name);
      const target = await backend.pickSavePath(suggested);
      if (!target) return;

      const next: OpenDoc = { ...current, path: target, name: basename(target) };
      await backend.saveFile(
        { path: target, name: next.name, content, eol: current.eol, bom: current.bom },
        content,
      );
      setDoc(next);
      setSavedContent(content);
      setRecents(await backend.addRecent(target));
      showMessage(`Guardado en ${dirname(target)}`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [content, showMessage]);

  // Acciones accesibles desde listeners globales sin re-suscribir.
  const actions = useRef({ openFile, openFromDialog, save, saveAs, newDocument });
  actions.current = { openFile, openFromDialog, save, saveAs, newDocument };
  saveAsRef.current = saveAs;

  /* --------------------------------- efectos -------------------------------- */

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    const title = doc ? `${dirty ? '● ' : ''}${doc.name} — md-view` : 'md-view';
    void backend.setWindowTitle(title);
  }, [doc, dirty]);

  // Arranque: lista de recientes + archivo pasado por linea de comandos.
  useEffect(() => {
    void (async () => {
      try {
        setRecents(await backend.recentFiles());
        const pending = await backend.takePendingOpen();
        if (pending.length > 0) await actions.current.openFile(pending[0]);
      } catch {
        /* sin backend disponible: seguimos con la pantalla de inicio */
      }
    })();
  }, []);

  // Otra instancia de la app pide abrir un archivo.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void backend
      .onExternalOpen(async () => {
        const pending = await backend.takePendingOpen();
        if (pending.length > 0) await actions.current.openFile(pending[0]);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // Arrastrar y soltar.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void backend
      .onDragDrop((state, paths) => {
        if (state === 'leave') {
          setDropping(false);
          return;
        }
        if (state === 'enter' || state === 'over') {
          setDropping(true);
          return;
        }
        setDropping(false);
        const first = paths.find((path) => !path.includes('://')) ?? paths[0];
        if (first) void actions.current.openFile(first);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // Cierre de la ventana con cambios sin guardar.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void backend
      .onCloseRequested(() => {
        if (!dirtyRef.current) return false;
        void (async () => {
          const discard = await backend.confirmDiscard(docRef.current?.name ?? 'El documento');
          if (discard) await backend.destroyWindow();
        })();
        return true;
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // Atajos de teclado globales.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      const key = event.key.toLowerCase();

      if (key === 's') {
        event.preventDefault();
        void (event.shiftKey ? actions.current.saveAs() : actions.current.save());
      } else if (key === 'o') {
        event.preventDefault();
        void actions.current.openFromDialog();
      } else if (key === 'n') {
        event.preventDefault();
        actions.current.newDocument();
      } else if (event.key === '1') {
        event.preventDefault();
        setMode('edit');
      } else if (event.key === '2') {
        event.preventDefault();
        setMode('split');
      } else if (event.key === '3') {
        event.preventDefault();
        setMode('preview');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // CodeMirror mide mal cuando el panel estuvo oculto (display: none).
  useEffect(() => {
    if (mode !== 'edit' && mode !== 'split') return;
    const view = editorViewRef.current;
    if (!view) return;
    const timer = window.setTimeout(() => view.requestMeasure(), 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  /* ------------------------------ scroll sync ------------------------------- */

  const syncScroll = useCallback((source: 'editor' | 'preview') => {
    if (modeRef.current !== 'split') return;
    if (scrollSyncLock.current !== null && scrollSyncLock.current !== source) return;

    const editorScroller = editorViewRef.current?.scrollDOM;
    const from = source === 'editor' ? editorScroller : previewRef.current;
    const to = source === 'editor' ? previewRef.current : editorScroller;
    if (!from || !to) return;

    const fromMax = from.scrollHeight - from.clientHeight;
    const toMax = to.scrollHeight - to.clientHeight;
    if (fromMax <= 4 || toMax <= 4) return;

    const target = Math.round((from.scrollTop / fromMax) * toMax);
    if (Math.abs(to.scrollTop - target) > 1) to.scrollTop = target;

    scrollSyncLock.current = source;
    window.requestAnimationFrame(() => {
      scrollSyncLock.current = null;
    });
  }, []);

  const handleEditorReady = useCallback(
    (view: EditorView) => {
      editorViewRef.current = view;
      view.scrollDOM.addEventListener('scroll', () => syncScroll('editor'), { passive: true });
    },
    [syncScroll],
  );

  // Estables: si cambian de identidad en cada render, el preview se vuelve a
  // renderizar (y Mermaid se redibuja) con cada tecla o movimiento del cursor.
  const handleOpenFile = useCallback((path: string) => void openFile(path), [openFile]);
  const handlePreviewScroll = useCallback(() => syncScroll('preview'), [syncScroll]);

  /* ------------------------------- separador -------------------------------- */

  const onSplitterPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = panesRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setDraggingSplitter(true);

    const onMove = (moveEvent: PointerEvent) => {
      const next = (moveEvent.clientX - rect.left) / rect.width;
      setRatio(Math.min(0.85, Math.max(0.15, next)));
    };
    const onUp = () => {
      setDraggingSplitter(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  /* --------------------------------- render --------------------------------- */

  const stats = useMemo(() => {
    const chars = content.length;
    const words = content.trim() ? (content.trim().match(/\S+/g) ?? []).length : 0;
    return { chars, words };
  }, [content]);

  // El preview va un paso atras mientras se escribe: el editor nunca se traba
  // y Mermaid no se redibuja con cada tecla.
  const deferredContent = useDeferredValue(content);

  const clearRecents = useCallback(async () => {
    setRecents(await backend.clearRecents());
  }, []);

  return (
    <div className="app">
      <Toolbar
        docName={doc?.name ?? null}
        docPath={doc?.path ?? null}
        dirty={dirty}
        mode={mode}
        theme={theme}
        recents={recents}
        onOpen={() => void openFromDialog()}
        onOpenRecent={(path) => void openFile(path)}
        onNew={newDocument}
        onSave={() => void save()}
        onSaveAs={() => void saveAs()}
        onModeChange={setMode}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        onClearRecents={() => void clearRecents()}
      />

      {doc ? (
        <main
          className="panes"
          ref={panesRef}
          data-mode={mode}
          style={
            mode === 'split'
              ? { gridTemplateColumns: `${ratio}fr 5px ${1 - ratio}fr` }
              : undefined
          }
        >
          <section className="pane pane--editor">
            <Editor
              value={content}
              docKey={doc.path ?? `nuevo:${doc.name}`}
              theme={theme}
              onChange={setContent}
              onCursorChange={setCursor}
              onReady={handleEditorReady}
            />
          </section>

          <div
            className={`splitter${draggingSplitter ? ' is-dragging' : ''}`}
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onSplitterPointerDown}
          />

          <section className="pane pane--preview">
            <Preview
              content={deferredContent}
              theme={theme}
              docPath={doc.path}
              onOpenFile={handleOpenFile}
              onMessage={showMessage}
              scrollRef={previewRef}
              onScroll={handlePreviewScroll}
            />
          </section>
        </main>
      ) : (
        <main className="panes" data-mode="preview">
          <section className="pane">
            <Welcome
              recents={recents}
              demoAvailable
              onOpen={() => void openFromDialog()}
              onOpenRecent={(path) => void openFile(path)}
              onNew={newDocument}
              onOpenDemo={openDemo}
              onClearRecents={() => void clearRecents()}
            />
          </section>
        </main>
      )}

      <StatusBar
        path={doc?.path ?? (doc ? doc.name : null)}
        hasDoc={doc !== null}
        dirty={dirty}
        unsaved={unsaved}
        cursor={cursor}
        words={stats.words}
        chars={stats.chars}
        message={message}
      />

      {dropping && (
        <div className="dropzone">
          <div>Soltá el archivo para abrirlo</div>
        </div>
      )}
    </div>
  );
}
