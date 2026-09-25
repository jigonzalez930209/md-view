/// <reference types="vite/client" />

/*
 * Los plugins de markdown-it que usamos no publican tipos propios.
 * Declaramos solo la firma que necesitamos.
 */

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt, options?: unknown) => void;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  interface TaskListOptions {
    /** Si es true las casillas quedan clickeables (por defecto false: solo lectura). */
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: TaskListOptions) => void;
  export default plugin;
}

declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it';
  type EmojiPlugin = (md: MarkdownIt) => void;
  export const full: EmojiPlugin;
  export const light: EmojiPlugin;
  export const bare: EmojiPlugin;
}
