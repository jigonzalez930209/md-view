/**
 * Preferencias de la app, persistidas en localStorage.
 *
 * Todo lo configurable vive aca: apariencia, editor, vista previa, explorador,
 * exportacion e inicio. El dialogo de Configuraciones y los accesos rapidos
 * (menu ☰) leen y escriben el mismo estado.
 */

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from './i18n';
import { PALETTES, systemTheme, type ExplorerSide, type Palette, type Theme } from './theme';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Preferences {
  /** Idioma de la interfaz; por defecto ingles. */
  language: Language;
  themeMode: ThemeMode;
  palette: Palette;
  explorerSide: ExplorerSide;
  /** El PDF sale en claro salvo que se desactive. */
  pdfLight: boolean;
  editorFontSize: number;
  editorLineNumbers: boolean;
  editorWrap: boolean;
  /** Mantener editor y vista previa alineados en modo dividido. */
  previewSyncScroll: boolean;
  previewFontSize: number;
  /** Mostrar los recientes en la pantalla de inicio. */
  showRecents: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  language: DEFAULT_LANGUAGE,
  themeMode: 'system',
  palette: 'github',
  explorerSide: 'left',
  pdfLight: true,
  editorFontSize: 13.5,
  editorLineNumbers: true,
  editorWrap: true,
  previewSyncScroll: true,
  previewFontSize: 16,
  showRecents: true,
};

const PREFS_KEY = 'md-view:prefs';
/* Claves viejas: se migran la primera vez. */
const LEGACY_KEYS = {
  language: 'md-view:language',
  theme: 'md-view:theme',
  palette: 'md-view:palette',
  pdfLight: 'md-view:pdf-light',
  explorerSide: 'md-view:explorer-side',
};

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* modo privado: seguimos sin persistir */
  }
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function legacyPreferences(): Partial<Preferences> {
  const language = readRaw(LEGACY_KEYS.language);
  const theme = readRaw(LEGACY_KEYS.theme);
  const palette = readRaw(LEGACY_KEYS.palette);
  const explorerSide = readRaw(LEGACY_KEYS.explorerSide);

  return {
    language: LANGUAGES.some((item) => item.id === language) ? (language as Language) : undefined,
    themeMode: theme === 'light' || theme === 'dark' ? theme : undefined,
    palette: PALETTES.some((item) => item.id === palette) ? (palette as Palette) : undefined,
    pdfLight: readRaw(LEGACY_KEYS.pdfLight) === 'false' ? false : undefined,
    explorerSide: explorerSide === 'right' ? 'right' : explorerSide === 'left' ? 'left' : undefined,
  };
}

/** Normaliza lo que venga guardado (o de una version vieja). */
export function sanitizePreferences(input: Partial<Preferences>): Preferences {
  const merged = { ...DEFAULT_PREFERENCES, ...input };

  return {
    language: LANGUAGES.some((item) => item.id === merged.language)
      ? merged.language
      : DEFAULT_LANGUAGE,
    themeMode: ['light', 'dark', 'system'].includes(merged.themeMode) ? merged.themeMode : 'system',
    palette: PALETTES.some((item) => item.id === merged.palette) ? merged.palette : 'github',
    explorerSide: merged.explorerSide === 'right' ? 'right' : 'left',
    pdfLight: merged.pdfLight !== false,
    editorFontSize: clamp(merged.editorFontSize, 11, 20, DEFAULT_PREFERENCES.editorFontSize),
    editorLineNumbers: merged.editorLineNumbers !== false,
    editorWrap: merged.editorWrap !== false,
    previewSyncScroll: merged.previewSyncScroll !== false,
    previewFontSize: clamp(merged.previewFontSize, 13, 22, DEFAULT_PREFERENCES.previewFontSize),
    showRecents: merged.showRecents !== false,
  };
}

export function loadPreferences(): Preferences {
  const raw = readRaw(PREFS_KEY);
  if (!raw) {
    const migrated = sanitizePreferences(legacyPreferences());
    savePreferences(migrated);
    return migrated;
  }
  try {
    return sanitizePreferences(JSON.parse(raw) as Partial<Preferences>);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences: Preferences): void {
  writeRaw(PREFS_KEY, JSON.stringify(preferences));
}

/** Tema efectivo: el del sistema cuando la preferencia es "system". */
export function themeFor(preferences: Preferences, system: Theme): Theme {
  return preferences.themeMode === 'system' ? system : preferences.themeMode;
}

/** Estado de preferencias para React: se persiste en cada cambio. */
export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [system, setSystem] = useState<Theme>(() => systemTheme());

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = sanitizePreferences({ ...current, ...patch });
      savePreferences(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    savePreferences(DEFAULT_PREFERENCES);
    setPreferences({ ...DEFAULT_PREFERENCES });
  }, []);

  return { preferences, update, reset, system, theme: themeFor(preferences, system) };
}
