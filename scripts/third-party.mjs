// Generates THIRD-PARTY.md from the production dependency tree.
//
//   node scripts/third-party.mjs          # writes the file
//   node scripts/third-party.mjs --check  # fails if the file is out of date
//   node scripts/third-party.mjs --strict # also fails on packages with no license
//
// The list covers the production dependencies (what can end up in the bundle:
// mermaid, CodeMirror, React, KaTeX, highlight.js...), not the whole dev tree.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT = 'THIRD-PARTY.md';
const LICENSE_FILE = /^(licen[cs]e|copying|copyright)(\.(md|txt|markdown))?$/i;

/**
 * Packages whose manifest omits the license field. Verified by hand from the
 * license file each package ships (khroma ships the MIT text without declaring it).
 */
const KNOWN_LICENSES = {
  khroma: 'MIT',
};

function groupedLicenses() {
  const raw = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function licenseText(directory) {
  if (!directory || !fs.existsSync(directory)) return null;
  let best = null;
  for (const name of fs.readdirSync(directory)) {
    if (!LICENSE_FILE.test(name)) continue;
    try {
      const text = fs.readFileSync(path.join(directory, name), 'utf8').trim();
      if (text.length > (best?.length ?? 0)) best = text;
    } catch {
      /* unreadable: skip */
    }
  }
  return best;
}

const groups = groupedLicenses();
const rows = [];
const unknown = [];
const textsByGroup = new Map();

for (const [rawLicense, packages] of Object.entries(groups)) {
  for (const entry of packages) {
    const license = KNOWN_LICENSES[entry.name] ?? rawLicense;
    const versions = [...new Set(entry.versions ?? [])].join(', ');
    const directory = entry.paths?.[0] ?? null;
    rows.push({ name: entry.name, versions, license });
    if (license === 'Unknown' || license === '') unknown.push(`${entry.name}@${versions}`);

    const text = licenseText(directory);
    if (!text) continue;
    const normalized = text.replace(/\s+/g, ' ');
    if (!textsByGroup.has(license)) textsByGroup.set(license, new Map());
    const group = textsByGroup.get(license);
    if (!group.has(normalized)) group.set(normalized, { text, names: [] });
    group.get(normalized).names.push(entry.name);
  }
}

rows.sort((a, b) => a.name.localeCompare(b.name));

const lines = [
  '# Third-party notices',
  '',
  'md-view is MIT licensed (see `LICENSE`). It bundles the production dependencies below,',
  'listed with their license and the full texts the packages ship. The file is generated',
  'from the production dependency tree with `pnpm notices`; CI fails when it is out of date.',
  '',
  '## Packages',
  '',
  '| Package | Version | License |',
  '| --- | --- | --- |',
  ...rows.map((row) => `| ${row.name} | ${row.versions} | ${row.license} |`),
  '',
  '## License texts',
  '',
];

for (const [license, texts] of [...textsByGroup.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`### ${license}`, '');
  for (const entry of texts.values()) {
    const names = [...new Set(entry.names)].sort().join(', ');
    lines.push(`Used by: ${names}`, '', '```', entry.text, '```', '');
  }
}

if (unknown.length > 0) {
  lines.push('## Packages without a declared license', '');
  lines.push('These declare no license and need a manual review before a release:', '');
  for (const entry of unknown.sort()) lines.push(`- ${entry}`);
  lines.push('');
}

const generated = lines.join('\n');
const check = process.argv.includes('--check');
const strict = process.argv.includes('--strict');

if (check) {
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (current !== generated) {
    console.error(`${OUTPUT} is out of date: run 'pnpm notices' and commit the result.`);
    process.exit(1);
  }
  console.log(`${OUTPUT} is up to date (${rows.length} packages)`);
} else {
  fs.writeFileSync(OUTPUT, generated);
  console.log(`Wrote ${OUTPUT}: ${rows.length} packages, ${textsByGroup.size} license groups`);
}

if (unknown.length > 0) {
  const message = `Packages without a declared license: ${unknown.length}`;
  if (strict) {
    console.error(message);
    console.error(unknown.sort().join(', '));
    process.exit(1);
  }
  console.warn(message);
}
