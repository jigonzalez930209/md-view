#!/usr/bin/env bash
#
# Prepare and publish an md-view release.
#
# Updates the version in package.json, src-tauri/tauri.conf.json and
# src-tauri/Cargo.toml, commits, creates the tag and pushes it. Pushing the tag
# starts .github/workflows/release.yml, which builds the installers for
# Linux/macOS/Windows and uploads them to a draft release.
#
# Usage: pnpm release 0.2.0   (or: scripts/release.sh v0.2.0)

set -euo pipefail

version="${1:-}"
if [[ -z "$version" ]]; then
  echo "Usage: pnpm release <version>    (e.g. pnpm release 0.2.0)" >&2
  exit 1
fi
version="${version#v}"

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "'$version' does not look like a valid version (expected 1.2.3)." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

tag="v$version"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "There are uncommitted changes; commit them before releasing." >&2
  exit 1
fi

if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "Tag $tag already exists." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "You are on '$branch'; switch to main before releasing." >&2
  exit 1
fi

echo "Updating the version to $version..."

node - "$version" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');

const version = process.argv[2];

// package.json and tauri.conf.json: the first "version" key.
for (const path of ['package.json', 'src-tauri/tauri.conf.json']) {
  const raw = readFileSync(path, 'utf8');
  const updated = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (updated === raw) throw new Error(`Could not update the version in ${path}`);
  writeFileSync(path, updated.endsWith('\n') ? updated : `${updated}\n`);
  console.log(`  ${path} -> ${version}`);
}

// Cargo.toml: only the first `version = "..."` (the [package] one).
const cargoPath = 'src-tauri/Cargo.toml';
const cargo = readFileSync(cargoPath, 'utf8');
const updatedCargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
if (updatedCargo === cargo) throw new Error(`Could not update the version in ${cargoPath}`);
writeFileSync(cargoPath, updatedCargo);
console.log(`  ${cargoPath} -> ${version}`);
NODE

# Refresh the package version inside Cargo.lock.
cargo check --quiet --manifest-path src-tauri/Cargo.toml

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): $tag"
git tag "$tag"

echo "Pushing the commit and the tag..."
git push origin HEAD
git push origin "$tag"

echo
echo "Done: $tag published. GitHub Actions is building the installers:"
echo "  https://github.com/jigonzalez930209/md-view/actions"
echo "When they finish, review the draft release and press Publish."
