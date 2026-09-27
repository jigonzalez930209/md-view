/**
 * On-demand worker dispatch.
 *
 * The worker is created the first time a document needs it, is reused
 * while requests keep coming and terminates on its own after a while without
 * use, so it does not keep memory occupied. Long texts are sent in chunks.
 */

import { STATS_CHUNK } from './limits';
import type { RenderResponse, StatsResponse } from '../workers/text-tasks';

export interface TextStats {
  words: number;
  lines: number;
  chars: number;
}

const IDLE_MS = 30_000;

let worker: Worker | null = null;
let idleTimer: number | null = null;
let sequence = 0;
const pending = new Map<number, (message: StatsResponse | RenderResponse | null) => void>();

function release(): void {
  worker?.terminate();
  worker = null;
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
}

function scheduleRelease(): void {
  if (idleTimer !== null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    release();
  }, IDLE_MS);
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/text-tasks.ts', import.meta.url), { type: 'module' });
  } catch {
    return null; // no workers available: computed/rendered on the main thread
  }

  worker.onmessage = (event: MessageEvent<StatsResponse | RenderResponse>) => {
    const { id } = event.data;
    const resolve = pending.get(id);
    pending.delete(id);
    resolve?.(event.data);
  };
  worker.onerror = () => release();
  return worker;
}

/**
 * First `lines` lines of the text. It finds the line breaks with `indexOf` and
 * cuts with `slice`: in V8 the substring shares memory, so it is practically
 * free even with documents of hundreds of MB.
 */
export function headWindow(text: string, lines: number): string {
  let index = 0;
  for (let count = 0; count < lines; count += 1) {
    const next = text.indexOf('\n', index);
    if (next === -1) return text;
    index = next + 1;
  }
  return text.slice(0, index);
}

/** Splits the text into chunks aligned to line breaks. */
export function splitForWorker(text: string, size = STATS_CHUNK): string[] {
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + size);
    if (end < text.length) {
      const newline = text.indexOf('\n', end);
      // We do not drag a giant line along: if there is no break nearby, we cut there.
      if (newline !== -1 && newline - end < size) end = newline + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

/** Stats in the worker; returns null if it could not run. */
export function textStats(chunks: string[]): Promise<TextStats | null> {
  const instance = ensureWorker();
  if (!instance) return Promise.resolve(null);
  scheduleRelease();

  const id = ++sequence;
  return new Promise((resolve) => {
    pending.set(id, (message) => {
      if (!message || !('words' in message)) return resolve(null);
      const { words, lines, chars } = message;
      resolve({ words, lines, chars });
    });
    instance.postMessage({ id, type: 'stats', chunks });
  });
}

/** Markdown render (markdown-it + plugins) in the worker; null if it fails. */
export function renderCoreInWorker(source: string, mdx: boolean): Promise<string | null> {
  const instance = ensureWorker();
  if (!instance) return Promise.resolve(null);
  scheduleRelease();

  const id = ++sequence;
  return new Promise((resolve) => {
    pending.set(id, (message) => {
      if (!message || !('html' in message)) return resolve(null);
      resolve(message.html);
    });
    instance.postMessage({ id, type: 'render', source, mdx });
  });
}

/** Releases the worker (for example when closing all documents). */
export function disposeTextWorker(): void {
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
  release();
}
