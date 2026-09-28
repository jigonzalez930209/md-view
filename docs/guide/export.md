# Export

Everything is exported from **Main menu → Export**. The file chooser proposes the folder of
the document you have open.

![Export submenu](/screenshots/export-menu.png)

## Formats

| Format | What you get |
| --- | --- |
| **PDF (paged)** | A vector document with page breaks, printed by WebKitGTK. Light mode by default; the checkbox in the same menu exports with the current theme instead |
| **Self-contained HTML** | A single `.html` with the CSS, the KaTeX fonts (20 WOFF2 files as data URIs) and every image embedded. Opens offline anywhere |
| **PNG pages (ZIP)** | One A4-proportioned PNG per page at 2× scale, all inside a `.zip` |
| **PNG (full image)** | The whole preview in one image |
| **JPG / WebP** | Same as PNG, encoded with quality 0.92 |
| **SVG** | **Real vector** output: text stays text (selectable and editable in Illustrator, Inkscape or Figma), tables, lists with their markers and checkboxes are drawn as vectors, and KaTeX fonts are embedded |
| **Plain text** | The text of the render, without formatting |

![PDF page exported from the demo](/screenshots/pdf-page.png)

![PNG page exported from the demo](/screenshots/png-page.png)

![Vector SVG exported from the demo](/screenshots/svg-vector.png)

## How each format is produced

- **PDF** is not generated in JavaScript: WebKitGTK prints the live page with the `@media
  print` rules (only the preview, full height, `break-inside: avoid` for tables, images and
  diagrams). That keeps it vectorial and paginated by the browser engine. A **light PDF
  from a dark window** does not repaint the window: the light palette is injected only for
  print (`<style media="print">`) and Mermaid diagrams get a light copy that only print
  shows (`lib/print-theme.ts`), so the screen never flashes.
- **PNG / JPG / WebP** come from [modern-screenshot](https://github.com/qq15725/modern-screenshot).
  Images with `loading="lazy"` are forced to load first, and the scale is reduced
  automatically for very large documents so the canvas stays within memory limits.
- **SVG** uses [dom-to-svg](https://github.com/felixfbecker/dom-to-svg). `dom-to-svg` ignores
  `::marker` pseudo-elements and mishandles `<input type="checkbox">`, so the exporter adds
  the list markers and draws the task checkboxes as inline SVG before converting.
- **HTML** embeds the theme variables, the Markdown stylesheet, the KaTeX stylesheet with
  data-URI fonts, and every local image as a data URI.

## Notes and limits

- Images are inlined through the Tauri backend (`read_file_base64`), so local files work even
  when the webview cannot fetch them directly.
- The preview [zoom](/guide/preview#zoom) is ignored: every format is exported at 100%.
- For **huge documents** the preview only renders the first 2,000 lines: the export contains
  that window, not the whole file.
- The **PDF** export needs the preview visible; if you are in *editor only* mode the app
  switches to the preview for the export and switches back afterwards.
- In the **browser** (development), "export" downloads the file instead of opening a save
  dialog and PDF falls back to the print dialog.
