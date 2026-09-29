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
import { UnsavedDialog } from './components/UnsavedDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ConflictDialog } from './components/ConflictDialog';
import { RecoveryDialog } from './components/RecoveryDialog';
import { restoreWindowGeometry, trackWindowGeometry } from './lib/window-state';
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
import { applyAppearance } from './lib/theme';
import { plural, setActiveLanguage, t } from './lib/i18n';
import { I18nProvider } from './lib/i18n-react';
import { usePreferences } from './lib/prefs';
import { basename, dirname, joinPath } from './lib/paths';
import { EXPORT_FORMATS, exportDocument, type ExportFormat } from './lib/export';
import { hasDiagrams, isSimplified, previewNeedsWindow } from './lib/markdown';
import { HUGE_DOC_LIMIT, LARGE_DOC_LIMIT, PREVIEW_WINDOW_LINES, STATS_WORKER_LIMIT } from './lib/limits';
import { disposeTextWorker, headWindow, splitForWorker, textStats, type TextStats } from './lib/text-tasks';
import { isMarkdownRenderable, languageOfPath } from './lib/paths';
import { PLAIN_LIMIT } from './editor/setup';
import type { ChangeStats } from './editor/changes';
import { preloadDiagrams } from './lib/mermaid';
import { withLightPrint } from './lib/print-theme';
import type { ViewMode } from './lib/view';
import { cn } from './lib/utils';
import demoMarkdown from './demo.md?raw';

interface OpenDoc {
  /** null while the document hasn't been saved to disk yet. */
  path: string | null;
  name: string;
  eol: '\n' | '\r\n';
  bom: boolean;
  /** Encoding of the file on disk; saving keeps it. */
  encoding: backend.DocEncoding;
  /** Stamp of the file when it was read: changing it means somebody else wrote it. */
  mtimeMs: number;
  size: number;
}

/** What to do when the file changed on disk since it was read. */
type ConflictChoice = 'overwrite' | 'reload' | 'cancel';

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
  /**
   * What the change marks compare against: the file in git HEAD (with its
   * branch) or, outside a repository, the text last read from or written to disk.
   */
  baseline: { text: string; branch: string | null } | null;
  changes: ChangeStats | null;
}

interface Message {
  text: string;
  kind: 'info' | 'error';
}

const UNTITLED = 'untitled';

/** Close action waiting for the user's decision about dirty documents. */
type PendingClose = { kind: 'tab'; id: string } | { kind: 'window' };

/** Export waiting for the user to accept that only the preview window is exported. */
interface PendingExport {
  format: ExportFormat;
  target: string;
  tabId: string;
  /** Size of the document in MB, for the message. */
  mb: number;
}

/** Counts files in the tree (for the message shown when opening the folder). */
function countTreeFiles(entry: backend.TreeEntry): number {
  if (entry.kind === 'file') return 1;
  return (entry.children ?? []).reduce((total, child) => total + countTreeFiles(child), 0);
}

/**
 * Value that only changes once the user pauses typing for a moment.
 * Redrawing the preview (KaTeX, Mermaid, highlighting) on every keystroke stutters.
 */
/**
 * Debounces edits. When `key` changes (another tab) the new value goes through
 * at once, so it never pairs with the previous document.
 */
