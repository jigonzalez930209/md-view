import fs from 'node:fs/promises';
// Local verification for issue #2: Save / Discard / Cancel before closing a dirty tab.
import { chromium } from 'playwright';
import { appDialog as dialog, BASE_URL as URL, createReporter, tab } from './harness.mjs';

const { check, finish } = createReporter();


const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));

await page.goto(URL, { waitUntil: 'networkidle' });

async function typeInEditor(text) {
  await page.locator('.cm-content').last().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(text);
  await page.waitForTimeout(150);
}

// --- S1: Cancel keeps the tab -------------------------------------------------
await page.getByRole('button', { name: 'New document' }).click();
await typeInEditor('uno');
check('tab "untitled.md" created and dirty', await tab(page, 'untitled.md').getAttribute('data-dirty') === 'true');

await page.keyboard.press('Control+w');
await page.waitForTimeout(250);
check('dialog shows the dirty document', await dialog(page).getByText('"untitled.md" has unsaved changes.').isVisible());
check('dialog offers Save / Discard / Cancel', await dialog(page).getByRole('button', { name: 'Save', exact: true }).isVisible()
  && await dialog(page).getByRole('button', { name: 'Discard', exact: true }).isVisible()
  && await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).isVisible());
await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
await page.waitForTimeout(200);
check('Cancel closes the dialog', await dialog(page).count() === 0);
check('Cancel keeps the tab open and dirty', await tab(page, 'untitled.md').getAttribute('data-dirty') === 'true');

// --- S2: Discard closes without saving ---------------------------------------
await page.keyboard.press('Control+w');
await page.waitForTimeout(250);
await dialog(page).getByRole('button', { name: 'Discard', exact: true }).click();
await page.waitForTimeout(200);
check('Discard closes the tab', await tab(page, 'untitled.md').count() === 0);
check('welcome screen is back', await page.getByRole('button', { name: 'New document' }).isVisible());

// --- S3: Save writes the document and closes ---------------------------------
await page.getByRole('button', { name: 'New document' }).click();
await typeInEditor('contenido uno');
await page.keyboard.press('Control+w');
await page.waitForTimeout(250);
const [downloadUntitled] = await Promise.all([
  page.waitForEvent('download'),
  dialog(page).getByRole('button', { name: 'Save', exact: true }).click(),
]);
const savedBody = await fs.readFile(await downloadUntitled.path(), 'utf8');
check('Save downloads the document', downloadUntitled.suggestedFilename() === 'untitled.md', downloadUntitled.suggestedFilename());
check('saved content matches the editor', savedBody === 'contenido uno', JSON.stringify(savedBody));
await page.waitForTimeout(200);
check('Save closes the tab', await tab(page, 'untitled.md').count() === 0);

// --- S4: an inactive dirty tab is saved from its own view --------------------
await page.getByRole('button', { name: 'New document' }).click();
await typeInEditor('AAA');
await page.keyboard.press('Control+t');
await typeInEditor('BBB');
check('both tabs are dirty', await tab(page, 'untitled.md').getAttribute('data-dirty') === 'true'
  && await tab(page, 'untitled-2.md').getAttribute('data-dirty') === 'true');
await tab(page, 'untitled.md').focus();
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
check('dialog names the inactive document', await dialog(page).getByText('"untitled.md" has unsaved changes.').isVisible());
const [downloadA] = await Promise.all([
  page.waitForEvent('download'),
  dialog(page).getByRole('button', { name: 'Save', exact: true }).click(),
]);
const bodyA = await fs.readFile(await downloadA.path(), 'utf8');
check('inactive tab saved with its own text', bodyA === 'AAA', JSON.stringify(bodyA));
await page.waitForTimeout(200);
check('saved tab is gone, the other stays', await tab(page, 'untitled.md').count() === 0 && await tab(page, 'untitled-2.md').isVisible());
check('remaining tab is still dirty', await tab(page, 'untitled-2.md').getAttribute('data-dirty') === 'true');

// --- S5: cleanup (Save all only applies to the window-close path, Tauri-only) -
await page.keyboard.press('Control+w');
await page.waitForTimeout(250);
await dialog(page).getByRole('button', { name: 'Discard', exact: true }).click();
await page.waitForTimeout(200);
check('cleanup: no tabs left', await page.getByRole('button', { name: 'New document' }).isVisible());

await browser.close();
finish();
