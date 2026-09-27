/**
 * Diagramas Mermaid.
 *
 * La libreria pesa bastante, asi que se carga con import() dinamico la primera
 * vez que aparece un diagrama. Los colores se leen de las variables CSS de la
 * paleta activa (GitHub, One Dark, Dracula) y se re-inicializa cuando cambia
 * el tema o la paleta.
 */

import type { Palette, Theme } from './theme';

type MermaidApi = typeof import('mermaid').default;

export interface Appearance {
  theme: Theme;
  palette: Palette;
}

let loader: Promise<MermaidApi> | null = null;
let initializedKey: string | null = null;
let renderSeq = 0;

/** SVGs ya dibujados: redibujar en cada tecla es carisimo y mueve el layout. */
const svgCache = new Map<string, string>();
const CACHE_LIMIT = 40;

function read(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Variables de tema para Mermaid.
 *
 * El tema "dark" de la libreria deja las etiquetas de las flechas (los "Si"/"No"
 * de un flowchart) en un gris muy oscuro, ilegible sobre el fondo de la app.
 * Fijamos los colores que importan para que combine con la paleta de md-view.
 */
function themeVariables(theme: Theme): Record<string, unknown> {
  const background = read('--background', '#ffffff');
  const card = read('--card', '#f6f8fa');
  const muted = read('--muted', '#f6f8fa');
  const foreground = read('--foreground', '#1f2328');
  const mutedForeground = read('--muted-foreground', '#59636e');
  const border = read('--border', '#d1d9e0');

  return {
    darkMode: theme === 'dark',
    background,
    primaryColor: card,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    secondaryColor: muted,
    secondaryTextColor: foreground,
    secondaryBorderColor: border,
    tertiaryColor: background,
    tertiaryTextColor: foreground,
    tertiaryBorderColor: border,
    lineColor: mutedForeground,
    textColor: foreground,
    nodeTextColor: foreground,
    nodeBorder: border,
    edgeLabelBackground: background,
    labelBackground: background,
    labelTextColor: foreground,
    titleColor: foreground,
    clusterBkg: card,
    clusterBorder: border,
    // Diagramas de secuencia
    actorBkg: card,
    actorBorder: border,
    actorTextColor: foreground,
    actorLineColor: mutedForeground,
    signalColor: mutedForeground,
    signalTextColor: foreground,
    labelBoxBkgColor: card,
    labelBoxBorderColor: border,
    loopTextColor: foreground,
    noteBkgColor: muted,
    noteTextColor: foreground,
    noteBorderColor: border,
    // Diagramas de clases
    classText: foreground,
    // Distintos textos de los graficos
    pieTitleTextColor: foreground,
    pieSectionTextColor: foreground,
    pieLegendTextColor: foreground,
    pieStrokeColor: background,
    gitBranchLabelColor: foreground,
  };
}

async function getMermaid(appearance: Appearance): Promise<MermaidApi> {
  loader ??= import('mermaid').then((mod) => mod.default);
  const mermaid = await loader;
  const key = `${appearance.theme}:${appearance.palette}`;

  if (initializedKey !== key) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: appearance.theme === 'dark' ? 'dark' : 'default',
      themeVariables: themeVariables(appearance.theme),
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
      flowchart: { useMaxWidth: true, htmlLabels: false },
      sequence: { useMaxWidth: true },
      gantt: { useMaxWidth: true },
    });
    initializedKey = key;
  }

  return mermaid;
}

/** Dibuja un diagrama y devuelve el SVG. Lanza si la sintaxis es invalida. */
export async function renderDiagram(code: string, appearance: Appearance): Promise<string> {
  const key = `${appearance.theme}:${appearance.palette}:${code}`;
  const cached = svgCache.get(key);
  if (cached !== undefined) return cached;

  const mermaid = await getMermaid(appearance);
  const id = `md-view-diagram-${++renderSeq}`;
  const { svg } = await mermaid.render(id, code);

  if (svgCache.size >= CACHE_LIMIT) {
    const oldest = svgCache.keys().next().value;
    if (oldest !== undefined) svgCache.delete(oldest);
  }
  svgCache.set(key, svg);
  return svg;
}

/** Precarga la libreria (por ejemplo al abrir un documento con diagramas). */
export function preloadDiagrams(appearance: Appearance): void {
  void getMermaid(appearance);
}
