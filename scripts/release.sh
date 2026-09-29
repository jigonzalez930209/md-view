#!/usr/bin/env bash
#
# Prepare and publish an md-view release.
#
# Updates the version in package.json, src-tauri/tauri.conf.json and
# src-tauri/Cargo.toml, adds the changelog entry for this version (the commits
# since the previous tag), commits, creates the tag and pushes it. Pushing the
# tag starts .github/workflows/release.yml, which builds the installers for
# Linux/macOS/Windows and uploads them to a draft release.
#
# Usage:
#   pnpm release 0.2.0                 bump, changelog, commit, tag and push
#   pnpm release 0.2.0 --no-push       the same, but keeps the tag local
#   pnpm release 0.2.0 --dry-run       shows what would change, touches nothing
#   pnpm release 0.2.0 --no-changelog  skips the changelog entry
#
# Run it from a clean working tree on main (except with --dry-run).

set -euo pipefail

version=""
dry_run="no"
push="yes"
changelog="yes"

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run="yes" ;;
    --no-push) push="no" ;;
    --no-changelog) changelog="no" ;;
    -*) echo "Unknown option: $arg" >&2; exit 1 ;;
    *) version="$arg" ;;
  esac
done

if [[ -z "$version" ]]; then
  echo "Usage: pnpm release <version> [--dry-run] [--no-push] [--no-changelog]" >&2
  echo "  e.g. pnpm release 0.2.0" >&2
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

if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "Tag $tag already exists." >&2
  exit 1
fi

if [[ "$dry_run" == "no" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "There are uncommitted changes; commit them before releasing." >&2
    exit 1
  fi
  branch="$(git branch --show-current)"
  if [[ "$branch" != "main" ]]; then
    echo "You are on '$branch'; switch to main before releasing." >&2
    exit 1
  fi
fi

# Previous version (empty for the first release: no commits to list).
previous_tag="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null || true)"

echo "Release $tag${previous_tag:+ (since $previous_tag)}"

if [[ "$changelog" == "yes" ]]; then
  if [[ "$dry_run" == "yes" ]]; then
    echo "--- changelog entry that would be added ---"
    node "$root/scripts/changelog.mjs" generate "$version" --since "$previous_tag"
    echo "-------------------------------------------"
  else
    echo "Adding the changelog entry..."
    node "$root/scripts/changelog.mjs" generate "$version" --write --since "$previous_tag"
  fi
fi

if [[ "$dry_run" == "yes" ]]; then
  echo "Files that would be updated:"
  echo "  package.json -> $version"
  echo "  src-tauri/tauri.conf.json -> $version"
  echo "  src-tauri/Cargo.toml -> $version"
  echo "  src-tauri/Cargo.lock (cargo check)"
  [[ "$changelog" == "yes" ]] && echo "  CHANGELOG.md (new entry for $version)"
  if [[ "$push" == "yes" ]]; then
    echo "Then: commit 'chore(release): $tag', tag $tag and push it."
  else
    echo "Then: commit 'chore(release): $tag' and tag $tag (no push)."
  fi
  exit 0
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

// AppStream metadata: app centers show this version and date.
const metainfoPath = 'src-tauri/linux/com.mdview.desktop.metainfo.xml';
const metainfo = readFileSync(metainfoPath, 'utf8');
const date = new Date().toISOString().slice(0, 10);
const updatedMetainfo = metainfo.replace(
  /(\s*<releases>\n)/,
  `$1    <release version="${version}" date="${date}"/>\n`,
);
if (updatedMetainfo === metainfo) throw new Error(`Could not add the release to ${metainfoPath}`);
writeFileSync(metainfoPath, updatedMetainfo);
console.log(`  ${metainfoPath} -> ${version}`);
NODE

# Refresh the package version inside Cargo.lock.
cargo check --quiet --manifest-path src-tauri/Cargo.toml

files=(package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock)
files+=(src-tauri/linux/com.mdview.desktop.metainfo.xml)
[[ "$changelog" == "yes" ]] && files+=(CHANGELOG.md)
git add "${files[@]}"
git commit -m "chore(release): $tag"
if [[ "${SIGN_TAGS:-}" == "1" ]]; then
  # Signed tags need a GPG key configured (user.signingkey).
  git tag -s "$tag" -m "$tag"
else
  git tag "$tag"
fi

if [[ "$push" == "yes" ]]; then
  echo "Pushing the commit and the tag..."
  git push origin HEAD
  git push origin "$tag"
  echo
  echo "Done: $tag pushed. GitHub Actions is building the installers:"
  echo "  https://github.com/jigonzalez930209/md-view/actions"
  echo "When they finish, review the draft release and press Publish."
else
  echo
  echo "Done locally: commit and tag $tag created (nothing pushed)."
  echo "To start the release when you are ready:"
  echo "  git push origin HEAD && git push origin $tag"
fi
