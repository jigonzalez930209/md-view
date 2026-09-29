// Shared helpers for the end-to-end smoke suites.
//
// Every suite launches its own browser and exits non-zero when a check fails.
// `node e2e/run.mjs` starts the dev server, runs them all and stops it.

export const BASE_URL = 'http://localhost:1420';

export function createReporter() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
  };
  const finish = () => {
    const failed = results.filter((entry) => !entry.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length === 0 ? 0 : 1);
  };
  return { check, finish };
}

/** Path of a fixture folder or file inside e2e/fixtures. */
export function fixture(name) {
  return new URL(`./fixtures/${name}`, import.meta.url).pathname;
}

/** The dialogs the app renders (Radix) share this slot attribute. */
export function appDialog(page) {
  return page.locator('[data-slot="dialog-content"]');
}

export function tab(page, name) {
  return page.locator('button[role="tab"]').filter({ hasText: name });
}

export function editorText(page) {
  return page.locator('.cm-content').last().innerText();
}
