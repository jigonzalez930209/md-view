import { defineConfig } from 'vitepress';

const repo = 'https://github.com/jigonzalez930209/md-view';

export default defineConfig({
  // GitHub Pages for a project site: https://<user>.github.io/md-view/
  // Change to '/' when publishing on a custom domain.
  base: '/md-view/',

  lang: 'en',
  title: 'md-view',
  description:
    'Desktop Markdown viewer and editor: tabs, GitHub-style preview, folder explorer and export to PDF, HTML and images.',

  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/md-view/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#0969da' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'md-view' }],
    ['meta', {
      property: 'og:description',
      content: 'Markdown viewer and editor with a GitHub-style preview, tabs and export.',
    }],
  ],

  markdown: {
    lineNumbers: true,
    theme: { light: 'github-light', dark: 'github-dark' },
  },

  // Ready for more languages: add an 'es' locale with its own folder and sidebar.
  locales: {
    root: { label: 'English', lang: 'en' },
  },

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'md-view',

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '^/guide/' },
      { text: 'Reference', link: '/reference/architecture', activeMatch: '^/reference/' },
      { text: 'Development', link: '/development/setup', activeMatch: '^/development/' },
      { text: 'Deployment', link: '/deployment/releases', activeMatch: '^/deployment/' },
      { text: 'FAQ', link: '/faq' },
    ],

    sidebar: [
      {
        text: 'Guide',
        link: '/guide/',
        items: [
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Editor', link: '/guide/editor' },
          { text: 'Formatting bar', link: '/guide/formatting' },
          { text: 'Preview', link: '/guide/preview' },
          { text: 'Tabs', link: '/guide/tabs' },
          { text: 'Folder explorer', link: '/guide/explorer' },
          { text: 'Export', link: '/guide/export' },
          { text: 'Settings', link: '/guide/settings' },
          { text: 'Themes and palettes', link: '/guide/themes' },
          { text: 'Languages', link: '/guide/languages' },
          { text: 'Shortcuts', link: '/guide/shortcuts' },
          { text: 'Large documents', link: '/guide/large-documents' },
          { text: 'MDX', link: '/guide/mdx' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Architecture', link: '/reference/architecture' },
          { text: 'Backend (Tauri)', link: '/reference/backend' },
          { text: 'Performance', link: '/reference/performance' },
          { text: 'Security', link: '/reference/security' },
        ],
      },
      {
        text: 'Development',
        items: [
          { text: 'Setup', link: '/development/setup' },
          { text: 'Project structure', link: '/development/structure' },
          { text: 'Tests', link: '/development/tests' },
          { text: 'Code style', link: '/development/code-style' },
          { text: 'Contributing', link: '/development/contributing' },
        ],
      },
      {
        text: 'Deployment',
        items: [
          { text: 'Publishing releases', link: '/deployment/releases' },
          { text: 'Workflows', link: '/deployment/workflows' },
          { text: 'Signing binaries', link: '/deployment/signing' },
          { text: 'Icons', link: '/deployment/icons' },
          { text: 'Troubleshooting', link: '/deployment/troubleshooting' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: repo }],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Search', buttonAriaLabel: 'Search' },
          modal: {
            displayDetails: 'Display detailed list',
            resetButtonTitle: 'Reset search',
            backButtonTitle: 'Close search',
            noResultsText: 'No results for',
            footer: {
              selectText: 'to select',
              selectKeyAriaLabel: 'Enter',
              navigateText: 'to navigate',
              navigateUpKeyAriaLabel: 'Arrow up',
              navigateDownKeyAriaLabel: 'Arrow down',
              closeText: 'to close',
              closeKeyAriaLabel: 'Escape',
            },
          },
        },
      },
    },

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    outline: { label: 'On this page', level: [2, 3] },
    docFooter: { prev: 'Previous page', next: 'Next page' },
    lastUpdatedText: 'Last updated',
    returnToTopLabel: 'Return to top',
    sidebarMenuLabel: 'Menu',
    darkModeSwitchLabel: 'Appearance',
    lightModeSwitchTitle: 'Switch to light theme',
    darkModeSwitchTitle: 'Switch to dark theme',

    footer: {
      message: 'Released under the MIT license. Syntax highlighting palettes follow highlight.js.',
      copyright: 'Built with Tauri, React and CodeMirror',
    },
  },
});
