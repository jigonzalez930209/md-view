import fs from 'node:fs/promises';
// Local verification for issue #9: panel layout survives a reload.
import { chromium } from 'playwright';
import { appDialog as dialog, BASE_URL as URL, createReporter } from './harness.mjs';

const { check, finish } = createReporter();

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });

await page.getByRole('button', { name: 'View demo' }).click();
await page.waitForTimeout(500);

const workspace = page.locator('main.workspace');
const before = await workspace.getAttribute('style');
const splitter = page.locator('.pane-splitter');
const box = await splitter.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);

const after = await workspace.getAttribute('style');
const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('md-view:prefs') ?? '{}'));
check('dragging the splitter changes the layout', after !== before, `${before} -> ${after}`);
check('split ratio is persisted', typeof prefs.splitRatio === 'number' && prefs.splitRatio > 0.5, String(prefs.splitRatio));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const restored = await page.evaluate(() => {
  const prefs = JSON.parse(localStorage.getItem('md-view:prefs') ?? '{}');
  return prefs.splitRatio;
});
check('ratio survives the reload', restored === prefs.splitRatio, `${restored} vs ${prefs.splitRatio}`);

await browser.close();
finish();
