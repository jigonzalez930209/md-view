// Local verification for issue #10: find in preview and the headings outline.
import { chromium } from 'playwright';
import { BASE_URL as URL, createReporter } from './harness.mjs';

const { check, finish } = createReporter();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'View demo' }).click();
await page.waitForTimeout(800);

// --- Find in preview ---------------------------------------------------------
await page.keyboard.press('Control+f');
await page.waitForTimeout(200);
const findBar = page.getByRole('search');
check('Ctrl+F opens the find bar', await findBar.isVisible());

await page.locator('[role="search"] input').fill('Markdown');
await page.waitForTimeout(300);
const counter = await findBar.locator('span[aria-live="polite"]').innerText();
const match = /^(\d+)\/(\d+)$/.exec(counter.trim());
check('matches are counted', match !== null && Number(match[2]) > 1, counter);
check('matches are highlighted', (await page.locator('mark.preview-match').count()) === Number(match?.[2]));
check('one match is current', (await page.locator('mark.preview-match--current').count()) === 1);

const first = Number(match[1]);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const afterEnter = /^(\d+)\/(\d+)$/.exec((await findBar.locator('span[aria-live="polite"]').innerText()).trim());
check('Enter moves to the next match', Number(afterEnter[1]) !== first, `${first} -> ${afterEnter[1]}`);

await page.keyboard.press('Shift+Enter');
await page.waitForTimeout(200);
const afterShift = /^(\d+)\/(\d+)$/.exec((await findBar.locator('span[aria-live="polite"]').innerText()).trim());
check('Shift+Enter goes back', Number(afterShift[1]) === first, `${afterEnter[1]} -> ${afterShift[1]}`);

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes the bar', (await findBar.count()) === 0);
check('Escape removes the highlights', (await page.locator('mark.preview-match').count()) === 0);
check('text is intact after closing', (await page.locator('article.markdown-body').innerText()).includes('Markdown'));

// --- Outline -----------------------------------------------------------------
await page.getByRole('button', { name: 'Outline' }).click();
await page.waitForTimeout(300);
const outline = page.locator('aside.preview-outline');
check('outline panel opens', await outline.isVisible());
const entries = outline.locator('button.preview-outline-item');
const count = await entries.count();
check('outline lists the headings', count > 3, String(count));

const scroller = page.locator('.preview-scroll');
const beforeScroll = await scroller.evaluate((node) => node.scrollTop);
await entries.nth(Math.min(count - 1, 6)).click();
await page.waitForTimeout(900);
const afterScroll = await scroller.evaluate((node) => node.scrollTop);
check('clicking a heading scrolls the preview', afterScroll > beforeScroll, `${beforeScroll} -> ${afterScroll}`);

const current = await outline.locator('button[aria-current="true"]').count();
check('the current heading is marked', current === 1, String(current));

await page.getByRole('button', { name: 'Outline' }).click();
await page.waitForTimeout(200);
check('outline closes', (await outline.count()) === 0);

await browser.close();
finish();
