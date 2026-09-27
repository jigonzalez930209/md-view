/**
 * Mermaid diagrams.
 *
 * The library is fairly heavy, so it is loaded with a dynamic import() the
 * first time a diagram appears. Colors are read from the CSS variables of the
 * active palette (GitHub, One Dark, Dracula) and it is re-initialized when the
 * theme or palette changes.
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

/** SVGs already drawn: redrawing on every keystroke is costly and shifts the layout. */
const svgCache = new Map<string, string>();
const CACHE_LIMIT = 40;

function read(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Theme variables for Mermaid.
 *
 * The library's "dark" theme leaves the arrow labels (the "Yes"/"No"
 * of a flowchart) in a very dark gray, unreadable on the app background.
 * We pin the colors that matter so it matches the md-view palette.
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
    // Sequence diagrams
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
    // Class diagrams
    classText: foreground,
    // Various chart texts
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

/** Draws a diagram and returns the SVG. Throws if the syntax is invalid. */
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

/** Preloads the library (for example when opening a document with diagrams). */
export function preloadDiagrams(appearance: Appearance): void {
  void getMermaid(appearance);
}
