/**
 * Appearance: theme and palette types, and how they are applied to <html>.
 *
 * Preferences (which theme and palette the user chose) live in
 * `lib/prefs.ts`; here is only what the rest of the app understands.
 */

export type Theme = 'light' | 'dark';
export type Palette = 'github' | 'onedark' | 'dracula';
/** Side where the folder explorer is shown. */
export type ExplorerSide = 'left' | 'right';

export interface PaletteInfo {
  id: Palette;
  label: string;
  /** Sample colors for the picker. */
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
