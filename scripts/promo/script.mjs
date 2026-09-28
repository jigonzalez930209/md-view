/**
 * Storyboard of the promo video: on-screen copy, demo documents, what gets
 * typed and the app preferences. Edit this file to change the video;
 * record.mjs only runs it.
 */

export const OUTPUT = {
  width: 1080,
  height: 1350,
  fps: 30,
  /** Playback speed of the whole video (recording, camera and captions alike). */
  speed: 1.2,
};

/** Real window size of md-view (tauri.conf.json), in logical pixels. */
export const APP = { width: 1180, height: 780 };

/** Recorded at 2× (HiDPI) so camera zooms stay sharp. */
export const SCALE = 2;

export const PREFS = {
  language: 'en',
  themeMode: 'dark',
  palette: 'github',
  pdfLight: true,
  editorFontSize: 15,
  editorLineNumbers: true,
  editorWrap: true,
  previewSyncScroll: true,
  previewFontSize: 17,
  showRecents: false,
  explorerSide: 'left',
};

/** Folder (inside $HOME, so the app shows it as ~/…) created for the recording and removed afterwards. */
export const DEMO_DIR = 'Documents/md-view-demo';
export const PIPELINE = 'pipeline.md';
export const NOTES = 'notes.md';

const PIPELINE_START = `# Release pipeline

`;

/**
 * Typed into pipeline.md. Each chunk is typed continuously and followed by a
 * pause: the preview re-renders on pauses, so the diagram grows line by line.
 */
export const TYPING = {
  mermaid: [
    { text: '```mermaid\nflowchart TD\nA[Write Markdown] --> B{Share it?}\n', pause: 400 },
    { text: 'B -->|PDF| C[Export]\n', pause: 400 },
    { text: 'B -->|Web| D[HTML]\n```\n', pause: 700 },
  ],
  math: [
    { text: '\n$$\n\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}\n$$\n', pause: 600 },
  ],
};

const NOTES_CONTENT = `# Field notes

Everything below renders offline, straight from plain Markdown.

## Checklist

- [x] Tables, footnotes and task lists
- [x] GitHub-style syntax highlighting
- [x] Mermaid diagrams and KaTeX math
- [ ] Share the release notes

## Export formats

| Format | Output |
| --- | --- |
| PDF | Paged, vector text |
| HTML | Single self-contained file |
| PNG / SVG | Full page or per page |

## Parser snippet

\`\`\`ts
export function render(markdown: string): string {
  const tokens = parser.parse(markdown, {});
  return renderer.render(tokens, parser.options, {});
}
\`\`\`

## Formulas

Euler's identity $e^{i\\pi} + 1 = 0$ sits inline, and blocks work too:

$$
\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}
$$

## Sequence

\`\`\`mermaid
sequenceDiagram
  User->>md-view: Open notes.md
  md-view-->>User: Preview in ms
\`\`\`

## Next steps

1. Split view while writing
2. Preview mode to read
3. Export when it is ready

> Tip: every tab keeps its own scroll position and history.
`;

const README = `md-view demo project
====================

Plain text files open right next to the Markdown ones:
logs, notes, CSV, config files and source code.

Everything here is tracked with git, so the editor marks
the lines changed since the last commit.
`;

const TODO = `TODO
----
[x] Draft the release pipeline
[x] Collect the field notes
[ ] Add the diagram to pipeline.md
[ ] Export the PDF for the team
[ ] Post the video on LinkedIn
`;

const CHANGELOG = `0.3.0
  - Change markers against git HEAD in the editor gutter
  - Branch and changed lines in the status bar
  - Appearance menu stays open while trying themes

0.2.2
  - Diagrams keep their last valid version while typing
  - Faster tab switching
`;

const BUILD_LOG = `[12:04:31] vite v6 building for production...
[12:04:33] ✓ 1843 modules transformed.
[12:04:35] dist/index.html            0.61 kB
[12:04:35] dist/assets/index.js     412.30 kB
[12:04:36] Finished release [optimized] target(s) in 41.2s
`;

