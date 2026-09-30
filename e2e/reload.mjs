import fs from 'node:fs/promises';
// Local verification for issue #3: reload from disk discards local edits and refreshes state.
import { chromium } from 'playwright';
import { BASE_URL as URL, createReporter } from './harness.mjs';

const { check, finish } = createReporter();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });

// Open a document from disk.
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByRole('button', { name: 'Open file' }).click(),
]);
await chooser.setFiles({
  name: 'reload.md',
  mimeType: 'text/markdown',
  buffer: Buffer.from('# Original\n\nbody text\n'),
});
await page.waitForTimeout(400);

const tab = () => page.locator('button[role="tab"]').filter({ hasText: 'reload.md' });
const editorText = () => page.locator('.cm-content').last().innerText();

// Edit: the tab turns dirty.
await page.locator('.cm-content').last().click();
await page.keyboard.press('Control+a');
await page.keyboard.type('local edit that will be discarded');
await page.waitForTimeout(200);
check('editing marks the tab dirty', await tab().getAttribute('data-dirty') === 'true');
check('editor holds the local edit', (await editorText()).includes('local edit'));

// Reload from disk: the local edit is replaced by the file content.
await page.getByLabel('Main menu').click();
await page.getByRole('menuitem', { name: 'Reload from disk' }).click();
await page.waitForTimeout(500);
check('reload restores the file content', (await editorText()).includes('# Original'));
check('reload clears the dirty flag', await tab().getAttribute('data-dirty') === 'false');
check(
  'reload is announced',
  (await page.locator('body').innerText()).includes('Reloaded "reload.md" from disk'),
);

// Saving after a reload keeps working.
await page.locator('.cm-content').last().click();
await page.keyboard.press('Control+a');
await page.keyboard.type('after reload');
await page.waitForTimeout(150);
const downloadPromise = page.waitForEvent('download');
await page.keyboard.press('Control+s');
const download = await downloadPromise;
const saved = await fs.readFile(await download.path(), 'utf8');
check('save after reload writes the new text', saved === 'after reload', JSON.stringify(saved));

await browser.close();
finish();
