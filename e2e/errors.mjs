// Local verification for issue #8: backend error codes are translated, detail kept.
import { chromium } from 'playwright';
import { appDialog as dialog, BASE_URL as URL, createReporter } from './harness.mjs';

const { check, finish } = createReporter();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
await page.goto(URL, { waitUntil: 'networkidle' });

const messages = await page.evaluate(async () => {
  const backend = await import('/src/lib/backend.ts');
  return [
    backend.friendlyError(new Error('not_found: /tmp/x.md')),
    backend.friendlyError(new Error('permission_denied: /root/a.md: os error 13')),
    backend.friendlyError(new Error('too_large: 512 MB; the limit is 256 MB')),
    backend.friendlyError(new Error('read_only: /tmp/locked.md')),
    backend.friendlyError(new Error('invalid_encoding: /tmp/latin.md: not valid UTF-8 text')),
    backend.friendlyError(new Error('unsupported: PDF')),
    backend.friendlyError(new Error('plain failure without a code')),
  ];
});

check('not_found is translated', messages[0] === 'File not found: /tmp/x.md', messages[0]);
check('permission_denied keeps the os detail', messages[1] === 'No permission to access it: /root/a.md: os error 13', messages[1]);
check('too_large is translated', messages[2] === 'Too large to open (512 MB; the limit is 256 MB)', messages[2]);
check('read_only is translated', messages[3] === 'Read-only file: /tmp/locked.md', messages[3]);
check('invalid_encoding is translated', messages[4] === 'Not valid text: /tmp/latin.md: not valid UTF-8 text', messages[4]);
check('unsupported is translated', messages[5] === 'Not supported on this system: PDF', messages[5]);
check('unknown errors pass through untouched', messages[6] === 'plain failure without a code', messages[6]);
check('no code leaks into the visible message', !messages.slice(0, 6).some((message) => /^[a-z_]+:/.test(message)));

// The Spanish dictionary covers the same codes (through the app's own language).
await page.evaluate(() => {
  const raw = localStorage.getItem('md-view:prefs');
  const prefs = raw ? JSON.parse(raw) : {};
  localStorage.setItem('md-view:prefs', JSON.stringify({ ...prefs, language: 'es' }));
});
await page.reload({ waitUntil: 'networkidle' });
const spanish = await page.evaluate(async () => {
  const backend = await import('/src/lib/backend.ts');
  return backend.friendlyError(new Error('not_found: /tmp/x.md'));
});
await page.evaluate(() => {
  const raw = localStorage.getItem('md-view:prefs');
  const prefs = raw ? JSON.parse(raw) : {};
  localStorage.setItem('md-view:prefs', JSON.stringify({ ...prefs, language: 'en' }));
});
check('codes are translated in Spanish too', spanish === 'No se encontró el archivo: /tmp/x.md', spanish);

await browser.close();
finish();
