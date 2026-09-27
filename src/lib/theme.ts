/**
 * Apariencia: tipos de tema y paleta, y como se aplican al <html>.
 *
 * Las preferencias (que tema y que paleta eligio el usuario) viven en
 * `lib/prefs.ts`; aca solo esta lo que entiende el resto de la app.
 */

export type Theme = 'light' | 'dark';
export type Palette = 'github' | 'onedark' | 'dracula';
/** Lado donde se muestra el explorador de carpetas. */
export type ExplorerSide = 'left' | 'right';

export interface PaletteInfo {
  id: Palette;
  label: string;
  /** Colores de muestra para el selector. */
  swatch: [string, string, string];
}

export const PALETTES: PaletteInfo[] = [
  { id: 'github', label: 'GitHub', swatch: ['#0969da', '#1a7f37', '#8250df'] },
  { id: 'onedark', label: 'One Dark', swatch: ['#61afef', '#98c379', '#c678dd'] },
  { id: 'dracula', label: 'Dracula', swatch: ['#bd93f9', '#50fa7b', '#ff79c6'] },
];

export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyAppearance(theme: Theme, palette: Palette): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.palette = palette;
}
