import fs from 'node:fs/promises';
// Local verification for issue #7: large documents are never exported partially without confirmation.
import { chromium } from 'playwright';
import { appDialog as dialog, BASE_URL as URL, createReporter } from './harness.mjs';

const { check, finish } = createReporter();


const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });

/** Opens a document through the hidden <input type=file> the app creates. */
async function openDocument(name, content) {
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.keyboard.press('Control+o'),
  ]);
  await chooser.setFiles({ name, mimeType: 'text/markdown', buffer: Buffer.from(content) });
  await page.waitForTimeout(400);
}

async function exportHtml() {
  await page.getByLabel('Main menu').click();
  await page.getByRole('menuitem', { name: 'Export' }).hover();
  await page.getByRole('menuitem', { name: 'Self-contained HTML' }).click();
}

// --- S1: small document exports without any prompt ---------------------------
const small = '# Small\n\nbody text\n\nFINAL-MARKER\n';
await openDocument('small.md', small);
let downloadPromise = page.waitForEvent('download', { timeout: 15000 });
await exportHtml();
let download = await downloadPromise;
check('small document: no confirmation dialog', await dialog(page).count() === 0);
let body = await fs.readFile(await download.path(), 'utf8');
check('small document: exported in full', body.includes('FINAL-MARKER'));

// --- S2: large document asks before a partial export -------------------------
const lines = [];
for (let index = 0; index < 80000; index += 1) {
  lines.push(`line ${String(index).padStart(5, '0')} with some text to grow the document`);
}
lines.push('FINAL-MARKER');
const big = lines.join('\n');
check('fixture is above the preview limit', big.length > 1_500_000, `${(big.length / 1e6).toFixed(1)} MB`);
await openDocument('big.md', big);
await page.waitForTimeout(800);

// Cancel first: nothing is downloaded.
downloadPromise = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
await exportHtml();
await page.waitForTimeout(300);
check('large document: confirmation dialog appears', await dialog(page).getByText('Large document').isVisible());
await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
check('large document: Cancel aborts the export', (await downloadPromise) === null);

// Then confirm: the export happens and says it is partial.
downloadPromise = page.waitForEvent('download', { timeout: 30000 });
await exportHtml();
await page.waitForTimeout(300);
check('large document: dialog is shown again', await dialog(page).getByText('Large document').isVisible());
await dialog(page).getByRole('button', { name: 'Export what is visible' }).click();
download = await downloadPromise;
body = await fs.readFile(await download.path(), 'utf8');
check('large document: exported only the preview window', !body.includes('FINAL-MARKER'));
check('large document: export is explicitly partial', /Only the visible part/.test(await page.locator('[data-slot="status-bar"], footer, body').first().innerText()));

await browser.close();
finish();
