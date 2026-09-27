---
layout: home

hero:
  name: md-view
  text: Markdown, the way GitHub shows it
  tagline: Desktop viewer and editor with tabs, a folder explorer, a formatting bar and export to PDF, HTML and images.
  image:
    src: /screenshots/split-view.png
    alt: md-view with the editor and the preview side by side
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Download
      link: /deployment/releases
    - theme: alt
      text: GitHub
      link: https://github.com/jigonzalez930209/md-view

features:
  - icon: 🗂️
    title: Tabs like a real editor
    details: One editor per tab, like VS Code. Scroll position, selection, undo history and view mode are kept per document; closing a tab frees its editor.
    link: /guide/tabs
  - icon: 👀
    title: GitHub-style preview
    details: Tables, task lists, alerts, footnotes, KaTeX formulas, Mermaid diagrams, emoji and syntax highlighting, sanitized with DOMPurify.
    link: /guide/preview
  - icon: 🌳
    title: Folder explorer
    details: Open a folder and browse its tree. Every plain-text file can be opened, whatever its extension; binaries stay disabled.
    link: /guide/explorer
  - icon: 🎨
    title: Three palettes, light and dark
    details: GitHub, One Dark and Dracula, each with a light and a dark variant. Mermaid diagrams follow the active palette.
    link: /guide/themes
  - icon: 📤
    title: Export without leaving the app
    details: PDF with page breaks, self-contained HTML, PNG pages in a ZIP, single PNG/JPG/WebP, vector SVG and plain text.
    link: /guide/export
  - icon: ⚡
    title: Built for huge files
    details: A 100 MB document opens in about 1.6 s and switching away from it costs zero frames. Workers and thresholds are tuned in lib/limits.ts.
    link: /guide/large-documents
---

<div class="tip custom-block" style="display:flex;gap:16px;align-items:center;justify-content:center">
  <span>Run it from source in two commands:</span>
  <code>pnpm install &amp;&amp; pnpm app</code>
</div>
