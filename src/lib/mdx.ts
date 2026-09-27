/**
 * Preprocesado de MDX.
 *
 * MDX es Markdown + JSX: sentencias ESM (`import`/`export`), componentes
 * (`<Note>`, `<Chart />`) y expresiones `{...}`. Aca no ejecutamos nada:
 *
 * - se descarta el frontmatter YAML,
 * - se quitan las sentencias `import`/`export` (incluso multilinea),
 * - los componentes propios se desenvuelven (se conserva el contenido) y los
 *   que se cierran solos se descartan,
 * - las expresiones `{...}` quedan visibles como codigo en linea.
 *
 * El HTML/JSX que sobrevive pasa por el mismo Markdown y por DOMPurify.
 */

const HTML_TAGS = new Set([
  'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li',
  'mark', 'ol', 'p', 'picture', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'small',
  'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'time', 'tr', 'u', 'ul', 'var', 'video', 'wbr',
]);

/** Quita un bloque `--- ... ---` al principio (frontmatter YAML). */
export function stripFrontmatter(source: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(source);
  return match ? source.slice(match[0].length) : source;
}

function braceBalance(line: string): number {
  let balance = 0;
  for (const char of line) {
    if (char === '{' || char === '(' || char === '[') balance += 1;
    else if (char === '}' || char === ')' || char === ']') balance -= 1;
  }
  return balance;
}

/** Saca `import ...` / `export ...`, aunque ocupen varias lineas. */
export function stripEsm(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let skipping = false;
  let depth = 0;

  for (const line of lines) {
    if (skipping) {
      depth += braceBalance(line);
      if (depth <= 0 && /;\s*$/.test(line)) skipping = false;
      continue;
    }
    if (/^\s*(import|export)\s/.test(line) || /^\s*export\s*\{/.test(line)) {
      depth = braceBalance(line);
      if (depth > 0 && !/;\s*$/.test(line)) skipping = true;
      continue;
    }
    output.push(line);
  }

  return output.join('\n');
}

function isHtmlTag(name: string): boolean {
  return HTML_TAGS.has(name.toLowerCase()) && name === name.toLowerCase();
}

/** Desenvuelve componentes propios conservando el contenido. */
export function unwrapComponents(source: string): string {
  let text = source;
  const component = /<([A-Z][\w.]*)(?:\s[^<>]*)?\/>/g;
  const paired = /<([A-Z][\w.]*)(?:\s[^<>]*)?>([\s\S]*?)<\/\1>/g;

  // Varias pasadas por si hay componentes anidados.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = text
      .replace(paired, (_full, name: string, inner: string) => (isHtmlTag(name) ? _full : inner))
      .replace(component, (_full, name: string) => (isHtmlTag(name) ? _full : ''));
    if (next === text) break;
    text = next;
  }

  return text.replace(/<\/?>/g, '');
}

/** Deja las expresiones `{...}` como codigo en linea, fuera de los fences. */
export function codeExpressions(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let fence: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      fence = fence === null ? fenceMatch[1][0] : null;
      output.push(line);
      continue;
    }
    if (fence !== null) {
      output.push(line);
      continue;
    }

    let result = '';
    let index = 0;
    while (index < line.length) {
      const char = line[index];
      if (char === '\\') {
        result += line.slice(index, index + 2);
        index += 2;
        continue;
      }
      if (char === '`') {
        // Copiamos el tramo de codigo en linea tal cual.
        const end = line.indexOf('`', index + 1);
        result += end === -1 ? line.slice(index) : line.slice(index, end + 1);
        index = end === -1 ? line.length : end + 1;
        continue;
      }
      if (char === '{') {
        let depth = 0;
        let cursor = index;
        for (; cursor < line.length; cursor += 1) {
          if (line[cursor] === '{') depth += 1;
          else if (line[cursor] === '}') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        if (depth === 0) {
          const expression = line.slice(index, cursor + 1);
          if (/^\{\s*\/\*[\s\S]*\*\/\s*\}$/.test(expression)) {
            // Comentario JSX: se descarta.
          } else {
            result += `\`${expression}\``;
          }
          index = cursor + 1;
          continue;
        }
      }
      result += char;
      index += 1;
    }
    output.push(result);
  }

  return output.join('\n');
}

/** Markdown listo para markdown-it a partir de un .mdx. */
export function preprocessMdx(source: string): string {
  return codeExpressions(unwrapComponents(stripEsm(stripFrontmatter(source))));
}
