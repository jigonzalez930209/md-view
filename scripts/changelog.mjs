#!/usr/bin/env node
/**
 * Changelog helper.
 *
 *   node scripts/changelog.mjs generate [version] [--write] [--since <tag>]
 *   node scripts/changelog.mjs extract <version>
 *
 * `generate` builds the section for a version from the commits since the
 * previous tag, grouped by Conventional Commit type, and prints it. With
 * `--write` it also prepends it to CHANGELOG.md (creating the file the first
 * time). For the very first version it writes "First release." instead of
 * listing commits, because there is no previous version to compare against.
 *
 * `extract` prints the section of a version already present in CHANGELOG.md;
 * the release workflow uses it as the release body.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG = resolve(ROOT, 'CHANGELOG.md');
const REPO = 'https://github.com/jigonzalez930209/md-view';

const HEADER = `# Changelog

All notable changes to md-view are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;

/** Conventional Commit type -> section title (order matters). */
const GROUPS = [
  ['Added', ['feat']],
  ['Fixed', ['fix']],
  ['Performance', ['perf']],
  ['Changed', ['refactor']],
  ['Documentation', ['docs']],
  ['Tests', ['test']],
  ['Maintenance', ['build', 'ci', 'chore', 'style', 'revert']],
];
const KNOWN = new Set(GROUPS.flatMap(([, types]) => types));

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function previousTag() {
  try {
    return git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']);
  } catch {
    return '';
  }
}

function parseCommits(since) {
  if (!since) return [];
  const raw = git(['log', '--no-merges', '--pretty=format:%h\t%s', `${since}..HEAD`]);
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject] = line.split('\t');
      const match = subject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.+)$/i);
      return {
        hash,
        subject,
        type: match ? match[1].toLowerCase() : '',
        text: match ? match[3] : subject,
      };
    })
    .filter((commit) => !/^chore\(release\)/.test(commit.subject));
}

function section(version, since, commits) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`## [${version}] - ${date}`, ''];

  if (!since) {
    lines.push('- First release.', '');
  } else if (commits.length === 0) {
    lines.push('- No changes.', '');
  } else {
    for (const [title, types] of GROUPS) {
      const entries = commits.filter((commit) => types.includes(commit.type));
      if (entries.length === 0) continue;
      lines.push(`### ${title}`, '');
      for (const commit of entries) lines.push(`- ${commit.text} (${commit.hash})`);
      lines.push('');
    }
    const others = commits.filter((commit) => !KNOWN.has(commit.type));
    if (others.length > 0) {
      lines.push('### Other', '');
      for (const commit of others) lines.push(`- ${commit.subject} (${commit.hash})`);
      lines.push('');
    }
  }

  if (since) {
    lines.push(`**Full changelog**: ${REPO}/compare/${since}...v${version}`, '');
  }

  return lines.join('\n');
}

function generate(argv) {
  const version = argv.find((arg) => /^[0-9]/.test(arg)) ?? '';
  const write = argv.includes('--write');
  const sinceFlag = argv.indexOf('--since');
  const since = sinceFlag >= 0 ? argv[sinceFlag + 1] : previousTag();
  const commits = parseCommits(since);
  const text = section(version || '(next)', since, commits);

  if (!write) {
    console.log(text);
    return;
  }

  const previous = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : '';
  const start = previous.indexOf('\n## ');
  const rest = start >= 0 ? previous.slice(start + 1) : '';
  writeFileSync(CHANGELOG, `${HEADER}\n${text}\n${rest}`);
  console.log(`CHANGELOG.md updated with ${version}`);
}

function extract(argv) {
  const version = argv.find((arg) => /^[0-9]/.test(arg));
  if (!version || !existsSync(CHANGELOG)) return;
  const changelog = readFileSync(CHANGELOG, 'utf8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = changelog.match(
    new RegExp(`(?:^|\\n)## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`),
  );
  if (match) console.log(match[1].trim());
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'generate') generate(rest);
else if (command === 'extract') extract(rest);
else {
  console.error('Usage: changelog.mjs generate [version] [--write] | extract <version>');
  process.exit(1);
}
