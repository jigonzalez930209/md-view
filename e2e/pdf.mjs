// Local verification for issue #12: PDF entry availability per platform.
import { chromium } from 'playwright';
import { BASE_URL as URL, createReporter } from './harness.mjs';

const { check, finish } = createReporter();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });

// Browser development uses the print dialog, so PDF is available.
const supported = await page.evaluate(async () => {
  const backend = await import('/src/lib/backend.ts');
  return backend.supportsPdf();
});
check('supportsPdf() is true where printing exists', supported === true, String(supported));

await page.getByRole('button', { name: 'View demo' }).click();
await page.waitForTimeout(600);
await page.getByLabel('Main menu').click();
await page.getByRole('menuitem', { name: 'Export' }).hover();
await page.waitForTimeout(200);

const pdfItem = page.getByRole('menuitem', { name: /PDF/ });
check('PDF entry is in the export menu', await pdfItem.isVisible());
check('PDF entry is enabled when printing is available', (await pdfItem.getAttribute('data-disabled')) === null);
check(
  'the hint explains the format',
  (await pdfItem.innerText()).includes('Vector, with page breaks'),
  (await pdfItem.innerText()).replace(/\n/g, ' | '),
);

// Every other format stays available (regression).
for (const label of ['Self-contained HTML', 'PNG pages', 'Vector, editable']) {
  const item = page.getByRole('menuitem', { name: label });
  check(`"${label}" stays enabled`, (await item.getAttribute('data-disabled')) === null);
}

await browser.close();
finish();