function useDebouncedValue<T>(value: T, delay: number, key?: unknown): T {
  const [debounced, setDebounced] = useState({ value, key });
  useEffect(() => {
    if (key !== debounced.key) {
      setDebounced({ value, key });
      return;
    }
    const timer = window.setTimeout(() => setDebounced({ value, key }), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay, key]);
  return debounced.key === key ? debounced.value : value;
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { preferences, update: updatePreferences, reset: resetPreferences, theme } = usePreferences();
  // Non-React modules (export, enhance, backend) use `t()`.
  setActiveLanguage(preferences.language);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [folder, setFolder] = useState<backend.FolderTree | null>(null);
  const [treeWidth, setTreeWidth] = useState(preferences.treeWidth);
  const [ratio, setRatio] = useState(preferences.splitRatio);
  const treeOpen = preferences.treeOpen;
  const [recents, setRecents] = useState<string[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [pendingClose, setPendingClose] = useState<PendingClose | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null);
  const [previewFindOpen, setPreviewFindOpen] = useState(false);
  const [recoveredDrafts, setRecoveredDrafts] = useState<backend.Draft[] | null>(null);
  const [pdfSupported, setPdfSupported] = useState(true);
  const recoveredDraftsRef = useRef<backend.Draft[] | null>(null);
  recoveredDraftsRef.current = recoveredDrafts;
  const zoomPersistTimer = useRef<number | null>(null);
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
  const deferredContent = useDebouncedValue(content, 220, activeId);

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
    messageTimer.current = window.setTimeout(() => setMessage(null), kind === 'error' ? 6000 : 3000);
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
      baseline: document.path ? { text: body, branch: null } : null,
      changes: null,
    };
  }, []);

  /** Compares against git HEAD when the file is tracked, else against `saved`. */
  const refreshBaseline = useCallback(
    async (id: string, path: string, saved: string) => {
      const git = await backend.gitBaseline(path);
      updateTab(id, { baseline: git ?? { text: saved, branch: null } });
    },
    [updateTab],
  );

  const handleChangeStats = useCallback(
    (id: string, next: ChangeStats | null) => {
      const tab = tabsRef.current.find((item) => item.id === id);
      const same =
        tab?.changes === next ||
        (tab?.changes && next && tab.changes.added === next.added && tab.changes.modified === next.modified && tab.changes.removed === next.removed);
      if (tab && !same) updateTab(id, { changes: next });
    },
    [updateTab],
  );

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
        {
          path: file.path,
          name: file.name,
          eol: file.eol,
          bom: file.bom,
          encoding: file.encoding,
          mtimeMs: file.mtimeMs,
          size: file.size,
        },
        file.content,
        inheritedMode(),
      );
      setTabs((current) => [...current, tab]);
      activeIdRef.current = tab.id;
      setActiveId(tab.id);
      if (!isSimplified(file.content) && hasDiagrams(file.content)) {
        preloadDiagrams({ theme: themeRef.current, palette: preferencesRef.current.palette });
      }
      void refreshBaseline(tab.id, file.path, file.content);
    },
    [inheritedMode, makeTab, refreshBaseline],
  );

  const openFile = useCallback(
    async (path: string) => {
      try {
        const size = await backend.documentSize(path);
        if (size > HUGE_DOC_LIMIT) {
          showMessage(t('app.openingLarge', { mb: Math.round(size / 1_000_000) }));
        }
        const file = await backend.readFile(path);
        // The preview loads images through the asset protocol: grant the folder.
        void backend.allowAsset(dirname(file.path), true);
        openDoc(file);
        setRecents(await backend.addRecent(file.path));
      } catch (error) {
        showMessage(backend.friendlyError(error), 'error');
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
      showMessage(backend.friendlyError(error), 'error');
    }
  }, [openDoc, showMessage]);

  const newDocument = useCallback(() => {
    const count = tabsRef.current.filter((tab) => tab.doc.path === null && tab.doc.name.startsWith(UNTITLED)).length;
    const name = count === 0 ? `${UNTITLED}.md` : `${UNTITLED}-${count + 1}.md`;
    const tab = makeTab(
      { path: null, name, eol: '\n', bom: false, encoding: 'utf-8', mtimeMs: 0, size: 0 },
      '',
      'split',
    );
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
    const tab = makeTab(
      { path: null, name: 'demo.md', eol: '\n', bom: false, encoding: 'utf-8', mtimeMs: 0, size: 0 },
      demoMarkdown,
      inheritedMode(),
    );
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

  /** Removes a tab (or closes the window) once the user has decided. */
  const finishClose = useCallback((pending: PendingClose) => {
    if (pending.kind === 'window') {
      // Clean exit: no drafts should be offered next time.
      void backend.clearDrafts().finally(() => backend.destroyWindow());
      return;
    }
    const list = tabsRef.current;
    const index = list.findIndex((item) => item.id === pending.id);
    const next = list.filter((item) => item.id !== pending.id);
    setTabs(next);
    if (activeIdRef.current === pending.id) {
      const neighbor = next[Math.min(index, next.length - 1)] ?? null;
      activeIdRef.current = neighbor?.id ?? null;
      setActiveId(neighbor?.id ?? null);
    }
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((item) => item.id === id);
      if (!tab) return;
      // Dirty documents go through the three-way dialog (save, discard or cancel).
      if (tab.dirty) {
        setPendingClose({ kind: 'tab', id });
        return;
      }
      finishClose({ kind: 'tab', id });
    },
    [finishClose],
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

  /** Tabs already warned about an outside change (so the message is not repeated). */
  const changedOnDisk = useRef(new Set<string>());
  const conflictResolver = useRef<((choice: ConflictChoice) => void) | null>(null);
  const [conflict, setConflict] = useState<{ name: string } | null>(null);

  /** Asks what to do when the file changed on disk; resolves with the choice. */
  const askConflict = useCallback(
    (name: string) =>
      new Promise<ConflictChoice>((resolve) => {
        conflictResolver.current = resolve;
        setConflict({ name });
      }),
    [],
  );

  const resolveConflict = useCallback((choice: ConflictChoice) => {
    setConflict(null);
    const resolve = conflictResolver.current;
    conflictResolver.current = null;
    resolve?.(choice);
  }, []);

  /** Replaces a tab with the file as it is on disk (revert). */
  const reloadTab = useCallback(
    async (id: string): Promise<boolean> => {
      const tab = tabsRef.current.find((item) => item.id === id);
      const path = tab?.doc.path;
      if (!tab || !path) return false;
      try {
        const file = await backend.readFile(path);
        // The editor gets the text before the state does, so both end up equal.
        const view = editorViews.current.get(id);
        if (view) {
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: file.content } });
        }
        const huge = file.content.length > HUGE_DOC_LIMIT;
        updateTab(id, {
          doc: {
            path: file.path,
            name: file.name,
            eol: file.eol,
            bom: file.bom,
            encoding: file.encoding,
            mtimeMs: file.mtimeMs,
            size: file.size,
          },
          content: file.content,
          dirty: false,
          window: huge ? headWindow(file.content, PREVIEW_WINDOW_LINES) : undefined,
          length: huge ? file.content.length : undefined,
          baseline: { text: file.content, branch: null },
          changes: null,
        });
        void refreshBaseline(id, path, file.content);
        changedOnDisk.current.delete(id);
        showMessage(t('app.reloaded', { name: file.name }));
        return true;
      } catch (error) {
        showMessage(backend.friendlyError(error), 'error');
        return false;
      }
    },
    [refreshBaseline, showMessage, updateTab],
  );

  /** Current text of a tab: the active one is flushed from the editor, the rest come from their own view. */
  const tabText = useCallback(
    (id: string): string => {
      if (id === activeIdRef.current) return flushContent();
      const view = editorViews.current.get(id);
      if (view) return view.state.doc.toString();
      return tabsRef.current.find((tab) => tab.id === id)?.content ?? '';
    },
    [flushContent],
  );

  /**
   * Saves one tab (any tab, not only the active one).
   * `forcePath` always asks for a new path ("Save as").
   * Returns false when the user cancels or the write fails.
   */
  const saveTab = useCallback(
    async (id: string, forcePath = false): Promise<boolean> => {
      const tab = tabsRef.current.find((item) => item.id === id);
      if (!tab) return true;
      const text = tabText(id);
      try {
        const previousPath = tab.doc.path;
        let target = previousPath;
        if (forcePath || !target) {
          target = await backend.pickSavePath(target ?? joinPath('', tab.doc.name));
        }
        if (!target) return false;
        // Somebody else may have written the file since it was read.
        if (!forcePath && previousPath === target && tab.doc.mtimeMs > 0) {
          const unchanged = await backend.documentUnchanged(
            target,
            tab.doc.mtimeMs,
            tab.doc.size,
          );
          if (!unchanged) {
            const choice = await askConflict(tab.doc.name);
            if (choice === 'cancel') return false;
            if (choice === 'reload') return reloadTab(id);
            // 'overwrite': we keep our text and write over the outside change.
          }
        }
        const nextDoc: OpenDoc = {
          path: target,
          name: basename(target),
          eol: tab.doc.eol,
          bom: tab.doc.bom,
          encoding: tab.doc.encoding,
          mtimeMs: tab.doc.mtimeMs,
          size: tab.doc.size,
        };
        const stamp = await backend.saveFile(
          {
            path: target,
            name: nextDoc.name,
            eol: nextDoc.eol,
            bom: nextDoc.bom,
            encoding: nextDoc.encoding,
            mtimeMs: nextDoc.mtimeMs,
            size: nextDoc.size,
            content: text,
          },
          text,
        );
        nextDoc.mtimeMs = stamp.mtimeMs;
        nextDoc.size = stamp.size;
        updateTab(id, { doc: nextDoc, dirty: false, content: text });
        changedOnDisk.current.delete(id);
        void refreshBaseline(id, target, text);
        if (previousPath !== target) {
          setRecents(await backend.addRecent(target));
          showMessage(t('app.savedIn', { dir: dirname(target) }));
        } else {
          showMessage(t('app.saved'));
        }
        return true;
      } catch (error) {
        showMessage(backend.friendlyError(error), 'error');
        return false;
      }
    },
    [askConflict, refreshBaseline, reloadTab, showMessage, tabText, updateTab],
  );

  const save = useCallback(async () => {
    const tab = currentTab();
    if (tab) await saveTab(tab.id);
  }, [currentTab, saveTab]);

  const saveAs = useCallback(async () => {
    const tab = currentTab();
    if (tab) await saveTab(tab.id, true);
  }, [currentTab, saveTab]);

  const reloadActiveTab = useCallback(() => {
    const id = activeIdRef.current;
    if (id) void reloadTab(id);
  }, [reloadTab]);

  /* ---------------------- closing with unsaved changes ---------------------- */

  /** Names for the dialog: the tab being closed, or every dirty tab when quitting. */
  const pendingNames = useMemo(() => {
    if (!pendingClose) return [];
    const list =
      pendingClose.kind === 'tab'
        ? tabs.filter((tab) => tab.id === pendingClose.id && tab.dirty)
        : tabs.filter((tab) => tab.dirty);
    return list.map((tab) => tab.doc.name);
  }, [pendingClose, tabs]);

  /** Save every document involved; the close continues only if all of them saved. */
  const closeSaving = async () => {
    if (!pendingClose || closeBusy) return;
    const pending = pendingClose;
    const ids =
      pending.kind === 'tab'
        ? [pending.id]
        : tabsRef.current.filter((tab) => tab.dirty).map((tab) => tab.id);
    setCloseBusy(true);
    try {
      for (const id of ids) {
        const saved = await saveTab(id);
        // The dialog stays open so the user can retry, discard or cancel.
        if (!saved) return;
      }
    } finally {
      setCloseBusy(false);
    }
    setPendingClose(null);
    finishClose(pending);
  };

  const closeDiscarding = () => {
    if (!pendingClose || closeBusy) return;
    const pending = pendingClose;
    setPendingClose(null);
    finishClose(pending);
  };

  const closeCancelled = () => {
    if (!closeBusy) setPendingClose(null);
  };

  /* ------------------------- drafts from a crash --------------------------- */

  const recoverDrafts = useCallback(() => {
    const list = recoveredDraftsRef.current ?? [];
    setRecoveredDrafts(null);
    if (list.length === 0) return;
    const restored = list.map((draft) => {
      const tab = makeTab(
        {
          path: draft.path,
          name: draft.name,
          eol: draft.eol === '\r\n' ? '\r\n' : '\n',
          bom: draft.bom,
          encoding: draft.encoding,
          mtimeMs: 0,
          size: 0,
        },
        draft.content,
        inheritedMode(),
      );
      return { ...tab, dirty: true };
    });
    setTabs((current) => [...current, ...restored]);
    const last = restored[restored.length - 1];
    activeIdRef.current = last.id;
    setActiveId(last.id);
    showMessage(plural('app.draftsRecovered', restored.length));
  }, [inheritedMode, makeTab, showMessage]);

  const discardDrafts = useCallback(() => {
    setRecoveredDrafts(null);
    void backend.clearDrafts();
  }, []);

  /** Zoom is persisted a moment after the last change (wheel fires in bursts). */
  const handleZoomChange = useCallback(
    (zoom: number) => {
      if (zoomPersistTimer.current !== null) window.clearTimeout(zoomPersistTimer.current);
      zoomPersistTimer.current = window.setTimeout(() => {
        zoomPersistTimer.current = null;
        updatePreferences({ previewZoom: zoom });
      }, 400);
    },
    [updatePreferences],
  );

  /** Closes the preview find bar and hands the focus back to the editor. */
  const closePreviewFind = useCallback(() => {
    setPreviewFindOpen(false);
    const id = activeIdRef.current;
    if (id) editorViews.current.get(id)?.focus();
  }, []);

  // The bar belongs to one document: switching tabs closes it.
  useEffect(() => {
    setPreviewFindOpen(false);
  }, [activeId]);

  // A commit, a checkout or another program touching the file: check on focus.
  useEffect(() => {
    const onFocus = () => {
      const list = tabsRef.current;
      const active = list.find((tab) => tab.id === activeIdRef.current);
      if (active?.doc.path && active.baseline?.branch) {
        void refreshBaseline(active.id, active.doc.path, active.baseline.text);
      }
      for (const tab of list) {
        const path = tab.doc.path;
        if (!path || tab.doc.mtimeMs === 0) continue;
        void backend
          .documentUnchanged(path, tab.doc.mtimeMs, tab.doc.size)
          .then((unchanged) => {
            if (unchanged) {
              changedOnDisk.current.delete(tab.id);
              return;
            }
            if (tab.dirty) {
              // Warn once; saving will ask what to do.
              if (!changedOnDisk.current.has(tab.id)) {
                changedOnDisk.current.add(tab.id);
                showMessage(t('app.changedOnDisk', { name: tab.doc.name }));
              }
              return;
            }
            // Nothing to lose: take the version on disk.
            void reloadTab(tab.id);
          })
          .catch(() => {
            /* no backend: nothing to check */
          });
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshBaseline, reloadTab, showMessage]);

  // Actions reachable from global listeners without re-subscribing.
  const toggleTree = useCallback(
    () => updatePreferences({ treeOpen: !preferencesRef.current.treeOpen }),
    [updatePreferences],
  );
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

  /* -------------------------------- effects --------------------------------- */

  useEffect(() => {
    applyAppearance(theme, preferences.palette);
    void backend.syncWindowBackground();
    // Switching theme redraws the diagrams: so scroll sync doesn't fight it.
    suppressUntil.current = performance.now() + 600;
  }, [theme, preferences.palette]);

  useEffect(() => {
    const title = doc ? `${dirty ? '● ' : ''}${doc.name} — md-view` : 'md-view';
    void backend.setWindowTitle(title);
  }, [doc, dirty]);

  // Startup: geometry, recent files, files from the command line, session and drafts.
  useEffect(() => {
    void (async () => {
      try {
        await restoreWindowGeometry();
        // Recents whose file is gone are dropped from the list.
        const stored = await backend.recentFiles();
        if (backend.isTauri) {
          const alive: string[] = [];
          for (const path of stored) {
            if (await backend.pathExists(path)) alive.push(path);
          }
          setRecents(alive);
        } else {
          setRecents(stored);
        }
        setPdfSupported(await backend.supportsPdf());
        const pending = await backend.takePendingOpen();
        for (const path of pending) await actions.current.openFile(path);
        // Session: only when the command line did not bring its own documents.
        if (pending.length === 0 && preferencesRef.current.restoreSession) {
          for (const path of preferencesRef.current.session) {
            if (await backend.pathExists(path)) await actions.current.openFile(path);
          }
        }
        // Drafts left by an unexpected exit are offered, never opened silently.
        const drafts = await backend.loadDrafts();
        if (drafts.length > 0) setRecoveredDrafts(drafts);
      } catch {
        /* no backend available: carry on with the welcome screen */
      }
    })();
  }, []);

  // Remembers the open paths so the next launch can restore the session.
  useEffect(() => {
    const paths = tabs
      .filter((tab) => tab.doc.path !== null)
      .map((tab) => tab.doc.path as string);
    const timer = window.setTimeout(() => updatePreferences({ session: paths }), 500);
    return () => window.clearTimeout(timer);
  }, [tabs, updatePreferences]);

  // Drafts: dirty documents are written after a pause, so a crash loses nothing.
  useEffect(() => {
    if (recoveredDrafts !== null) return; // waiting for the user's decision
    const timer = window.setTimeout(() => {
      const drafts = tabsRef.current
        .filter((tab) => tab.dirty && tab.window === undefined)
        .map((tab) => ({
          key: tab.doc.path ?? `untitled:${tab.doc.name}`,
          name: tab.doc.name,
          path: tab.doc.path,
          content: tab.content,
          eol: tab.doc.eol,
          bom: tab.doc.bom,
          encoding: tab.doc.encoding,
        }));
      void backend.saveDrafts(drafts);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [tabs, recoveredDrafts]);

  // Window geometry is saved when it moves or resizes.
  useEffect(() => {
    let dispose = () => {};
    void trackWindowGeometry().then((fn) => {
      dispose = fn;
    });
    return () => dispose();
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

  // Window close: drafts are cleared on a clean exit.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void backend
      .onCloseRequested(() => {
        const dirty = tabsRef.current.some((tab) => tab.dirty);
        if (!dirty) {
          if (!backend.isTauri) return false;
          // Recovered drafts are not the app's to discard: leave them for the next run.
          const clear =
            recoveredDraftsRef.current === null ? backend.clearDrafts() : Promise.resolve();
          void clear.finally(() => backend.destroyWindow());
          return true;
        }
        setPendingClose({ kind: 'window' });
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

      if (key === 'f' && !event.defaultPrevented) {
        const target = event.target as HTMLElement | null;
        // Inside the editor CodeMirror's own search wins.
        if (!target?.closest?.('.cm-editor')) {
          const active = tabsRef.current.find((tab) => tab.id === activeIdRef.current);
          if (active && active.mode !== 'edit') {
            event.preventDefault();
            setPreviewFindOpen(true);
          }
        }
        return;
      }
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

    // The new tab's HTML (and its diagrams) arrives asynchronously: until it is
    // tall enough the browser clamps the scroll, so we retry for a moment.
    const target = previewScroll.current.get(activeId) ?? 0;
    const deadline = performance.now() + 1500;
    let frame = 0;
    const restore = () => {
      const host = previewRef.current;
      if (!host) return;
      suppressUntil.current = performance.now() + 400;
      host.scrollTo({ top: target });
      if (Math.abs(host.scrollTop - target) > 1 && performance.now() < deadline) {
        frame = window.requestAnimationFrame(restore);
      }
    };
    frame = window.requestAnimationFrame(restore);
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

  const onSplitterPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const container = panesRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      setDraggingSplitter(true);
      let latest = ratio;

      const onMove = (moveEvent: PointerEvent) => {
        const next = (moveEvent.clientX - rect.left) / rect.width;
        latest = Math.min(0.85, Math.max(0.15, next));
        setRatio(latest);
      };
      const onUp = () => {
        setDraggingSplitter(false);
        // Persisted when the drag ends, not on every pointer event.
        updatePreferences({ splitRatio: latest });
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [ratio, updatePreferences],
  );

  const onTreeSplitterPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = treeWidth;
      // On the left the width grows to the right; on the right, the other way around.
      const direction = preferencesRef.current.explorerSide === 'left' ? 1 : -1;
      let latest = treeWidth;

      const onMove = (moveEvent: PointerEvent) => {
        const next = startWidth + direction * (moveEvent.clientX - startX);
        latest = Math.min(560, Math.max(180, next));
        setTreeWidth(latest);
      };
      const onUp = () => {
        updatePreferences({ treeWidth: latest });
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [treeWidth, updatePreferences],
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
      void backend.allowAsset(tree.root.path, true);
      setFolder(tree);
      updatePreferences({ treeOpen: true });
      const files = countTreeFiles(tree.root);
      showMessage(
        plural('app.folderOpened', files, { name: tree.root.name }) +
          (tree.truncated ? t('app.folderTruncated') : ''),
      );
    } catch (error) {
      showMessage(backend.friendlyError(error), 'error');
    }
  }, [showMessage, updatePreferences]);

  const refreshFolder = useCallback(async () => {
    if (!folder) return;
    try {
      setFolder(await backend.readTree(folder.root.path));
      void backend.allowAsset(folder.root.path, true);
      showMessage(t('app.folderReloaded'));    } catch (error) {
      showMessage(backend.friendlyError(error), 'error');
    }
  }, [folder, showMessage]);

  const handleTreeOpenFile = useCallback((path: string) => void openFile(path), [openFile]);
  const handleTreeRefresh = useCallback(() => void refreshFolder(), [refreshFolder]);
  const handleTreeClose = useCallback(() => updatePreferences({ treeOpen: false }), [updatePreferences]);

  /* --------------------------------- explorer -------------------------------- */

  const treePanel =
    folder && treeOpen ? (
      <>
        <div
          className="tree-splitter relative w-[5px] shrink-0 cursor-col-resize touch-none bg-background select-none before:absolute before:inset-0 before:bg-transparent before:transition-colors before:content-[''] hover:before:bg-primary focus-visible:before:bg-primary focus-visible:outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border-muted after:content-['']"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('tree.resize')}
          aria-valuenow={Math.round(treeWidth)}
          aria-valuemin={180}
          aria-valuemax={560}
          aria-valuetext={`${Math.round(treeWidth)} px`}
          tabIndex={0}
          onPointerDown={onTreeSplitterPointerDown}
          onKeyDown={(event) => {
            const direction = preferencesRef.current.explorerSide === 'left' ? 1 : -1;
            const step = (event.shiftKey ? 48 : 16) * direction;
            let next = treeWidth;
            if (event.key === 'ArrowRight') next = treeWidth + step;
            else if (event.key === 'ArrowLeft') next = treeWidth - step;
            else if (event.key === 'Home') next = 180;
            else if (event.key === 'End') next = 560;
            else return;
            event.preventDefault();
            const clamped = Math.min(560, Math.max(180, next));
            setTreeWidth(clamped);
            updatePreferences({ treeWidth: clamped });
          }}
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

  /**
   * Waits until the preview has rendered and enhanced exactly the flushed text
   * (replaces a fixed delay that could capture stale HTML in large documents).
   */
  const previewReady = useCallback(async (text: string, windowed: boolean): Promise<boolean> => {
    const expected = windowed ? headWindow(text, PREVIEW_WINDOW_LINES).length : text.length;
    const deadline = performance.now() + 5000;
    for (;;) {
      const article = previewArticleRef.current;
      if (
        article &&
        article.dataset.enhanced === 'true' &&
        Number(article.dataset.rendered) === expected
      ) {
        return true;
      }
      if (performance.now() > deadline) return false;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }, []);

  const runExport = useCallback(
    async (
      format: ExportFormat,
      target: string,
      tabId: string,
      text: string,
      partial: boolean,
    ) => {
      const info = EXPORT_FORMATS.find((item) => item.id === format);
      const tab = tabsRef.current.find((item) => item.id === tabId);
      const article = previewArticleRef.current;
      if (!info || !tab || !article) {
        showMessage(t('app.previewNotReady'), 'error');
        return;
      }

      showMessage(t('app.exporting', { label: t(info.labelKey) }));
      if (!(await previewReady(text, previewNeedsWindow(text)))) {
        showMessage(t('app.previewNotReady'), 'error');
        return;
      }

      // Captures and printing need the preview pane visible.
      const needsPreview = format !== 'html' && format !== 'txt';
      const restoreMode = needsPreview && tab.mode === 'edit' ? tab.mode : null;
      if (restoreMode) setMode('preview');

      // The PDF is exported light unless the user turns that off; only print
      // gets the light palette, the window keeps its theme.
      const palette = preferencesRef.current.palette;
      const lightPdf =
        format === 'pdf' && preferencesRef.current.pdfLight && themeRef.current !== 'light';
      const run = () =>
        exportDocument(format, article, target, {
          title: tab.doc.name,
          theme: lightPdf ? 'light' : themeRef.current,
          palette,
        });

      try {
        const result = lightPdf ? await withLightPrint(palette, article, run) : await run();
        showMessage(partial ? `${result} — ${t('export.partialNote')}` : result);
      } catch (error) {
        showMessage(backend.friendlyError(error), 'error');
      } finally {
        if (restoreMode) setMode(restoreMode);
      }
    },
    [previewReady, setMode, showMessage],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const tab = currentTab();
      const info = EXPORT_FORMATS.find((item) => item.id === format);
      if (!tab || !info) return;
      // The PDF needs the platform printer, which the menu already reflects.
      if (format === 'pdf' && !pdfSupported) {
        showMessage(t('error.unsupported', { detail: t('export.pdf.label') }), 'error');
        return;
      }
      // Flush pending changes so the preview matches what we are going to export.
      const text = flushContent();
      const article = previewArticleRef.current;
      if (!article || article.childElementCount === 0) {
        showMessage(t('app.previewNotReady'), 'error');
        return;
      }

      const base = tab.doc.name.replace(/\.[^.]+$/, '') || 'document';
      // If the document lives on disk, we export next to it.
      const suggested = tab.doc.path
        ? joinPath(dirname(tab.doc.path), `${base}.${info.extension}`)
        : `${base}.${info.extension}`;
      const target = await backend.pickSavePath(suggested, [
        { name: t(info.filterKey), extensions: [info.extension] },
        { name: t('filter.all'), extensions: ['*'] },
      ]);
      if (!target) return;

      // The preview — and therefore the export — only holds the first lines of
      // a windowed document: the partial export has to be confirmed.
      if (previewNeedsWindow(text)) {
        setPendingExport({ format, target, tabId: tab.id, mb: Math.round(text.length / 1_000_000) });
        return;
      }
      await runExport(format, target, tab.id, text, false);
    },
    [currentTab, flushContent, pdfSupported, runExport, showMessage],
  );

  const confirmExport = useCallback(() => {
    const pending = pendingExport;
    setPendingExport(null);
    if (!pending) return;
    const tab = tabsRef.current.find((item) => item.id === pending.tabId);
    if (tab) void runExport(pending.format, pending.target, tab.id, tabText(tab.id), true);
  }, [pendingExport, runExport, tabText]);

  return (
    <I18nProvider language={preferences.language}>
        <TooltipProvider>
          {/* The single column is capped to the window: no content may widen the
              shell and push the window buttons off screen. */}
          <div className="app-shell grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
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
            canReload={doc?.path != null}
            onReload={reloadActiveTab}
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
            onToggleTree={toggleTree}
            explorerSide={preferences.explorerSide}
            onExplorerSideChange={(value) => updatePreferences({ explorerSide: value })}
            onExport={(format) => void handleExport(format)}
            pdfSupported={pdfSupported}
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
                          theme={theme}
                          fontSize={preferences.editorFontSize}
                          lineNumbers={preferences.editorLineNumbers}
                          wrap={preferences.editorWrap}
                          captureContent={tab.content.length <= HUGE_DOC_LIMIT}
                          onChange={(value) => handleEditorChange(tab.id, value)}
                          onDirty={() => handleEditorDirty(tab.id)}
                          onCursorChange={(position) => handleCursorChange(tab.id, position)}
                          onReady={(view) => handleEditorReady(tab.id, view)}
                          onDestroy={() => handleEditorDestroy(tab.id)}
                          baseline={tab.baseline?.text ?? null}
                          onChangeStats={(next) => handleChangeStats(tab.id, next)}
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
                    'focus-visible:before:bg-primary focus-visible:outline-none',
                    draggingSplitter && 'before:bg-primary',
                    mode !== 'split' && 'hidden',
                  )}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t('workspace.splitter')}
                  aria-valuenow={Math.round(ratio * 100)}
                  aria-valuemin={15}
                  aria-valuemax={85}
                  aria-valuetext={`${Math.round(ratio * 100)}%`}
                  tabIndex={mode === 'split' ? 0 : -1}
                  onPointerDown={onSplitterPointerDown}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.1 : 0.02;
                    let next = ratio;
                    if (event.key === 'ArrowLeft') next = Math.max(0.15, ratio - step);
                    else if (event.key === 'ArrowRight') next = Math.min(0.85, ratio + step);
                    else if (event.key === 'Home') next = 0.15;
                    else if (event.key === 'End') next = 0.85;
                    else return;
                    event.preventDefault();
                    setRatio(next);
                    updatePreferences({ splitRatio: next });
                  }}
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
                    theme={theme}
                    palette={preferences.palette}
                    fontSize={preferences.previewFontSize}
                    initialZoom={preferences.previewZoom}
                    onZoomChange={handleZoomChange}
                    findOpen={previewFindOpen}
                    onFindChange={(open) => {
                      if (open) setPreviewFindOpen(true);
                      else closePreviewFind();
                    }}
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
            branch={activeTab?.baseline?.branch ?? null}
            changes={activeTab?.changes ?? null}
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

          <UnsavedDialog
            open={pendingClose !== null}
            names={pendingNames}
            busy={closeBusy}
            onSave={() => void closeSaving()}
            onDiscard={closeDiscarding}
            onCancel={closeCancelled}
          />

          <ConfirmDialog
            open={pendingExport !== null}
            title={t('export.partialTitle')}
            description={t('export.partialBody', {
              mb: pendingExport?.mb ?? 0,
              lines: new Intl.NumberFormat().format(PREVIEW_WINDOW_LINES),
            })}
            confirmLabel={t('export.partialConfirm')}
            onConfirm={confirmExport}
            onCancel={() => setPendingExport(null)}
          />

          <ConflictDialog
            open={conflict !== null}
            name={conflict?.name ?? ''}
            onOverwrite={() => resolveConflict('overwrite')}
            onReload={() => resolveConflict('reload')}
            onCancel={() => resolveConflict('cancel')}
          />

          <RecoveryDialog
            open={recoveredDrafts !== null}
            count={recoveredDrafts?.length ?? 0}
            onRecover={recoverDrafts}
            onDiscard={discardDrafts}
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
