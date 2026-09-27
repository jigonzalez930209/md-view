/**
 * MDX preprocessing.
 *
 * MDX is Markdown + JSX: ESM statements (`import`/`export`), components
 * (`<Note>`, `<Chart />`) and `{...}` expressions. Here we execute nothing:
 *
 * - the YAML frontmatter is discarded,
 * - `import`/`export` statements are removed (including multiline ones),
 * - custom components are unwrapped (their content is kept) and self-closing
 *   ones are discarded,
 * - `{...}` expressions remain visible as inline code.
 *
 * The HTML/JSX that survives goes through the same Markdown and DOMPurify.
 */

const HTML_TAGS = new Set([
  'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'cite', 'code', 'col',
  'colgroup', 'data', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li',
  'mark', 'ol', 'p', 'picture', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'section', 'small',
  'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
  'thead', 'time', 'tr', 'u', 'ul', 'var', 'video', 'wbr',
]);

/** Removes a `--- ... ---` block at the start (YAML frontmatter). */
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

/** Strips `import ...` / `export ...`, even when they span several lines. */
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

/** Unwraps custom components while keeping the content. */
export function unwrapComponents(source: string): string {
  let text = source;
  const component = /<([A-Z][\w.]*)(?:\s[^<>]*)?\/>/g;
  const paired = /<([A-Z][\w.]*)(?:\s[^<>]*)?>([\s\S]*?)<\/\1>/g;

  // Several passes in case there are nested components.
  for (let pass = 0; pass < 4; pass += 1) {
    const next = text
      .replace(paired, (_full, name: string, inner: string) => (isHtmlTag(name) ? _full : inner))
      .replace(component, (_full, name: string) => (isHtmlTag(name) ? _full : ''));
    if (next === text) break;
    text = next;
  }

  return text.replace(/<\/?>/g, '');
}

/** Turns `{...}` expressions into inline code, outside the fences. */
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
        // We copy the inline code span as is.
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
            // JSX comment: discarded.
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

/** Markdown ready for markdown-it from an .mdx. */
export function preprocessMdx(source: string): string {
  return codeExpressions(unwrapComponents(stripEsm(stripFrontmatter(source))));
}
