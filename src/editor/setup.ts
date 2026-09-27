/**
 * Configuracion de CodeMirror 6 para editar Markdown.
 *
 * Buscamos algo parecido a la vista de fuente de GitHub: monoespaciado, sin
 * cambios bruscos de tamano y con el marcado (###, **, `) en un tono apagado
 * para que el texto se lea primero.
 */

import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import type { Theme } from '../lib/theme';
import { PLAIN_LIMIT } from '../lib/limits';

export { PLAIN_LIMIT };
import { insertLink, toggleBold, toggleInlineCode, toggleItalic } from './format';

/** Fuente y medidas compartidas por todas las paletas. */
const metrics = {
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    lineHeight: '1.65',
  },
  '.cm-content': {
    padding: '18px 4px 64px',
    caretColor: 'var(--fg)',
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--fg-subtle)',
    fontSize: '11.5px',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 12px 0 16px',
    minWidth: '44px',
  },
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 4px',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-hover)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: 'var(--fg-muted)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--fg)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--primary-subtle)',
    outline: '1px solid var(--primary)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--bg-subtle)',
    color: 'var(--fg)',
    borderColor: 'var(--border)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid var(--border)',
  },
  '.cm-textfield': {
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--fg)',
    padding: '2px 6px',
  },
  '.cm-button': {
    backgroundColor: 'var(--bg)',
    backgroundImage: 'none',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--fg-muted)',
    cursor: 'pointer',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    boxShadow: 'var(--shadow-md)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--primary-subtle)',
    color: 'var(--primary)',
  },
} as const;

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.5em', color: 'var(--fg)' },
  { tag: t.heading2, fontWeight: '650', fontSize: '1.3em', color: 'var(--fg)' },
  { tag: t.heading3, fontWeight: '650', fontSize: '1.15em', color: 'var(--fg)' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '650', color: 'var(--fg)' },
  { tag: t.strong, fontWeight: '700', color: 'var(--fg)' },
  { tag: t.emphasis, fontStyle: 'italic', color: 'var(--fg)' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--fg-muted)' },
  { tag: [t.monospace], color: 'var(--hl-string)' },
  { tag: [t.link, t.url], color: 'var(--primary)' },
  { tag: [t.quote], color: 'var(--fg-muted)', fontStyle: 'italic' },
  { tag: [t.list, t.contentSeparator], color: 'var(--fg-muted)' },
  // Marcado del propio Markdown (#, **, >, -) en tono apagado.
  { tag: [t.processingInstruction, t.punctuation], color: 'var(--fg-subtle)' },
  { tag: t.labelName, color: 'var(--primary)' },
  { tag: t.escape, color: 'var(--hl-variable)' },
  // Bloques de codigo embebidos.
  { tag: t.keyword, color: 'var(--hl-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--hl-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--hl-constant)' },
  { tag: t.comment, color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: t.typeName, color: 'var(--hl-entity)' },
  { tag: [t.function(t.variableName), t.propertyName], color: 'var(--hl-entity)' },
  { tag: t.tagName, color: 'var(--hl-tag)' },
  { tag: t.attributeName, color: 'var(--hl-constant)' },
  { tag: t.invalid, color: 'var(--danger)' },
]);

const themeCompartment = new Compartment();
const settingsCompartment = new Compartment();

export interface EditorSettings {
  fontSize: number;
  lineNumbers: boolean;
  wrap: boolean;
}

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  fontSize: 13.5,
  lineNumbers: true,
  wrap: true,
};

function settingsExtension(settings: EditorSettings, plain: boolean): Extension {
  return [
    settings.lineNumbers ? lineNumbers() : [],
    // En documentos enormes el ajuste de linea mide cada linea y congela: off.
    settings.wrap && !plain ? EditorView.lineWrapping : [],
    EditorView.theme({ '&': { fontSize: `${settings.fontSize}px` } }),
  ];
}

/** Aplica preferencias del editor sin recrear el documento. */
export function reconfigureEditor(view: EditorView, settings: EditorSettings, plain = false): void {
  view.dispatch({ effects: settingsCompartment.reconfigure(settingsExtension(settings, plain)) });
}

/** Una extension por tema: reconfigurar no vuelve a construir los estilos. */
const themeExtensions: Record<Theme, Extension> = {
  light: EditorView.theme(metrics, { dark: false }),
  dark: EditorView.theme(metrics, { dark: true }),
};

/** Atajos de formato Markdown (Ctrl/⌘ + letra), como en GitHub. */
const formatKeymap = [
  { key: 'Mod-b', run: toggleBold, preventDefault: true },
  { key: 'Mod-i', run: toggleItalic, preventDefault: true },
  { key: 'Mod-e', run: toggleInlineCode, preventDefault: true },
  { key: 'Mod-k', run: insertLink, preventDefault: true },
];

export interface EditorOptions {
  /** Sin parseo de Markdown ni resaltado: para documentos enormes. */
  plain?: boolean;
  /** Etiqueta accesible del area de edicion. */
  ariaLabel?: string;
}

export function createEditorState(
  doc: string,
  theme: Theme,
  options: EditorOptions = {},
  settings: EditorSettings = DEFAULT_EDITOR_SETTINGS,
): EditorState {
  const rich = options.plain !== true;
  return EditorState.create({
    doc,
    extensions: [
      settingsCompartment.of(settingsExtension(settings, rich === false)),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      ...(rich
        ? [
            foldGutter(),
            bracketMatching(),
            highlightSelectionMatches(),
            markdown({ base: markdownLanguage, addKeymap: false }),
            syntaxHighlighting(markdownHighlightStyle),
          ]
        : []),
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      highlightActiveLine(),
      indentUnit.of('  '),
      search({ top: true }),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([
        ...formatKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      themeCompartment.of(themeExtensions[theme]),
      EditorView.contentAttributes.of({ 'aria-label': options.ariaLabel ?? 'Markdown editor' }),
    ],
  });
}

/** Cambia de tema sin recrear el documento (ni perder el historial). */
export function reconfigureTheme(view: EditorView, theme: Theme): void {
  view.dispatch({ effects: themeCompartment.reconfigure(themeExtensions[theme]) });
}
