/** Workspace view modes. */
export type ViewMode = 'edit' | 'split' | 'preview';

/** Translation keys for each mode (resolved by the UI). */
export const VIEW_MODE_KEYS = {
  edit: 'header.viewEdit',
  split: 'header.viewSplit',
  preview: 'header.viewPreview',
} as const;
