// Local verification for issue #9: drafts survive an unexpected exit and can be recovered.
import { chromium } from 'playwright';
import { appDialog as dialog, BASE_URL as URL, createReporter, tab, editorText } from './harness.mjs';

const { check, finish } = createReporter();


const browser = await chromium.launch();
const context = await browser.newContext();
let page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });

async function typeDraft(text) {
  await page.getByRole('button', { name: 'New document' }).click();
  await page.locator('.cm-content').last().click();
  await page.keyboard.type(text);
  await page.waitForTimeout(2200); // draft debounce is 1.5 s
}

// --- S1: recover a draft after a hard exit -----------------------------------
await typeDraft('borrador perdido');
const stored = await page.evaluate(() => localStorage.getItem('md-view:drafts'));
check('draft is written while editing', stored !== null && stored.includes('borrador perdido'));

await page.close(); // no beforeunload: simulates a crash
page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
check('recovery dialog appears after the crash', await dialog(page).getByText('Unsaved drafts').isVisible());
check('dialog says one document', (await dialog(page).innerText()).includes('One document'), await dialog(page).innerText());
await dialog(page).getByRole('button', { name: 'Recover', exact: true }).click();
await page.waitForTimeout(300);
check('recovered tab exists', await tab(page, 'untitled.md').isVisible());
check('recovered content is intact', (await editorText(page)).includes('borrador perdido'));
check('recovered tab is dirty', await tab(page, 'untitled.md').getAttribute('data-dirty') === 'true');

// --- S2: discarding clears the drafts ---------------------------------------
await page.close();
page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await dialog(page).getByRole('button', { name: 'Discard', exact: true }).click();
await page.waitForTimeout(2200);
check('discard leaves no tabs', await page.getByRole('button', { name: 'New document' }).isVisible());
const afterDiscard = await page.evaluate(() => localStorage.getItem('md-view:drafts'));
check('discard clears the draft file', afterDiscard === null, String(afterDiscard));

// --- S3: a clean exit (saved document) leaves no drafts ----------------------
await page.getByRole('button', { name: 'New document' }).click();
await page.locator('.cm-content').last().click();
await page.keyboard.type('se guarda');
await page.waitForTimeout(2000);
// Save it: the tab stops being dirty and no draft should remain after a pause.
const downloadPromise = page.waitForEvent('download');
await page.keyboard.press('Control+s');
await downloadPromise;
await page.waitForTimeout(2000);
const afterSave = await page.evaluate(() => localStorage.getItem('md-view:drafts'));
check('saving removes the draft', afterSave === null, String(afterSave));

await page.close();
page = await context.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
check('no recovery dialog after a clean state', await dialog(page).count() === 0);

await browser.close();
finish();
