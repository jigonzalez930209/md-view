/**
 * Layout probe: loads the same frontend in Chrome (with the fake Tauri runtime
 * from tauri-mock.js) at the real window size and measures where things are.
 * Nothing from here ends up in the video: the rectangles only tell the real
 * mouse where to click and the camera where to look.
 *
 * It walks the same path as the recording (open the folder, browse, type...)
 * because every step changes the layout of the next one.
 */

import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import * as S from './script.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launchBrowser() {
  const forced = process.env.PROMO_BROWSER;
  if (forced) return chromium.launch({ executablePath: forced });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

/** Returns rectangles (logical pixels, relative to the window) for every target. */
export async function probeLayout({ root, here, demoPath }) {
  const server = await createServer({
    root,
    logLevel: 'error',
    server: { port: 5199, strictPort: false, hmr: false },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0].replace(/\/$/, '');
  const browser = await launchBrowser();

  try {
    const context = await browser.newContext({ viewport: S.APP, deviceScaleFactor: 1 });
    const files = Object.fromEntries(Object.entries(S.FILES).map(([name, body]) => [demoPath(name), body]));
    const git = Object.fromEntries(
      Object.keys(S.FILES).map((name) => [demoPath(name), { text: S.GIT.committed[name] ?? S.FILES[name], branch: S.GIT.branch }]),
    );
    await context.addInitScript((config) => {
      window.__PROMO__ = config;
    }, { files, git, folder: demoPath('').replace(/\/$/, ''), open: S.OPEN.map(demoPath), prefs: S.PREFS });
    await context.addInitScript({ path: join(here, 'tauri-mock.js') });

    const page = await context.newPage();
    await page.goto(`${url}/?promo`);
    await page.waitForSelector('button[aria-label="Recent files"]');
    return await measure(page, demoPath);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function measure(page, demoPath) {
  const rect = (selector) =>
    page.locator(selector).first().evaluate((element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  const settle = async () => {
    await page.waitForFunction(() => !document.querySelector('.mermaid-block.is-loading'));
    await sleep(400);
  };
  const tab = (name) => `[role="tab"]:has-text("${name}")`;
  const treeItem = (name) => `[role="treeitem"][title="${demoPath(name)}"]`;
  const layout = { tabs: {}, tree: {} };

  // Open the folder from the "Open" menu.
  layout.openMenu = await rect('button[aria-label="Recent files"]');
  await page.locator('button[aria-label="Recent files"]').click();
  layout.openFolderItem = await rect('[role="menuitem"]:has-text("Open folder")');
  await page.locator('[role="menuitem"]:has-text("Open folder")').click();
  await page.waitForSelector('[role="treeitem"]');
  await sleep(300);

  // Browse: every click opens a tab, and the tab strip grows.
  for (const name of S.BROWSE) {
    layout.tree[name] = await rect(treeItem(name));
    await page.locator(treeItem(name)).click();
    await page.waitForFunction((label) => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.includes(label), name.split('/').pop());
    await sleep(250);
  }
  await settle();

  layout.workspace = await rect('main.workspace');
  layout.previewPane = await rect('.pane-preview');
  layout.editor = await rect('.pane-editor .cm-content:visible');
  layout.statusBar = await rect('footer.statusbar');
  layout.menuButton = await rect('button[aria-label="Main menu"]');
  for (const name of S.BROWSE) layout.tabs[name] = await rect(tab(name.split('/').pop()));

  // Change markers of notes.md (edited after the last commit).
  await page.locator(tab(S.NOTES)).click();
  await sleep(300);
  layout.notesGutter = await rect('.pane-editor .cm-changeGutter:visible');
  if (process.env.PROMO_PEEK) await page.screenshot({ path: process.env.PROMO_PEEK });
  await page.locator(tab(S.PIPELINE)).click();
  await sleep(300);

  // Type the same text the recording types, then measure what it renders.
  await page.locator('.pane-editor .cm-content:visible').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(S.TYPING.mermaid.map((chunk) => chunk.text).join(''));
  await settle();
  await page.keyboard.insertText(S.TYPING.math.map((chunk) => chunk.text).join(''));
  await settle();
  layout.diagram = await rect('.pane-preview .mermaid-block');
  layout.diagramArt = await rect('.pane-preview .mermaid-block svg');
  layout.formula = await rect('.pane-preview .katex-display >> nth=-1');

  // Export menu (Radix opens the submenu on hover).
  await page.locator(tab(S.PDF_DOC)).click();
  await page.locator('button[aria-label="Main menu"]').click();
  layout.exportItem = await rect('[role="menuitem"]:has-text("Export")');
  await page.locator('[role="menuitem"]:has-text("Export")').hover();
  await sleep(300);
  layout.pdfItem = await rect('[role="menuitem"]:has-text("PDF (paged)")');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await sleep(300);

  // Appearance submenu: theme mode and palettes.
  await page.locator('button[aria-label="Main menu"]').click();
  layout.appearanceItem = await rect('[role="menuitem"]:has-text("Appearance")');
  await page.locator('[role="menuitem"]:has-text("Appearance")').hover();
  await sleep(300);
  const radio = (name) =>
    page.getByRole('menuitemradio', { name, exact: true }).evaluate((element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  layout.appearance = {};
  for (const step of S.THEME_STEPS) layout.appearance[step.item] = await radio(step.item);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: join(process.cwd(), 'scripts/promo/out/peek/probe.png') }).catch(() => {});
  return layout;
}
