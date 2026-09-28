/**
 * Fake Tauri runtime for the layout probe (probe.mjs).
 *
 * Injected before the app loads (Playwright `addInitScript`). It makes
 * `isTauri` true so the frontend lays itself out exactly like the desktop
 * build: same tabs, same paths, same menus. The video itself is recorded from
 * the real app; this only measures where things are.
 */
(() => {
  const config = window.__PROMO__ ?? { files: {}, open: [], prefs: {} };
  localStorage.setItem('md-view:prefs', JSON.stringify(config.prefs));
  localStorage.removeItem('md-view:recents');

  const files = new Map(Object.entries(config.files));
  let pending = [...config.open];
  let nextId = 1;
  const callbacks = new Map();

  const doc = (path) => ({
    path,
    name: path.split('/').pop(),
    content: files.get(path) ?? '',
    eol: '\n',
    bom: false,
  });

  /** Same shape and order as read_tree in src-tauri: folders first, then by name. */
  const tree = (root) => {
    const make = (path, name) => ({ name, path, kind: 'dir', isText: true, size: 0, children: [] });
    const top = make(root, root.split('/').pop());
    const dirs = new Map([[root, top]]);
    for (const [path, body] of files) {
      if (!path.startsWith(`${root}/`)) continue;
      const parts = path.slice(root.length + 1).split('/');
      let parent = top;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = `${root}/${parts.slice(0, i + 1).join('/')}`;
        if (!dirs.has(key)) {
          dirs.set(key, make(key, parts[i]));
          parent.children.push(dirs.get(key));
        }
        parent = dirs.get(key);
      }
      parent.children.push({ name: parts.at(-1), path, kind: 'file', isText: true, size: body.length });
    }
    const sort = (entry) => {
      entry.children?.sort((a, b) => (a.kind === b.kind ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.kind === 'dir' ? -1 : 1));
      entry.children?.forEach(sort);
    };
    sort(top);
    return { root: top, truncated: false };
  };

  const commands = {
    'plugin:dialog|open': () => config.folder ?? null,
    read_tree: ({ path }) => tree(path),
    git_baseline: ({ path }) => config.git?.[path] ?? null,
    take_pending_open: () => {
      const list = pending;
      pending = [];
      return list;
    },
    read_document: ({ path }) => doc(path),
    document_size: ({ path }) => (files.get(path) ?? '').length,
    path_exists: ({ path }) => files.has(path),
    get_recents: () => [],
    push_recent: ({ path }) => [path],
    clear_recents: () => [],
    write_document: () => null,
    export_pdf: () => new Promise((resolve) => setTimeout(() => resolve(null), 150)),
    'plugin:dialog|save': ({ options }) => options?.defaultPath ?? null,
    'plugin:window|is_maximized': () => false,
    'plugin:event|listen': () => nextId++,
    'plugin:event|unlisten': () => null,
  };

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    },
    plugins: { path: { sep: '/', delimiter: ':' } },
    invoke: async (cmd, args = {}) => {
      const handler = commands[cmd];
      return handler ? handler(args) : null;
    },
    transformCallback: (callback, once = false) => {
      const id = nextId++;
      callbacks.set(id, (data) => {
        if (once) callbacks.delete(id);
        return callback?.(data);
      });
      return id;
    },
    unregisterCallback: (id) => callbacks.delete(id),
    runCallback: (id, data) => callbacks.get(id)?.(data),
    callbacks,
    convertFileSrc: (path) => path,
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
})();
