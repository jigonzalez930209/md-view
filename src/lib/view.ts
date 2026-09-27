/** Modos de vista del area de trabajo. */
export type ViewMode = 'edit' | 'split' | 'preview';

/** Claves de traduccion de cada modo (las resuelve la interfaz). */
export const VIEW_MODE_KEYS = {
  edit: 'header.viewEdit',
  split: 'header.viewSplit',
  preview: 'header.viewPreview',
} as const;
