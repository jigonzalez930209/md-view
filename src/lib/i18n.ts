/**
 * UI translations.
 *
 * All visible text comes from here: `en` is the default language and `es` is
 * the one the app already used. Adding another language only takes a
 * dictionary with the same keys in `dictionaries`.
 *
 * React components use `useI18n()` (changing the language re-renders them,
 * even the memoized ones) and non-React modules use `t()`, which takes
 * the active language set with `setActiveLanguage`.
 */

export type Language = 'en' | 'es';

export const LANGUAGES: Array<{ id: Language; label: string; native: string }> = [
  { id: 'en', label: 'English', native: 'English' },
  { id: 'es', label: 'Spanish', native: 'Español' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

const en = {
  // Common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saveAll': 'Save all',
  'common.reload': 'Reload',
  'common.discard': 'Discard',
  'common.close': 'Close',
  'common.reset': 'Reset',
  'common.done': 'Done',
  'common.clearList': 'Clear list',

  // Top bar
  'header.tagline': 'Markdown viewer and editor',
  'header.open': 'Open',
  'header.openFile': 'Open file…',
  'header.openFileTitle': 'Open file ({mod}+O)',
  'header.recents': 'Recent files',
  'header.recentsEmpty': 'No recent files yet.',
  'header.recentsSection': 'Recent',
  'header.clearRecents': 'Clear recents',
  'header.openFolder': 'Open folder…',
  'header.newTab': 'New tab',
  'header.newTabTitle': 'New tab ({mod}+T)',
  'header.closeTab': 'Close tab',
  'header.unsavedChanges': 'Unsaved changes',
  'header.info': 'Document information',
  'header.menu': 'Main menu',
  'header.noDocument': 'No document',
  'header.save': 'Save',
  'header.saveAs': 'Save as…',
  'header.reload': 'Reload from disk',
  'header.explorer': 'Explorer',
  'header.view': 'View',
  'header.viewEdit': 'Editor only',
  'header.viewSplit': 'Editor and preview',
  'header.viewPreview': 'Read only',
  'header.settings': 'Settings…',
  'header.export': 'Export',
  'header.appearance': 'Appearance',
  'header.mode': 'Mode',
  'header.themeLight': 'Light',
  'header.themeDark': 'Dark',
  'header.themeSystem': 'System',
  'header.palette': 'Palette',
  'header.explorerSection': 'Explorer',
  'header.left': 'Left',
  'header.right': 'Right',
  'header.pdfLight': 'PDF in light mode',
  'header.infoStats': '{words} words · {chars} characters',
  'header.infoSaved': 'saved',
  'header.infoDirty': 'unsaved changes',
  'header.infoNew': 'not saved yet',

  // Window
  'window.minimize': 'Minimize',
  'window.restore': 'Restore',
  'window.maximize': 'Maximize',
  'window.close': 'Close',

  // Tabs
  'tabs.list': 'Open documents',
  'tabs.closeTab': 'Close {name}',

  // Formatting toolbar
  'format.toolbar': 'Markdown formatting',
  'format.heading': 'Heading (H1 → H2 → H3)',
  'format.bold': 'Bold ({mod}+B)',
  'format.italic': 'Italic ({mod}+I)',
  'format.quote': 'Quote',
  'format.code': 'Inline code ({mod}+E)',
  'format.link': 'Link ({mod}+K)',
  'format.bulletList': 'Bulleted list',
  'format.orderedList': 'Numbered list',
  'format.taskList': 'Task list',
  'format.image': 'Image',
  'format.table': 'Table',
  'format.rule': 'Horizontal rule',
  'format.undo': 'Undo ({mod}+Z)',
  'format.redo': 'Redo ({mod}+Shift+Z)',
  'format.placeholderText': 'text',
  'format.placeholderImage': 'image',
  'format.placeholderUrl': 'url-or-path',
  'format.tableHeader': 'Column {n}',

  // Status bar
  'status.noDocument': 'No document',
  'status.saved': 'Saved',
  'status.branch': 'Git branch: {branch}',
  'status.changesGit': 'Changed lines vs. {branch} (last commit)',
  'status.changesSaved': 'Changed lines since the last save',
  'status.dirty': 'Unsaved',
  'status.new': 'New',
  'status.cursor': 'Ln {line}, Col {column}',
  'status.words.one': '{count} word',
  'status.words.other': '{count} words',
  'status.chars.one': '{count} character',
  'status.chars.other': '{count} characters',

  // Welcome
  'welcome.subtitle':
    'Markdown with tables, LaTeX formulas, Mermaid diagrams, animated SVGs and images, with a GitHub-style preview.',
  'welcome.open': 'Open file',
  'welcome.new': 'New document',
  'welcome.demo': 'View demo',
  'welcome.recents': 'Recent',
  'welcome.hintDrag': 'You can drag a .md file onto the window to open it.',
  'welcome.hintOpen': 'open',
  'welcome.hintSave': 'save',
  'welcome.hintView': 'switch view',

  // Explorer
  'tree.label': 'File explorer',
  'tree.reload': 'Reload folder',
  'tree.close': 'Close explorer',
  'tree.truncated': 'Tree truncated: too many files.',
  'tree.notText': '{path} (not a text file)',
  'tree.count.one': '{count} file in the tree',
  'tree.count.other': '{count} files in the tree',

  // Preview
  'preview.label': 'Preview',
  'preview.code': 'Code',
  'preview.viewMarkdown': 'View as Markdown',
  'preview.viewCode': 'View as code',
  'preview.resetZoom': 'Reset zoom to 100%',
  'preview.windowed': 'Large document ({mb} MB): showing the first {lines} lines.',
  'preview.simplified': 'Large document: preview without syntax highlighting or diagrams.',

  // Settings
  'settings.title': 'Settings',
  'settings.description': 'Saved automatically. The quick menu shortcuts keep working the same.',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.palette': 'Color palette',
  'settings.editor': 'Editor',
  'settings.fontSize': 'Font size',
  'settings.lineNumbers': 'Line numbers',
  'settings.wrap': 'Wrap lines',
  'settings.preview': 'Preview',
  'settings.syncScroll': 'Synchronized scroll',
  'settings.syncScrollHint': 'Keeps editor and preview on the same line (split view)',
  'settings.explorer': 'Explorer',
  'settings.explorerPosition': 'Position',
  'settings.explorerHint': 'Show or hide it with Ctrl+Shift+E',
  'settings.export': 'Export',
  'settings.pdfLight': 'PDF in light mode',
  'settings.pdfLightHint': 'Turn it off to export with the current theme',
  'settings.start': 'Start',
  'settings.showRecents': 'Show recents',
  'settings.recentsList': 'Recents list',
  'settings.recentsCount.one': '{count} file',
  'settings.recentsCount.other': '{count} files',
  'settings.language': 'Language',
  'settings.languageHint': 'More languages can be added in lib/i18n.ts',
  'settings.resetConfirm': 'All preferences will be reset.',
  'settings.codeLabel': 'Code',

  // App messages
  'app.previewNotReady': 'The preview is not ready yet',
  'app.openingLarge': 'Opening {mb} MB… (large document, this may take a few seconds)',
  'app.fileTooLarge': 'This file is too large to open ({mb} MB; the limit is {limit} MB).',
  'app.saved': 'Saved',
  'app.savedIn': 'Saved in {dir}',
  'app.exporting': 'Exporting {label}…',
  'app.folderOpened.one': '{name}: {count} file',
  'app.folderOpened.other': '{name}: {count} files',
  'app.folderTruncated': ' (tree truncated)',
  'app.folderReloaded': 'Folder reloaded',
  'app.dirtyOne': '"{name}" has unsaved changes.',
  'app.dirtyMany': 'There are {count} documents with unsaved changes.',
  'app.unsavedTitle': 'Unsaved changes',
  'app.unsavedPrompt': 'Save before closing?',
  'app.saving': 'Saving…',
  'app.reloaded': 'Reloaded "{name}" from disk',
  'app.changedOnDisk':
    '"{name}" changed on disk. Saving will ask before overwriting the other change.',
  'app.conflictTitle': 'File changed on disk',
  'app.conflictBody':
    '"{name}" was modified by another program. Keep your version, take the one on disk or cancel.',
  'app.conflictOverwrite': 'Overwrite',
  'app.browserReopenOnly': 'In the browser you can only reopen files picked in this session.',
  'app.browserFolderOnly': 'In the browser you can only open the folder picked in this session.',
  'app.editorPlainNote':
    'Large document: the editor is in plain-text mode, without syntax highlighting.',
  'app.dropToOpen': 'Drop the file to open it',

  // Export
  'export.pdf.label': 'PDF (paged)',
  'export.pdf.hint': 'Vector, with page breaks',
  'export.html.label': 'Self-contained HTML',
  'export.html.hint': 'Single file, no dependencies',
  'export.zip.label': 'PNG pages (ZIP)',
  'export.zip.hint': 'One A4 PNG per page, inside a .zip',
  'export.png.label': 'PNG (full image)',
  'export.png.hint': 'The whole preview in one image',
  'export.jpg.label': 'JPG',
  'export.jpg.hint': 'Full image with background',
  'export.webp.label': 'WebP',
  'export.webp.hint': 'Compressed full image',
  'export.svg.label': 'SVG',
  'export.svg.hint': 'Vector, editable',
  'export.txt.label': 'Plain text',
  'export.txt.hint': 'No formatting',
  'export.htmlSaved': 'HTML exported to {dir}',
  'export.pdfSaved': 'PDF exported to {dir}',
  'export.pageSaved': 'Page exported to {file}',
  'export.pagesSaved': '{count} pages exported to {file}',
  'export.imageSaved': 'Image exported to {dir}',
  'export.svgSaved': 'Vector SVG exported to {dir}',
  'export.textSaved': 'Text exported to {dir}',
  'export.canvasError': 'Could not prepare the page canvas',
  'export.imageError': 'Could not generate the page image',
  'export.partialTitle': 'Large document',
  'export.partialBody':
    'The preview only shows the first {lines} lines of this {mb} MB document. The export will contain just that part.',
  'export.partialConfirm': 'Export what is visible',
  'export.partialNote': 'Only the visible part of the document was exported.',

  // Native dialog filters
  'filter.markdown': 'Markdown',
  'filter.text': 'Text',
  'filter.all': 'All files',
  'filter.pdf': 'PDF',
  'filter.html': 'HTML',
  'filter.zip': 'ZIP',
  'filter.png': 'PNG',
  'filter.jpg': 'JPG',
  'filter.webp': 'WebP',
  'filter.svg': 'SVG',

  // Preview post-processing
  'enhance.copyCode': 'Copy code',
  'enhance.copied': 'Copied',
  'enhance.copyError': 'Could not copy to the clipboard.',
  'enhance.linkNotFound': 'Could not find the link target: {href}',
  'enhance.diagramError': 'Could not draw the diagram: {detail}',
  'enhance.diagramLoading': 'Drawing diagram…',
  'enhance.diagramStale': 'Syntax error: showing the last valid version',
  'enhance.alertNote': 'Note',
  'enhance.alertTip': 'Tip',
  'enhance.alertImportant': 'Important',
  'enhance.alertWarning': 'Warning',
  'enhance.alertCaution': 'Caution',

  // Editor
  'editor.ariaLabel': 'Markdown editor',
  'editor.code': 'Code',
} as const;

export type TranslationKey = keyof typeof en;

const es: Record<TranslationKey, string> = {
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.saveAll': 'Guardar todo',
  'common.reload': 'Recargar',
  'common.discard': 'Descartar',
  'common.close': 'Cerrar',
  'common.reset': 'Restablecer',
  'common.done': 'Listo',
  'common.clearList': 'Borrar lista',

  'header.tagline': 'Visor y editor de Markdown',
  'header.open': 'Abrir',
  'header.openFile': 'Abrir archivo…',
  'header.openFileTitle': 'Abrir archivo ({mod}+O)',
  'header.recents': 'Archivos recientes',
  'header.recentsEmpty': 'Todavía no abriste ningún archivo.',
  'header.recentsSection': 'Recientes',
  'header.clearRecents': 'Borrar recientes',
  'header.openFolder': 'Abrir carpeta…',
  'header.newTab': 'Nueva pestaña',
  'header.newTabTitle': 'Nueva pestaña ({mod}+T)',
  'header.closeTab': 'Cerrar pestaña',
  'header.unsavedChanges': 'Cambios sin guardar',
  'header.info': 'Información del documento',
  'header.menu': 'Menú principal',
  'header.noDocument': 'Sin documento',
  'header.save': 'Guardar',
  'header.saveAs': 'Guardar como…',
  'header.reload': 'Recargar desde el disco',
  'header.explorer': 'Explorador',
  'header.view': 'Vista',
  'header.viewEdit': 'Solo editor',
  'header.viewSplit': 'Editor y vista previa',
  'header.viewPreview': 'Solo lectura',
  'header.settings': 'Configuraciones…',
  'header.export': 'Exportar',
  'header.appearance': 'Apariencia',
  'header.mode': 'Modo',
  'header.themeLight': 'Claro',
  'header.themeDark': 'Oscuro',
  'header.themeSystem': 'Sistema',
  'header.palette': 'Paleta',
  'header.explorerSection': 'Explorador',
  'header.left': 'Izquierda',
  'header.right': 'Derecha',
  'header.pdfLight': 'PDF en modo claro',
  'header.infoStats': '{words} palabras · {chars} caracteres',
  'header.infoSaved': 'guardado',
  'header.infoDirty': 'cambios sin guardar',
  'header.infoNew': 'sin guardar',

  'window.minimize': 'Minimizar',
  'window.restore': 'Restaurar',
  'window.maximize': 'Maximizar',
  'window.close': 'Cerrar',

  'tabs.list': 'Documentos abiertos',
  'tabs.closeTab': 'Cerrar {name}',

  'format.toolbar': 'Formato de Markdown',
  'format.heading': 'Título (H1 → H2 → H3)',
  'format.bold': 'Negrita ({mod}+B)',
  'format.italic': 'Cursiva ({mod}+I)',
  'format.quote': 'Cita',
  'format.code': 'Código en línea ({mod}+E)',
  'format.link': 'Enlace ({mod}+K)',
  'format.bulletList': 'Lista con viñetas',
  'format.orderedList': 'Lista numerada',
  'format.taskList': 'Lista de tareas',
  'format.image': 'Imagen',
  'format.table': 'Tabla',
  'format.rule': 'Línea horizontal',
  'format.undo': 'Deshacer ({mod}+Z)',
  'format.redo': 'Rehacer ({mod}+Shift+Z)',
  'format.placeholderText': 'texto',
  'format.placeholderImage': 'imagen',
  'format.placeholderUrl': 'ruta-o-url',
  'format.tableHeader': 'Columna {n}',

  'status.noDocument': 'Sin documento',
  'status.saved': 'Guardado',
  'status.branch': 'Rama de git: {branch}',
  'status.changesGit': 'Líneas cambiadas respecto de {branch} (último commit)',
  'status.changesSaved': 'Líneas cambiadas desde el último guardado',
  'status.dirty': 'Sin guardar',
  'status.new': 'Nuevo',
  'status.cursor': 'Ln {line}, Col {column}',
  'status.words.one': '{count} palabra',
  'status.words.other': '{count} palabras',
  'status.chars.one': '{count} carácter',
  'status.chars.other': '{count} caracteres',

  'welcome.subtitle':
    'Markdown con tablas, fórmulas LaTeX, diagramas Mermaid, SVG animados e imágenes, con vista previa igual a la de GitHub.',
  'welcome.open': 'Abrir archivo',
  'welcome.new': 'Nuevo documento',
  'welcome.demo': 'Ver demo',
  'welcome.recents': 'Recientes',
  'welcome.hintDrag': 'Podés arrastrar un archivo .md sobre la ventana para abrirlo.',
  'welcome.hintOpen': 'abrir',
  'welcome.hintSave': 'guardar',
  'welcome.hintView': 'cambiar de vista',

  'tree.label': 'Explorador de archivos',
  'tree.reload': 'Recargar carpeta',
  'tree.close': 'Cerrar explorador',
  'tree.truncated': 'Árbol truncado: hay demasiados archivos.',
  'tree.notText': '{path} (no es un archivo de texto)',
  'tree.count.one': '{count} archivo en el árbol',
  'tree.count.other': '{count} archivos en el árbol',

  'preview.label': 'Vista previa',
  'preview.code': 'Código',
  'preview.viewMarkdown': 'Ver como Markdown',
  'preview.viewCode': 'Ver como código',
  'preview.resetZoom': 'Volver el zoom al 100 %',
  'preview.windowed': 'Documento grande ({mb} MB): se muestran las primeras {lines} líneas.',
  'preview.simplified':
    'Documento grande: la vista previa va sin resaltado de código ni diagramas.',

  'settings.title': 'Configuraciones',
  'settings.description':
    'Se guardan solas. Los accesos rápidos del menú siguen funcionando igual.',
  'settings.appearance': 'Apariencia',
  'settings.theme': 'Tema',
  'settings.palette': 'Paleta de colores',
  'settings.editor': 'Editor',
  'settings.fontSize': 'Tamaño de fuente',
  'settings.lineNumbers': 'Números de línea',
  'settings.wrap': 'Ajuste de línea',
  'settings.preview': 'Vista previa',
  'settings.syncScroll': 'Scroll sincronizado',
  'settings.syncScrollHint': 'Mantiene editor y preview en la misma línea (modo dividido)',
  'settings.explorer': 'Explorador',
  'settings.explorerPosition': 'Ubicación',
  'settings.explorerHint': 'Se puede mostrar u ocultar con Ctrl+Shift+E',
  'settings.export': 'Exportación',
  'settings.pdfLight': 'PDF en modo claro',
  'settings.pdfLightHint': 'Desactivalo para exportar con el tema actual',
  'settings.start': 'Inicio',
  'settings.showRecents': 'Mostrar recientes',
  'settings.recentsList': 'Lista de recientes',
  'settings.recentsCount.one': '{count} archivo',
  'settings.recentsCount.other': '{count} archivos',
  'settings.language': 'Idioma',
  'settings.languageHint': 'Se pueden agregar más idiomas en lib/i18n.ts',
  'settings.resetConfirm': 'Se van a restablecer todas las preferencias.',
  'settings.codeLabel': 'Código',

  'app.previewNotReady': 'La vista previa todavía no está lista',
  'app.openingLarge': 'Abriendo {mb} MB… (documento grande, puede tardar unos segundos)',
  'app.fileTooLarge': 'Este archivo es demasiado grande para abrirlo ({mb} MB; el límite es {limit} MB).',
  'app.saved': 'Guardado',
  'app.savedIn': 'Guardado en {dir}',
  'app.exporting': 'Exportando {label}…',
  'app.folderOpened.one': '{name}: {count} archivo',
  'app.folderOpened.other': '{name}: {count} archivos',
  'app.folderTruncated': ' (árbol truncado)',
  'app.folderReloaded': 'Carpeta recargada',
  'app.dirtyOne': '"{name}" tiene cambios sin guardar.',
  'app.dirtyMany': 'Hay {count} documentos con cambios sin guardar.',
  'app.unsavedTitle': 'Cambios sin guardar',
  'app.unsavedPrompt': '¿Querés guardar antes de cerrar?',
  'app.saving': 'Guardando…',
  'app.reloaded': 'Se recargó "{name}" desde el disco',
  'app.changedOnDisk':
    '"{name}" cambió en el disco. Al guardar se preguntará antes de sobrescribir el otro cambio.',
  'app.conflictTitle': 'El archivo cambió en el disco',
  'app.conflictBody':
    '"{name}" fue modificado por otro programa. Conservá tu versión, tomá la del disco o cancelá.',
  'app.conflictOverwrite': 'Sobrescribir',
  'app.browserReopenOnly':
    'En el navegador solo se pueden reabrir los archivos elegidos en esta sesión.',
  'app.browserFolderOnly':
    'En el navegador solo se puede abrir la carpeta elegida en esta sesión.',
  'app.editorPlainNote':
    'Documento grande: el editor va en texto plano, sin resaltado de sintaxis.',
  'app.dropToOpen': 'Soltá el archivo para abrirlo',

  'export.pdf.label': 'PDF (paginado)',
  'export.pdf.hint': 'Vectorial, con saltos de página',
  'export.html.label': 'HTML autocontenido',
  'export.html.hint': 'Un solo archivo, sin dependencias',
  'export.zip.label': 'PNG por páginas (ZIP)',
  'export.zip.hint': 'Un PNG A4 por página, dentro de un .zip',
  'export.png.label': 'PNG (imagen completa)',
  'export.png.hint': 'Toda la vista previa en una imagen',
  'export.jpg.label': 'JPG',
  'export.jpg.hint': 'Imagen completa con fondo',
  'export.webp.label': 'WebP',
  'export.webp.hint': 'Imagen completa comprimida',
  'export.svg.label': 'SVG',
  'export.svg.hint': 'Vectorial, editable',
  'export.txt.label': 'Texto plano',
  'export.txt.hint': 'Sin formato',
  'export.htmlSaved': 'HTML exportado en {dir}',
  'export.pdfSaved': 'PDF exportado en {dir}',
  'export.pageSaved': 'Página exportada en {file}',
  'export.pagesSaved': '{count} páginas exportadas en {file}',
  'export.imageSaved': 'Imagen exportada en {dir}',
  'export.svgSaved': 'SVG vectorial exportado en {dir}',
  'export.textSaved': 'Texto exportado en {dir}',
  'export.canvasError': 'No se pudo preparar el lienzo de la página',
  'export.imageError': 'No se pudo generar la imagen de la página',
  'export.partialTitle': 'Documento grande',
  'export.partialBody':
    'La vista previa solo muestra las primeras {lines} líneas de este documento de {mb} MB. La exportación contendrá solo esa parte.',
  'export.partialConfirm': 'Exportar lo visible',
  'export.partialNote': 'Solo se exportó la parte visible del documento.',

  'filter.markdown': 'Markdown',
  'filter.text': 'Texto',
  'filter.all': 'Todos los archivos',
  'filter.pdf': 'PDF',
  'filter.html': 'HTML',
  'filter.zip': 'ZIP',
  'filter.png': 'PNG',
  'filter.jpg': 'JPG',
  'filter.webp': 'WebP',
  'filter.svg': 'SVG',

  'enhance.copyCode': 'Copiar código',
  'enhance.copied': 'Copiado',
  'enhance.copyError': 'No se pudo copiar al portapapeles.',
  'enhance.linkNotFound': 'No se encontró el destino del enlace: {href}',
  'enhance.diagramError': 'No se pudo dibujar el diagrama: {detail}',
  'enhance.diagramLoading': 'Dibujando diagrama…',
  'enhance.diagramStale': 'Error de sintaxis: se muestra la última versión válida',
  'enhance.alertNote': 'Nota',
  'enhance.alertTip': 'Tip',
  'enhance.alertImportant': 'Importante',
  'enhance.alertWarning': 'Advertencia',
  'enhance.alertCaution': 'Precaución',

  'editor.ariaLabel': 'Editor de Markdown',
  'editor.code': 'Código',
};

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, es };

export interface TranslateParams {
  [key: string]: string | number;
}

export function translate(
  language: Language,
  key: TranslationKey,
  params?: TranslateParams,
): string {
  const template = dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name]),
  );
}

/* ------------------------------------------------------------------ */
/* Active language (for non-React modules)                             */
/* ------------------------------------------------------------------ */

let activeLanguage: Language = DEFAULT_LANGUAGE;

export function setActiveLanguage(language: Language): void {
  activeLanguage = language;
}

export function getActiveLanguage(): Language {
  return activeLanguage;
}

/** Translates with the active language. Components should use useI18n(). */
export function t(key: TranslationKey, params?: TranslateParams): string {
  return translate(activeLanguage, key, params);
}

/** Simple plural: picks `key.one` or `key.other` based on the count. */
export function plural(
  key: string,
  count: number,
  params: TranslateParams = {},
): string {
  const suffix = count === 1 ? 'one' : 'other';
  return t(`${key}.${suffix}` as TranslationKey, { count, ...params });
}
