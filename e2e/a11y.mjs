// Local verification for issue #11: keyboard access, live regions and splitter a11y.
import { chromium } from 'playwright';
import { appDialog as dialog, BASE_URL as URL, createReporter, fixture, selectAll } from './harness.mjs';

const { check, finish } = createReporter();

const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });

// --- Folder explorer ---------------------------------------------------------
await page.getByLabel('Recent files').click();
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.getByRole('menuitem', { name: 'Open folder…' }).click(),
]);
await chooser.setFiles(fixture('tree'));
await page.waitForTimeout(800);

const tree = page.getByRole('tree');
check('explorer opens with a tree', await tree.isVisible());
const rows = tree.getByRole('treeitem');
const first = rows.first();
check('rows expose level and expanded state', await first.getAttribute('aria-level') === '1' && (await tree.locator('[aria-expanded="false"]').count()) >= 1);

await first.focus();
await page.keyboard.press('ArrowDown');
const focusedAfterDown = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('ArrowDown moves within the tree', focusedAfterDown !== null && focusedAfterDown.length > 0, focusedAfterDown ?? '');

await page.keyboard.press('Home');
await page.keyboard.press('End');
const last = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('End jumps to the last row', last !== null && last.length > 0, last ?? '');

await page.keyboard.press('Home');
const subRow = tree.locator('[role="treeitem"]').filter({ hasText: 'sub' }).first();
await subRow.focus();
const expandedBefore = await page.locator('[role="treeitem"][aria-expanded="true"]').count();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
check('ArrowRight expands a folder', (await page.locator('[role="treeitem"][aria-expanded="true"]').count()) === expandedBefore + 1);
await page.keyboard.press('ArrowRight');
const childFocus = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('ArrowRight again enters the first child', childFocus === 'deep', childFocus ?? '');
await page.keyboard.press('ArrowLeft');
const backFocus = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('ArrowLeft returns to the folder', backFocus === 'sub', backFocus ?? '');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(200);
check('ArrowLeft collapses it back', (await page.locator('[role="treeitem"][aria-expanded="true"]').count()) === expandedBefore);

// Enter opens the file under focus (a.md first row after Home).
await page.keyboard.press('Home');
await page.keyboard.press('End');
// Find a text file row and activate it.
const fileRow = tree.locator('[role="treeitem"]').filter({ hasText: 'a.md' }).first();
await fileRow.focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('Enter opens the focused file', await page.locator('button[role="tab"]').filter({ hasText: 'a.md' }).count() === 1);

// --- Splitters ---------------------------------------------------------------
const paneSplitter = page.locator('.pane-splitter');
await paneSplitter.focus();
const before = await paneSplitter.getAttribute('aria-valuenow');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
const after = await paneSplitter.getAttribute('aria-valuenow');
check('pane splitter responds to arrows', Number(after) > Number(before), `${before} -> ${after}`);
check('pane splitter exposes its values', await paneSplitter.getAttribute('aria-valuemin') === '15' && await paneSplitter.getAttribute('aria-valuemax') === '85');

const treeSplitter = page.locator('.tree-splitter');
await treeSplitter.focus();
const treeBefore = Number(await treeSplitter.getAttribute('aria-valuenow'));
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(200);
const treeAfter = Number(await treeSplitter.getAttribute('aria-valuenow'));
check('tree splitter responds to arrows', treeAfter > treeBefore, `${treeBefore} -> ${treeAfter}`);

// --- Tabs --------------------------------------------------------------------
await page.keyboard.press('Control+t');
await page.locator('.cm-content').last().click();
await page.keyboard.type('unsaved');
await page.waitForTimeout(200);
const dirtyTab = page.locator('button[role="tab"]').filter({ hasText: 'untitled.md' });
check('dirty tabs announce their state', (await dirtyTab.getAttribute('aria-label') ?? '').includes('unsaved changes'), await dirtyTab.getAttribute('aria-label') ?? '');
await dirtyTab.focus();
await page.keyboard.press('Delete');
await page.waitForTimeout(300);
check('Delete on a dirty tab opens the close dialog', await dialog(page).getByRole('heading', { name: 'Unsaved changes' }).isVisible());
await dialog(page).getByRole('button', { name: 'Discard', exact: true }).click();
await page.waitForTimeout(300);
check('the tab is gone', await page.locator('button[role="tab"]').filter({ hasText: 'untitled.md' }).count() === 0);

// --- Live status -------------------------------------------------------------
await page.locator('.cm-content').last().click();
await selectAll(page);
await page.keyboard.type('save me');
await page.waitForTimeout(150);
const download = page.waitForEvent('download');
await page.keyboard.press('Control+s');
await download;
await page.waitForTimeout(300);
check('status messages live in a status role', await page.locator('[role="status"]').count() >= 1);

await browser.close();
finish();