export const FILES = {
  [PIPELINE]: PIPELINE_START,
  [NOTES]: NOTES_CONTENT,
  'README.txt': README,
  'todo.txt': TODO,
  'changelog.txt': CHANGELOG,
  'logs/build.log': BUILD_LOG,
};

/**
 * The demo folder is a git repository: these are the versions in the last
 * commit (files not listed are committed as they are on disk). notes.md was
 * edited afterwards, so it opens with modified and removed lines flagged.
 */
export const GIT = {
  branch: 'main',
  committed: {
    [NOTES]: NOTES_CONTENT.replace('- [x] Mermaid diagrams and KaTeX math', '- [ ] Mermaid diagrams and KaTeX math')
      .replace('Everything below renders offline', 'Everything below renders locally')
      .replace('## Export formats', '- [ ] Record the demo video\n\n## Export formats'),
  },
};

/** Passed on the command line: the app starts empty and the folder is opened on camera. */
export const OPEN = [];

/** Files clicked in the explorer, in order (paths inside DEMO_DIR). */
export const BROWSE = ['README.txt', 'todo.txt', NOTES, PIPELINE];

/**
 * Appearance scene: menu items clicked in order (their English labels). The
 * menu stays open, so every change repaints the whole app behind it.
 */
export const THEME_STEPS = [
  { item: 'Light', hold: 700 },
  { item: 'Dracula', hold: 700 },
  { item: 'Dark', hold: 900 },
];

/** Seconds the end card stays on screen. */
export const END_HOLD = 2.4;

/** Document exported in the PDF scene (the active tab at that point): the one just typed. */
export const PDF_DOC = PIPELINE;

/**
 * External app that opens the exported PDF on camera (a real window in the
 * same X display). Falls back to a PDF card if it is not installed.
 */
export const PDF_VIEWER = { command: 'papers', windowClass: 'papers', name: 'GNOME Papers' };
/** On-screen copy per scene: headline above the window, detail below it. */
export const CAPTIONS = {
  launch: {
    kicker: 'Native · Rust + Tauri · no Electron',
    title: 'A 7.7 MB Markdown editor',
    detail: '',
  },
  folder: {
    kicker: 'Explorer',
    title: 'Open a whole folder',
    detail: 'Markdown, plain text, logs and code side by side',
  },
  changes: {
    kicker: 'Git',
    title: 'See what changed since the last commit',
    detail: 'Change markers in the gutter, branch in the status bar',
  },
  mermaid: {
    kicker: 'Mermaid',
    title: 'Diagrams render as you type',
    detail: 'Write a ```mermaid block, see the diagram',
  },
  math: {
    kicker: 'KaTeX',
    title: 'LaTeX math, live',
    detail: 'Inline $…$ and display $$…$$ formulas',
  },
  tabs: {
    kicker: 'Tabs',
    title: 'Every tab keeps its place',
    detail: 'Back to notes.md, scrolled right where you left it',
  },
  themes: {
    kicker: 'Themes',
    title: 'Light, dark & color palettes',
    detail: 'GitHub · One Dark · Dracula, applied live',
  },
  pdf: {
    kicker: 'Export',
    title: 'PDF export built in',
    detail: 'Also HTML, PNG, SVG and plain text',
  },
  viewer: {
    kicker: 'Export',
    title: 'A real PDF, vector text',
    detail: 'The exported file, opened in GNOME Papers',
  },
  /** Only on the cover image, not in the video. */
  cover: {
    kicker: 'Open source · 7.7 MB · native',
    title: 'Markdown, Mermaid & LaTeX, live',
    detail: '',
  },
};

export const END_CARD = {
  name: 'md-view',
  tagline: 'Markdown viewer & editor',
  facts: 'Free · Open source · Linux · macOS · Windows',
  url: 'github.com/jigonzalez930209/md-view',
};

/**
 * Show the measured launch time on screen. Off by default: in Xvfb (software
 * rendering, fresh D-Bus session) it is slower than on a real desktop.
 */
export const LAUNCH_TIMER = false;

/** Camera: maximum zoom used in close-ups (1 = whole window). */
export const CAMERA = { closeUp: 1.5, medium: 1, transition: 0.9 };
