// Runs every smoke suite against a fresh dev server.
//
//   node e2e/run.mjs              # all of them
//   node e2e/run.mjs find export  # only the suites whose name contains these

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { BASE_URL } from './harness.mjs';

const filters = process.argv.slice(2);
const suites = readdirSync(new URL('.', import.meta.url))
  .filter((name) => name.endsWith('.mjs'))
  .filter((name) => !['run.mjs', 'harness.mjs'].includes(name))
  .filter((name) => filters.length === 0 || filters.some((filter) => name.includes(filter)))
  .toSorted();

if (suites.length === 0) {
  console.error('No suite matches those filters.');
  process.exit(1);
}

const isWindows = process.platform === 'win32';

console.log(`Starting the dev server for: ${suites.join(', ')}`);
const server = spawn('pnpm', ['dev', '--port', '1420', '--strictPort'], {
  stdio: 'ignore',
  detached: !isWindows,
  shell: isWindows,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`The dev server did not answer on ${BASE_URL}`);
}

const run = (script) =>
  new Promise((resolve) => {
    const scriptPath = fileURLToPath(new URL(script, import.meta.url));
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
    });
    child.on('close', (code) => resolve(code ?? 1));
  });

const failed = [];
try {
  await waitForServer();
  for (const suite of suites) {
    console.log(`\n=== ${suite} ===`);
    const code = await run(suite);
    if (code !== 0) failed.push(suite);
  }
} finally {
  try {
    if (isWindows && server.pid) {
      spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else if (server.pid) {
      process.kill(-server.pid, 'SIGTERM');
    }
  } catch {
    /* already gone */
  }
}

if (failed.length > 0) {
  console.error(`\nFailed suites: ${failed.join(', ')}`);
  process.exit(1);
}
console.log('\nAll suites passed.');
