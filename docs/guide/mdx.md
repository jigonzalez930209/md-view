# MDX

`.mdx` files are Markdown with JSX. md-view does **not** execute anything: it preprocesses
the file so the Markdown parts render normally.

## Supported extensions

| Extension | How it renders |
| --- | --- |
| `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`, `.mdwn`, `.mdtxt`, `.mdtext`, `.mdoc`, `.rmd`, `.qmd` | Markdown |
| `.mdx` | Markdown, after the MDX preprocessing described below |
| `.txt` and any other text file | Markdown by default, with a toggle to the code view |

## What the preprocessing does

`src/lib/mdx.ts` runs before markdown-it:

| Input | Result |
| --- | --- |
| YAML frontmatter (`--- … ---` at the top) | Discarded |
| `import …` / `export …` statements, including multi-line ones | Removed |
| Paired components, `<Note>text</Note>` | Unwrapped: the text is kept |
| Self-closing components, `<Chart data={[1, 2]} />` | Dropped |
| Expressions, `{frontmatter.title}` | Shown as inline code, never evaluated |
| JSX comments, `{/* … */}` | Removed |
| Fragments `<>…</>` | Removed |
| Fenced code blocks | Untouched (no expression rewriting inside) |

![An MDX file rendered](/screenshots/mdx.png)

::: warning No execution
Components are never rendered as React. A `<Chart />` disappears and its props are not
evaluated. What survives is plain HTML, and that HTML goes through the same sanitization as
any other document (see [Security](/reference/security)).
:::

## What MDX does *not* do

- It does not import the components referenced by the document.
- It does not evaluate expressions, so a document that builds its content from JavaScript will
  show placeholders instead of the generated text.
- It does not validate JSX syntax: a broken tag is simply left as text if the patterns above
  don't match.

For technical documentation (READMEs, guides with `<Note>` blocks) the result is the same as
GitHub's: the Markdown renders and the components don't break the page.
