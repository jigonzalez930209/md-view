/**
 * Diagramas Mermaid.
 *
 * La libreria pesa bastante, asi que se carga con import() dinamico la primera
 * vez que aparece un diagrama. El tema (claro/oscuro) se aplica al inicializar;
 * cuando el usuario cambia de tema se vuelve a inicializar y se redibuja.
 */

import type { Theme } from './theme';

type MermaidApi = typeof import('mermaid').default;

let loader: Promise<MermaidApi> | null = null;
let initializedTheme: Theme | null = null;
let renderSeq = 0;

/**
 * Variables de tema para Mermaid.
 *
 * El tema "dark" de la libreria deja las etiquetas de las flechas (los "Si"/"No"
 * de un flowchart) en un gris muy oscuro, ilegible sobre el fondo de la app.
 * Fijamos los colores que importan para que combine con la paleta de md-view.
 */
const DARK_THEME_VARIABLES = {
  darkMode: true,
  background: '#0d1117',
  primaryColor: '#161b22',
  primaryTextColor: '#f0f6fc',
  primaryBorderColor: '#3d444d',
  secondaryColor: '#1f2d3d',
  secondaryTextColor: '#f0f6fc',
  secondaryBorderColor: '#3d444d',
  tertiaryColor: '#151b23',
  tertiaryTextColor: '#f0f6fc',
  tertiaryBorderColor: '#3d444d',
  lineColor: '#9198a1',
  textColor: '#f0f6fc',
  nodeTextColor: '#f0f6fc',
  nodeBorder: '#3d444d',
  edgeLabelBackground: '#0d1117',
  labelBackground: '#0d1117',
  labelTextColor: '#f0f6fc',
  titleColor: '#f0f6fc',
  clusterBkg: '#151b23',
  clusterBorder: '#3d444d',
  // Diagramas de secuencia
  actorBkg: '#161b22',
  actorBorder: '#3d444d',
  actorTextColor: '#f0f6fc',
  actorLineColor: '#9198a1',
  signalColor: '#9198a1',
  signalTextColor: '#f0f6fc',
  labelBoxBkgColor: '#161b22',
  labelBoxBorderColor: '#3d444d',
  loopTextColor: '#f0f6fc',
  noteBkgColor: '#1f2d3d',
  noteTextColor: '#f0f6fc',
  noteBorderColor: '#3d444d',
  // Diagramas de clases
  classText: '#f0f6fc',
  // Distintos textos de los graficos
  pieTitleTextColor: '#f0f6fc',
  pieSectionTextColor: '#f0f6fc',
  pieLegendTextColor: '#f0f6fc',
  pieStrokeColor: '#0d1117',
  gitBranchLabelColor: '#f0f6fc',
};

async function getMermaid(theme: Theme): Promise<MermaidApi> {
  loader ??= import('mermaid').then((mod) => mod.default);
  const mermaid = await loader;

  if (initializedTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      themeVariables: theme === 'dark' ? DARK_THEME_VARIABLES : undefined,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
      flowchart: { useMaxWidth: true, htmlLabels: false },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    });
    initializedTheme = theme;
  }

  return mermaid;
}

/** Dibuja un diagrama y devuelve el SVG. Lanza si la sintaxis es invalida. */
export async function renderDiagram(code: string, theme: Theme): Promise<string> {
  const mermaid = await getMermaid(theme);
  const id = `md-view-diagram-${++renderSeq}`;
  const { svg } = await mermaid.render(id, code);
  return svg;
}

/** Precarga la libreria (por ejemplo al abrir un documento con diagramas). */
export function preloadDiagrams(theme: Theme): void {
  void getMermaid(theme);
}
