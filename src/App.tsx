import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from '@codemirror/view';
import { Editor, type CursorPosition } from './components/Editor';
import { FileTree } from './components/FileTree';
import { FormatBar } from './components/FormatBar';
import { HeaderBar } from './components/HeaderBar';
import { Preview } from './components/Preview';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { SettingsDialog } from './components/SettingsDialog';
import { TooltipProvider } from './components/ui/tooltip';
import { WindowResizeHandles } from './components/WindowResizeHandles';
import { Welcome } from './components/Welcome';
import * as backend from './lib/backend';
import type { Doc } from './lib/backend';
import {
  createPreviewAnchors,
  invalidatePreviewAnchors,
  lineAtTopOfEditor,
  lineAtTopOfPreview,
  scrollEditorToLine,
  scrollPreviewToLine,
  syncProportional,
} from './lib/scroll-sync';
import { applyAppearance, type Theme } from './lib/theme';
import { plural, setActiveLanguage, t } from './lib/i18n';
import { I18nProvider } from './lib/i18n-react';
import { usePreferences } from './lib/prefs';
import { basename, dirname, joinPath } from './lib/paths';
import { EXPORT_FORMATS, exportDocument, type ExportFormat } from './lib/export';
import { hasDiagrams, isSimplified } from './lib/markdown';
import { HUGE_DOC_LIMIT, LARGE_DOC_LIMIT, PREVIEW_WINDOW_LINES, STATS_WORKER_LIMIT } from './lib/limits';
import { disposeTextWorker, headWindow, splitForWorker, textStats, type TextStats } from './lib/text-tasks';
import { isMarkdownRenderable, languageOfPath } from './lib/paths';
import { PLAIN_LIMIT } from './editor/setup';
import { preloadDiagrams } from './lib/mermaid';
import type { ViewMode } from './lib/view';
import { cn } from './lib/utils';
import demoMarkdown from './demo.md?raw';

interface OpenDoc {
  /** null while the document hasn't been saved to disk yet. */
  path: string | null;
  name: string;
  eol: '\n' | '\r\n';
  bom: boolean;
}

interface Tab {
  id: string;
  doc: OpenDoc;
  content: string;
  /** true when there are changes since the last read/write on disk. */
  dirty: boolean;
  /** Huge documents: first lines for the preview plus current length. */
  window?: string;
  length?: number;
  mode: ViewMode;
  cursor: CursorPosition;
}

interface Message {
  text: string;
  kind: 'info' | 'error';
}

const UNTITLED = 'untitled';

/** Counts files in the tree (for the message shown when opening the folder). */
function countTreeFiles(entry: backend.TreeEntry): number {
  if (entry.kind === 'file') return 1;
  return (entry.children ?? []).reduce((total, child) => total + countTreeFiles(child), 0);
}

