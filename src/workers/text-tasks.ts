/**
 * Worker de tareas de texto y render.
 *
 * Se crea bajo demanda (documentos grandes) y el hilo principal le manda el
 * texto por trozos para no copiar el documento entero en un solo mensaje.
 * Tareas:
 *
 * - `stats`: cuenta palabras/lineas/caracteres por trozos.
 * - `render`: markdown-it + plugins (sin DOM) para no bloquear la interfaz.
 */

import { renderMarkdownCore } from '../lib/markdown-core';

interface StatsRequest {
  id: number;
  type: 'stats';
  chunks: string[];
}

interface RenderRequest {
  id: number;
  type: 'render';
  source: string;
  mdx: boolean;
}

type Request = StatsRequest | RenderRequest;

export interface StatsResponse {
  id: number;
  words: number;
  lines: number;
  chars: number;
}

export interface RenderResponse {
  id: number;
  html: string;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;

  if (request.type === 'stats') {
    let words = 0;
    let lines = 0;
    let chars = 0;
    let inWord = false;

    for (const chunk of request.chunks) {
      chars += chunk.length;
      for (let index = 0; index < chunk.length; index += 1) {
        const code = chunk.charCodeAt(index);
        // Espacios "de verdad": el resto cuenta como parte de una palabra.
        const space =
          code === 32 || // espacio
          code === 9 || // tab
          code === 10 || // salto de linea
          code === 13 || // retorno
          code === 12 || // form feed
          code === 11 || // tab vertical
          code === 0x00a0 || // nbsp
          code === 0x2028 ||
          code === 0x2029;

        if (code === 10) lines += 1;
        if (space) {
          inWord = false;
        } else if (!inWord) {
          words += 1;
          inWord = true;
        }
      }
    }

    const response: StatsResponse = { id: request.id, words, lines: lines + 1, chars };
    self.postMessage(response);
    return;
  }

  if (request.type === 'render') {
    const response: RenderResponse = {
      id: request.id,
      html: renderMarkdownCore(request.source, { mdx: request.mdx }),
    };
    self.postMessage(response);
  }
};