/**
 * Value that only changes once the user pauses typing for a moment.
 * Redrawing the preview (KaTeX, Mermaid, highlighting) on every keystroke stutters.
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { preferences, update: updatePreferences, reset: resetPreferences, theme } = usePreferences();
  // Non-React modules (export, enhance, backend) use `t()`.
  setActiveLanguage(preferences.language);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [folder, setFolder] = useState<backend.FolderTree | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const [treeWidth, setTreeWidth] = useState(300);
  /** Theme forced while exporting (light PDF); not persisted. */
  const [printTheme, setPrintTheme] = useState<Theme | null>(null);
  const [ratio, setRatio] = useState(0.5);
  const [recents, setRecents] = useState<string[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [dropping, setDropping] = useState(false);
  const [draggingSplitter, setDraggingSplitter] = useState(false);

  /** One CodeMirror view per tab (only visibility is toggled). */
  const editorViews = useRef(new Map<string, EditorView>());
  const editorViewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewArticleRef = useRef<HTMLElement | null>(null);
  const panesRef = useRef<HTMLElement | null>(null);
  const scrollSyncLock = useRef<{ source: 'editor' | 'preview'; until: number } | null>(null);
  const suppressUntil = useRef(0);
  const previewAnchors = useRef(createPreviewAnchors());
  const previewScroll = useRef(new Map<string, number>());
  const previousTabId = useRef<string | null>(null);
  const messageTimer = useRef<number | null>(null);
  const pendingContentTimer = useRef<number | null>(null);
  const pendingCursorTimer = useRef<number | null>(null);
  const tabSequence = useRef(0);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null;
  const doc = activeTab?.doc ?? null;
  const content = activeTab?.content ?? '';
  const mode = activeTab?.mode ?? 'preview';
  const cursor = activeTab?.cursor ?? { line: 1, column: 1 };
  const dirty = activeTab?.dirty ?? false;
  // The preview waits for the user to pause: meanwhile the editor stays
  // instant (and the layout doesn't shift under your feet).
  const deferredContent = useDebouncedValue(content, 220);

  /* ----------------------------- state in refs ------------------------------ */

  const themeRef = useRef(theme);
  themeRef.current = theme;
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const showMessage = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setMessage({ text, kind });
    if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(null), kind === 'error' ? 8000 : 3000);
  }, []);

  /* ----------------------------------- tabs ---------------------------------- */

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)));
  }, []);

  const currentTab = useCallback(
    () => tabsRef.current.find((tab) => tab.id === activeIdRef.current) ?? null,
    [],
  );

  /** Flushes pending changes and returns the current editor text. */
  const flushContent = useCallback((): string => {
    if (pendingContentTimer.current !== null) {
      window.clearTimeout(pendingContentTimer.current);
      pendingContentTimer.current = null;
    }
    const view = editorViewRef.current;
    const id = activeIdRef.current;
    if (view && id) {
      const text = view.state.doc.toString();
      updateTab(id, { content: text });
      return text;
    }
    return currentTab()?.content ?? '';
  }, [currentTab, updateTab]);


  const makeTab = useCallback((document: OpenDoc, body: string, viewMode: ViewMode): Tab => {
    tabSequence.current += 1;
    const huge = body.length > HUGE_DOC_LIMIT;
    return {
      id: `tab-${tabSequence.current}`,
      doc: document,
      content: body,
      dirty: false,
      // For huge documents we only keep the preview window: the full text
      // lives in CodeMirror and is not copied on every keystroke.
      window: huge ? headWindow(body, PREVIEW_WINDOW_LINES) : undefined,
      length: huge ? body.length : undefined,
      mode: viewMode,
      cursor: { line: 1, column: 1 },
    };
  }, []);

  /** Mode a new tab inherits: the active tab's mode. */
  const inheritedMode = useCallback((): ViewMode => {
    const active = tabsRef.current.find((tab) => tab.id === activeIdRef.current);
    return active ? active.mode : 'split';
  }, []);

  /** Opens a document: if already open, focuses its tab. */
  const openDoc = useCallback(
    (file: Doc) => {
      const existing = tabsRef.current.find((tab) => tab.doc.path === file.path);
      if (existing) {
        activeIdRef.current = existing.id;
        setActiveId(existing.id);
        return;
      }
      const tab = makeTab(
        { path: file.path, name: file.name, eol: file.eol, bom: file.bom },
        file.content,
        inheritedMode(),
      );
      setTabs((current) => [...current, tab]);
      activeIdRef.current = tab.id;
      setActiveId(tab.id);
      if (!isSimplified(file.content) && hasDiagrams(file.content)) {
        preloadDiagrams({ theme: themeRef.current, palette: preferencesRef.current.palette });
      }
    },
    [inheritedMode, makeTab],
  );

  const openFile = useCallback(
    async (path: string) => {
      try {
        const size = await backend.documentSize(path);
        if (size > HUGE_DOC_LIMIT) {
          showMessage(t('app.openingLarge', { mb: Math.round(size / 1_000_000) }));
        }
        const file = await backend.readFile(path);
        openDoc(file);
        setRecents(await backend.addRecent(file.path));
      } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 'error');
      }
    },
    [openDoc, showMessage],
  );

  const openFromDialog = useCallback(async () => {
    try {
      const file = await backend.pickAndRead();
      if (!file) return;
      openDoc(file);
      setRecents(await backend.addRecent(file.path));
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [openDoc, showMessage]);

  const newDocument = useCallback(() => {
    const count = tabsRef.current.filter((tab) => tab.doc.path === null && tab.doc.name.startsWith(UNTITLED)).length;
    const name = count === 0 ? `${UNTITLED}.md` : `${UNTITLED}-${count + 1}.md`;
    const tab = makeTab({ path: null, name, eol: '\n', bom: false }, '', 'split');
    setTabs((current) => [...current, tab]);
    activeIdRef.current = tab.id;
    setActiveId(tab.id);
  }, [makeTab]);

  const openDemo = useCallback(() => {
    const existing = tabsRef.current.find((tab) => tab.doc.path === null && tab.doc.name === 'demo.md');
    if (existing) {
      activeIdRef.current = existing.id;
      setActiveId(existing.id);
      return;
    }
    const tab = makeTab({ path: null, name: 'demo.md', eol: '\n', bom: false }, demoMarkdown, inheritedMode());
    setTabs((current) => [...current, tab]);
    activeIdRef.current = tab.id;
    setActiveId(tab.id);
  }, [inheritedMode, makeTab]);

  const selectTab = useCallback((id: string) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const cycleTab = useCallback((delta: number) => {
    const list = tabsRef.current;
    const index = list.findIndex((tab) => tab.id === activeIdRef.current);
    if (index < 0 || list.length < 2) return;
    const next = list[(index + delta + list.length) % list.length];
    activeIdRef.current = next.id;
    setActiveId(next.id);
  }, []);

  const closeTab = useCallback(
    async (id: string) => {
      const tab = tabsRef.current.find((item) => item.id === id);
      if (!tab) return;

      if (tab.dirty) {
        const discard = await backend.confirmDiscard(backend.dirtyMessage([tab.doc.name]));
        if (!discard) return;
      }

      const list = tabsRef.current;
      const index = list.findIndex((item) => item.id === id);
      const next = list.filter((item) => item.id !== id);
      setTabs(next);
      if (activeIdRef.current === id) {
        const neighbor = next[Math.min(index, next.length - 1)] ?? null;
        activeIdRef.current = neighbor?.id ?? null;
        setActiveId(neighbor?.id ?? null);
      }
    },
    [],
  );

  const closeActiveTab = useCallback(() => {
    const id = activeIdRef.current;
    if (id) void closeTab(id);
  }, [closeTab]);

  const setMode = useCallback(
    (next: ViewMode) => {
      const id = activeIdRef.current;
      if (id) updateTab(id, { mode: next });
    },
    [updateTab],
  );

  /** Refreshes the preview window straight from the editor (no full copy). */
  const refreshHugeWindow = useCallback(() => {
    const view = editorViewRef.current;
    const id = activeIdRef.current;
    if (!view || !id) return;
    const doc = view.state.doc;
    const lines = Math.min(PREVIEW_WINDOW_LINES, doc.lines);
    const end = doc.line(lines).to;
    updateTab(id, { window: doc.sliceString(0, end), length: doc.length });
  }, [updateTab]);

  /** Huge documents: we only flag changes and, after a pause, the window. */
  const handleEditorDirty = useCallback((id: string) => {
    suppressUntil.current = performance.now() + 300;
    const tab = tabsRef.current.find((item) => item.id === id);
    if (tab && !tab.dirty) updateTab(id, { dirty: true });
    if (pendingContentTimer.current !== null) window.clearTimeout(pendingContentTimer.current);
    pendingContentTimer.current = window.setTimeout(() => {
      pendingContentTimer.current = null;
      refreshHugeWindow();
    }, 600);
  }, [refreshHugeWindow, updateTab]);

  const handleEditorChange = useCallback(
    (id: string, value: string) => {
      // While typing we don't sync scroll: the preview re-renders and its
      // scroll events would move the editor all over the place.
      suppressUntil.current = performance.now() + 300;

      // For huge documents, copying the full text (10 MB) into state on every
      // keystroke is noticeable; we wait for a short pause and the editor
      // still responds because its own document already has the change.
      // The dirty flag is set right away: it doesn't depend on copying the text.
      const tab = tabsRef.current.find((item) => item.id === id);
      if (tab && !tab.dirty) updateTab(id, { dirty: true });

      if (value.length <= LARGE_DOC_LIMIT) {
        updateTab(id, { content: value });
        return;
      }
      if (pendingContentTimer.current !== null) window.clearTimeout(pendingContentTimer.current);
      pendingContentTimer.current = window.setTimeout(() => {
        pendingContentTimer.current = null;
        updateTab(id, { content: value });
      }, 120);
    },
    [updateTab],
  );

  const handleCursorChange = useCallback(
    (id: string, position: CursorPosition) => {
      const tab = tabsRef.current.find((item) => item.id === id);
      // No real change, or one already scheduled: we don't re-render the app.
      if (tab && tab.cursor.line === position.line && tab.cursor.column === position.column) return;
      if (pendingCursorTimer.current !== null) return;
      pendingCursorTimer.current = window.setTimeout(() => {
        pendingCursorTimer.current = null;
        updateTab(id, { cursor: position });
      }, 100);
    },
    [updateTab],
  );

  /* ---------------------------------- save ---------------------------------- */

  const save = useCallback(async () => {
    const tab = currentTab();
    if (!tab) return;
    const text = flushContent();
    const path = tab.doc.path;
    // A new document has no path yet: we ask for one.
    if (!path) {
      await saveAsRef.current();
      return;
    }
    try {
      await backend.saveFile(
        { path, name: tab.doc.name, eol: tab.doc.eol, bom: tab.doc.bom, content: text },
        text,
      );
      updateTab(tab.id, { dirty: false });
      showMessage(t('app.saved'));
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [currentTab, flushContent, showMessage, updateTab]);

  /** Ref so `save` can trigger "Save as" without a circular dependency. */
  const saveAsRef = useRef<() => Promise<void>>(async () => {});

  const saveAs = useCallback(async () => {
    const tab = currentTab();
    if (!tab) return;
    const text = flushContent();
    try {
      const suggested = tab.doc.path ?? joinPath('', tab.doc.name);
      const target = await backend.pickSavePath(suggested);
      if (!target) return;

      const nextDoc: OpenDoc = { path: target, name: basename(target), eol: tab.doc.eol, bom: tab.doc.bom };
      await backend.saveFile({ ...nextDoc, path: target, content: text }, text);
      updateTab(tab.id, { doc: nextDoc, dirty: false });
      setRecents(await backend.addRecent(target));
      showMessage(t('app.savedIn', { dir: dirname(target) }));
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [currentTab, flushContent, showMessage, updateTab]);

  // Actions reachable from global listeners without re-subscribing.
  const toggleTree = useCallback(() => setTreeOpen((current) => !current), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const actions = useRef({
    openFile,
    openFromDialog,
    save,
    saveAs,
    newDocument,
    closeActiveTab,
    cycleTab,
    setMode,
    toggleTree,
    openSettings,
  });
  actions.current = {
    openFile,
    openFromDialog,
    save,
    saveAs,
    newDocument,
    closeActiveTab,
    cycleTab,
    setMode,
    toggleTree,
    openSettings,
  };
  saveAsRef.current = saveAs;

  /* -------------------------------- effects --------------------------------- */

  useEffect(() => {
    applyAppearance(theme, preferences.palette);
    // Switching theme redraws the diagrams: so scroll sync doesn't fight it.
    suppressUntil.current = performance.now() + 600;
  }, [theme, preferences.palette]);

  useEffect(() => {
    const title = doc ? `${dirty ? '● ' : ''}${doc.name} — md-view` : 'md-view';
    void backend.setWindowTitle(title);
  }, [doc, dirty]);

  // Startup: recent files list + files passed on the command line.
  useEffect(() => {
    void (async () => {
      try {
        setRecents(await backend.recentFiles());
        const pending = await backend.takePendingOpen();
        for (const path of pending) await actions.current.openFile(path);
      } catch {
        /* no backend available: carry on with the welcome screen */
      }
    })();
  }, []);

  // Another instance of the app asks to open a file.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void backend
      .onExternalOpen(async () => {
        const pending = await backend.takePendingOpen();
        for (const path of pending) await actions.current.openFile(path);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // Drag and drop: each file goes to its own tab.
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
        const files = paths.filter((path) => !path.includes('://'));
        void (async () => {
          for (const path of files) await actions.current.openFile(path);
        })();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // Window close with unsaved changes (in any tab).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void backend
      .onCloseRequested(() => {
        const dirtyTabs = tabsRef.current.filter((tab) => tab.dirty);
        if (dirtyTabs.length === 0) return false;
        void (async () => {
          const discard = await backend.confirmDiscard(
            backend.dirtyMessage(dirtyTabs.map((tab) => tab.doc.name)),
          );
          if (discard) await backend.destroyWindow();
        })();
        return true;
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // Global keyboard shortcuts.
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
      } else if (key === 'n' || key === 't') {
        event.preventDefault();
        actions.current.newDocument();
      } else if (key === 'w') {
        event.preventDefault();
        actions.current.closeActiveTab();
      } else if (key === ',') {
        event.preventDefault();
        actions.current.openSettings();
      } else if (key === 'e' && event.shiftKey) {
        event.preventDefault();
        actions.current.toggleTree();
      } else if (event.key === 'Tab') {
        event.preventDefault();
        actions.current.cycleTab(event.shiftKey ? -1 : 1);
      } else if (event.key === '1') {
        event.preventDefault();
        actions.current.setMode('edit');
      } else if (event.key === '2') {
        event.preventDefault();
        actions.current.setMode('split');
      } else if (event.key === '3') {
        event.preventDefault();
        actions.current.setMode('preview');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // CodeMirror measures incorrectly when the pane has been hidden (display: none).
  useEffect(() => {
    if (!activeId || (mode !== 'edit' && mode !== 'split')) return;
    const view = editorViewRef.current;
    if (!view) return;
    const timer = window.setTimeout(() => view.requestMeasure(), 0);
    return () => window.clearTimeout(timer);
  }, [mode, activeId]);

  // The preview re-renders on every change: positions go stale.
  useEffect(() => {
    invalidatePreviewAnchors(previewAnchors.current);
  }, [deferredContent]);

  // Images loading or Mermaid finishing its render change heights.
  useEffect(() => {
    if (tabs.length === 0) return;
    const article = previewRef.current?.firstElementChild;
    if (!article) return;
    const observer = new ResizeObserver(() => invalidatePreviewAnchors(previewAnchors.current));
    observer.observe(article);
    return () => observer.disconnect();
  }, [tabs.length > 0]);

  // Remembers each tab's preview scroll without triggering sync.
  useEffect(() => {
    const previous = previousTabId.current;
    if (previous && previewRef.current) previewScroll.current.set(previous, previewRef.current.scrollTop);
    previousTabId.current = activeId;
    invalidatePreviewAnchors(previewAnchors.current);
    if (!activeId) return;

    const target = previewScroll.current.get(activeId) ?? 0;
    suppressUntil.current = performance.now() + 400;
    const frame = window.requestAnimationFrame(() => {
      previewRef.current?.scrollTo({ top: target });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeId]);

  /* ------------------------------ scroll sync ------------------------------- */

  const syncFrame = useRef<number | null>(null);
  const pendingSource = useRef<'editor' | 'preview' | null>(null);

  /**
   * Synced scroll runs at most once per frame: reading `scrollHeight`
   * forces layout and doing it on every wheel event in WebKitGTK feels jumpy.
   */
  const syncScroll = useCallback((source: 'editor' | 'preview') => {
    pendingSource.current = source;
    if (syncFrame.current !== null) return;

    syncFrame.current = window.requestAnimationFrame(() => {
      syncFrame.current = null;
      const fromSource = pendingSource.current;
      pendingSource.current = null;
      if (!fromSource || performance.now() < suppressUntil.current) return;

      const active = tabsRef.current.find((tab) => tab.id === activeIdRef.current);
      if (!active || active.mode !== 'split') return;
      if (!preferencesRef.current.previewSyncScroll) return;

      const lock = scrollSyncLock.current;
      if (lock && lock.source !== fromSource && performance.now() < lock.until) return;

      const editorScroller = editorViewRef.current?.scrollDOM;
      const previewHost = previewRef.current;
      const editorView = editorViewRef.current;
      if (!editorScroller || !previewHost || !editorView) return;

      // Blocks the echo: the scroll we trigger below doesn't sync back.
      scrollSyncLock.current = { source: fromSource, until: performance.now() + 250 };

      if (fromSource === 'editor') {
        // Align by real line; if the preview has no anchors, go proportional.
        const line = lineAtTopOfEditor(editorView);
        if (!scrollPreviewToLine(previewHost, previewAnchors.current, line)) {
          syncProportional(editorScroller, previewHost);
        }
      } else {
        const line = lineAtTopOfPreview(previewHost, previewAnchors.current);
        if (line === null) syncProportional(previewHost, editorScroller);
        else scrollEditorToLine(editorView, line);
      }
    });
  }, []);

  useEffect(
    () => () => {
      if (syncFrame.current !== null) window.cancelAnimationFrame(syncFrame.current);
      if (pendingContentTimer.current !== null) window.clearTimeout(pendingContentTimer.current);
      if (pendingCursorTimer.current !== null) window.clearTimeout(pendingCursorTimer.current);
    },
    [],
  );

  const handleEditorReady = useCallback(
    (id: string, view: EditorView) => {
      editorViews.current.set(id, view);
      view.scrollDOM.addEventListener('scroll', () => syncScroll('editor'), { passive: true });
      if (activeIdRef.current === id) {
        editorViewRef.current = view;
        view.requestMeasure();
      }
    },
    [syncScroll],
  );

  const handleEditorDestroy = useCallback((id: string) => {
    editorViews.current.delete(id);
    if (activeIdRef.current === id) editorViewRef.current = null;
  }, []);

  // The active view rules: scroll sync, saving and export all use it.
  useEffect(() => {
    if (!activeId) {
      editorViewRef.current = null;
      return;
    }
    const view = editorViews.current.get(activeId) ?? null;
    editorViewRef.current = view;
    view?.requestMeasure();
  }, [activeId, tabs]);

  // Stable: if their identity changed on every render, the preview would
  // re-render (and Mermaid redraw) on every keystroke or cursor move.
  const tabSignature = tabs.map((tab) => `${tab.id}:${tab.dirty ? 1 : 0}:${tab.doc.name}`).join('|');
  const tabInfos = useMemo(
    () =>
      tabs.map((tab) => ({
        id: tab.id,
        name: tab.doc.name,
        path: tab.doc.path,
        dirty: tab.dirty,
      })),
    // Content changes on every keystroke; tabs only depend on this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tabSignature],
  );
  const handleTabClose = useCallback((id: string) => void closeTab(id), [closeTab]);
  const handleOpenFile = useCallback((path: string) => void openFile(path), [openFile]);
  const handlePreviewScroll = useCallback(() => syncScroll('preview'), [syncScroll]);

  /* -------------------------------- splitter -------------------------------- */

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

  const onTreeSplitterPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = treeWidth;
      // On the left the width grows to the right; on the right, the other way around.
      const direction = preferencesRef.current.explorerSide === 'left' ? 1 : -1;

      const onMove = (moveEvent: PointerEvent) => {
        const next = startWidth + direction * (moveEvent.clientX - startX);
        setTreeWidth(Math.min(560, Math.max(180, next)));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [treeWidth],
  );

  /* --------------------------------- render --------------------------------- */

  // Counts run on a debounced value: scanning a huge document on every
  // keystroke is very expensive. When large, the work is dispatched to a worker.
  const statsContent = useDebouncedValue(content, 400);
  const [stats, setStats] = useState<TextStats>({ words: 0, lines: 1, chars: 0 });
  /** Counts already computed per document: switching tabs doesn't recompute. */
  const statsCache = useRef(new Map<string, { text: string; stats: TextStats }>());

  useEffect(() => {
    let cancelled = false;
    const id = activeIdRef.current ?? '';
    const cached = statsCache.current.get(id);
    if (cached && cached.text === statsContent) {
      setStats(cached.stats);
      return;
    }

    if (statsContent.length <= STATS_WORKER_LIMIT) {
      let words = 0;
      let lines = 1;
      let inWord = false;
      for (let index = 0; index < statsContent.length; index += 1) {
        const code = statsContent.charCodeAt(index);
        if (code === 10) lines += 1;
        const space = code === 32 || code === 10 || code === 9 || code === 13;
        if (space) {
          inWord = false;
        } else if (!inWord) {
          words += 1;
          inWord = true;
        }
      }
      const computed = { words, lines, chars: statsContent.length };
      statsCache.current.set(id, { text: statsContent, stats: computed });
      setStats(computed);
      return;
    }

    void textStats(splitForWorker(statsContent)).then((result) => {
      if (cancelled || !result) return;
      statsCache.current.set(id, { text: statsContent, stats: result });
      setStats(result);
    });
    return () => {
      cancelled = true;
    };
  }, [statsContent]);

  // With no documents open there's no need to keep the worker alive.
  useEffect(() => {
    if (tabs.length === 0) disposeTextWorker();
  }, [tabs.length]);

  const clearRecents = useCallback(async () => {
    setRecents(await backend.clearRecents());
  }, []);

  /* --------------------------------- folders --------------------------------- */

  const openFolder = useCallback(async () => {
    try {
      const tree = await backend.pickFolder();
      if (!tree) return;
      setFolder(tree);
      setTreeOpen(true);
      const files = countTreeFiles(tree.root);
      showMessage(
        plural('app.folderOpened', files, { name: tree.root.name }) +
          (tree.truncated ? t('app.folderTruncated') : ''),
      );
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [showMessage]);

  const refreshFolder = useCallback(async () => {
    if (!folder) return;
    try {
      setFolder(await backend.readTree(folder.root.path));
      showMessage(t('app.folderReloaded'));
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    }
  }, [folder, showMessage]);

  const handleTreeOpenFile = useCallback((path: string) => void openFile(path), [openFile]);
  const handleTreeRefresh = useCallback(() => void refreshFolder(), [refreshFolder]);
  const handleTreeClose = useCallback(() => setTreeOpen(false), []);

  /* --------------------------------- explorer -------------------------------- */

  const treePanel =
    folder && treeOpen ? (
      <>
        <div
          className="tree-splitter relative w-[5px] shrink-0 cursor-col-resize touch-none bg-background select-none before:absolute before:inset-0 before:bg-transparent before:transition-colors before:content-[''] hover:before:bg-primary after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border-muted after:content-['']"
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onTreeSplitterPointerDown}
        />
        <FileTree
          tree={folder}
          activePath={doc?.path ?? null}
          width={treeWidth}
          onOpenFile={handleTreeOpenFile}
          onRefresh={handleTreeRefresh}
          onClose={handleTreeClose}
        />
      </>
    ) : null;

  /* --------------------------------- export --------------------------------- */


  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const tab = currentTab();
      const article = previewArticleRef.current;
      const info = EXPORT_FORMATS.find((item) => item.id === format);
      if (!tab || !info) return;
      if (!article || article.childElementCount === 0) {
        showMessage(t('app.previewNotReady'), 'error');
        return;
      }

      const base = tab.doc.name.replace(/\.[^.]+$/, '') || 'documento';
      // If the document lives on disk, we export next to it.
      const suggested = tab.doc.path
        ? joinPath(dirname(tab.doc.path), `${base}.${info.extension}`)
        : `${base}.${info.extension}`;
      const target = await backend.pickSavePath(suggested, [
        { name: t(info.filterKey), extensions: [info.extension] },
        { name: t('filter.all'), extensions: ['*'] },
      ]);
      if (!target) return;

      showMessage(t('app.exporting', { label: t(info.labelKey) }));
      // Flush pending changes and let the preview rebuild.
      flushContent();
      await new Promise((resolve) => window.setTimeout(resolve, 260));

      // Captures and printing need the preview pane visible.
      const needsPreview = format !== 'html' && format !== 'txt';
      const restoreMode = needsPreview && tab.mode === 'edit' ? tab.mode : null;
      if (restoreMode) setMode('preview');

      // The PDF is exported light unless the user turns that off.
      const lightPdf = format === 'pdf' && preferencesRef.current.pdfLight && themeRef.current !== 'light';
      if (lightPdf) {
        applyAppearance('light', preferencesRef.current.palette);
        setPrintTheme('light');
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }

      try {
        const result = await exportDocument(format, article, target, {
          title: tab.doc.name,
          theme: lightPdf ? 'light' : themeRef.current,
          palette: preferencesRef.current.palette,
        });
        showMessage(result);
      } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 'error');
      } finally {
        if (lightPdf) {
          setPrintTheme(null);
          applyAppearance(themeRef.current, preferencesRef.current.palette);
        }
        if (restoreMode) setMode(restoreMode);
      }
    },
    [currentTab, flushContent, setMode, showMessage],
  );

  return (
    <I18nProvider language={preferences.language}>
        <TooltipProvider>
          <div className="app-shell grid h-full grid-rows-[auto_minmax(0,1fr)_auto]">
          <HeaderBar
            docName={doc?.name ?? null}
            docPath={doc?.path ?? null}
            dirty={dirty}
            words={stats.words}
            chars={activeTab?.length ?? content.length}
            eol={doc?.eol ?? '\n'}
            bom={doc?.bom ?? false}
            mode={mode}
            themeMode={preferences.themeMode}
            palette={preferences.palette}
            recents={recents}
            canCloseTab={tabs.length > 0}
            hasTabs={tabs.length > 0}
            onOpen={() => void openFromDialog()}
            onOpenRecent={(path) => void openFile(path)}
            onNewTab={newDocument}
            onSave={() => void save()}
            onSaveAs={() => void saveAs()}
            onCloseTab={closeActiveTab}
            onModeChange={setMode}
            onThemeModeChange={(value) => updatePreferences({ themeMode: value })}
            onPaletteChange={(value) => updatePreferences({ palette: value })}
            pdfLight={preferences.pdfLight}
            onPdfLightChange={(value) => updatePreferences({ pdfLight: value })}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenFolder={() => void openFolder()}
            treeOpen={treeOpen}
            canToggleTree={folder !== null}
            onToggleTree={() => setTreeOpen((current) => !current)}
            explorerSide={preferences.explorerSide}
            onExplorerSideChange={(value) => updatePreferences({ explorerSide: value })}
            onExport={(format) => void handleExport(format)}
            onClearRecents={() => void clearRecents()}
          />

          <div className="workspace-row row-start-2 flex min-h-0">
            {preferences.explorerSide === 'left' && treePanel}

            {/* With the explorer open, tabs live next to it (the panel reaches up to the title bar). */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {tabs.length > 0 && activeTab ? (
                <>
                  <TabBar
                    tabs={tabInfos}
                    activeId={activeId}
                    onSelect={selectTab}
                    onClose={handleTabClose}
                  />

                  <main
                className="workspace grid min-h-0 flex-1 gap-px bg-border-muted"
                ref={panesRef}
                style={
                  mode === 'split'
                    ? { gridTemplateColumns: `${ratio}fr 5px ${1 - ratio}fr` }
                    : undefined
                }
              >
                <section
                  className={cn(
                    'pane-editor flex min-h-0 min-w-0 flex-col overflow-hidden bg-background',
                    mode === 'preview' && 'hidden',
                  )}
                >
                  {isMarkdownRenderable(doc?.path ?? null) ? (
                    <FormatBar viewRef={editorViewRef} />
                  ) : (
                    <div className="flex h-10 shrink-0 items-center border-b bg-card px-3 text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase select-none">
                      {t('editor.code')}
                      {languageOfPath(doc?.path ?? null)
                        ? ` · ${languageOfPath(doc?.path ?? null)}`
                        : ''}
                    </div>
                  )}
                  {content.length > PLAIN_LIMIT && (
                    <div className="border-b bg-card px-3 py-1 text-[11.5px] text-muted-foreground select-none">
                      {t('app.editorPlainNote')}
                    </div>
                  )}
                  <div className="relative min-h-0 flex-1">
                    {tabs.map((tab) => (
                      <div
                        key={tab.id}
                        className={cn('absolute inset-0', tab.id !== activeTab.id && 'invisible')}
                        aria-hidden={tab.id !== activeTab.id}
                      >
                        <Editor
                          value={tab.content}
                          theme={printTheme ?? theme}
                          fontSize={preferences.editorFontSize}
                          lineNumbers={preferences.editorLineNumbers}
                          wrap={preferences.editorWrap}
                          captureContent={tab.content.length <= HUGE_DOC_LIMIT}
                          onChange={(value) => handleEditorChange(tab.id, value)}
                          onDirty={() => handleEditorDirty(tab.id)}
                          onCursorChange={(position) => handleCursorChange(tab.id, position)}
                          onReady={(view) => handleEditorReady(tab.id, view)}
                          onDestroy={() => handleEditorDestroy(tab.id)}
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <div
                  className={cn(
                    'pane-splitter relative cursor-col-resize touch-none bg-background select-none',
                    "before:absolute before:inset-0 before:bg-transparent before:transition-colors before:content-['']",
                    'hover:before:bg-primary',
                    draggingSplitter && 'before:bg-primary',
                    mode !== 'split' && 'hidden',
                  )}
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={onSplitterPointerDown}
                />

                <section
                  className={cn(
                    'pane-preview flex min-h-0 min-w-0 flex-col overflow-hidden bg-background',
                    mode === 'edit' && 'hidden',
                  )}
                >
                  <Preview
                    content={activeTab.window ?? deferredContent}
                    windowed={activeTab.window !== undefined}
                    totalLength={activeTab.length ?? content.length}
                    theme={printTheme ?? theme}
                    palette={preferences.palette}
                    fontSize={preferences.previewFontSize}
                    docPath={doc?.path ?? null}
                    onOpenFile={handleOpenFile}
                    onMessage={showMessage}
                    scrollRef={previewRef}
                    contentRef={previewArticleRef}
                    onScroll={handlePreviewScroll}
                  />
                </section>
                  </main>
                </>
              ) : (
                <main className="workspace grid min-h-0 flex-1">
                  <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-background">
                    <Welcome
                      recents={preferences.showRecents ? recents : []}
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
            </div>

            {preferences.explorerSide === 'right' && treePanel}
          </div>

          <StatusBar
            path={doc?.path ?? (doc ? doc.name : null)}
            hasDoc={doc !== null}
            dirty={dirty}
            unsaved={doc !== null && doc.path === null}
            cursor={cursor}
            words={stats.words}
            chars={activeTab?.length ?? content.length}
            message={message}
          />

          <SettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            preferences={preferences}
            onChange={updatePreferences}
            onReset={resetPreferences}
            onClearRecents={() => void clearRecents()}
            recentsCount={recents.length}
          />

          <WindowResizeHandles />

          {dropping && (
            <div className="pointer-events-none fixed inset-0 z-100 flex items-center justify-center bg-background/80 backdrop-blur-[2px] select-none">
              <div className="rounded-xl border-2 border-dashed border-primary bg-background px-5.5 py-3.5 text-sm font-medium text-primary">
                {t('app.dropToOpen')}
              </div>
            </div>
          )}
        </div>
      </TooltipProvider>
      </I18nProvider>
  );
}
