#!/usr/bin/env bash
#
# Builds the APT repository (pool + metadata + signature) in a directory.
#
#   scripts/apt-repo.sh <output-dir> <file.deb> [<file.deb> ...]
#
# Layout produced under <output-dir> (served from GitHub Pages at /md-view/apt):
#
#   pool/main/m/md-view/*.deb
#   dists/stable/main/binary-amd64/Packages(.gz)
#   dists/stable/Release  (+ Release.gpg and InRelease when signing is possible)
#
# The signature uses the armored private key in $APT_SIGNING_KEY (imported into
# a temporary keyring, which is how the docs workflow signs in CI) or, when the
# variable is not set, whatever secret key the current user already has.
# The public keyring that users install is docs/public/apt/md-view-archive-keyring.gpg.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: scripts/apt-repo.sh <output-dir> <file.deb>..." >&2
  exit 1
fi

# Absolute output dir: some steps change directory, so relative paths would
# resolve against the wrong place.
mkdir -p "$1"
out="$(cd "$1" && pwd)"
shift
suite="stable"
component="main"
arch="amd64"

pool="$out/pool/$component/m/md-view"
mkdir -p "$pool"
for deb in "$@"; do
  cp -f "$deb" "$pool/"
done

binary="$out/dists/$suite/$component/binary-$arch"
mkdir -p "$binary"

# `Filename:` inside Packages is relative to the repository root, so the scan
# runs from there.
(cd "$out" && dpkg-scanpackages --arch "$arch" pool >"$binary/Packages")
gzip -9fk "$binary/Packages"

dist_dir="$out/dists/$suite"

# The Release file (with the checksums of everything under dists/<suite>) is
# generated here instead of with apt-ftparchive, so the only tools needed are
# dpkg-dev and gpg.
python3 - "$dist_dir" "$suite" "$arch" "$component" <<'PY'
import email.utils
import hashlib
import os
import sys

dist_dir, suite, arch, component = sys.argv[1:5]

files = []
for root, _dirs, names in os.walk(dist_dir):
    for name in names:
        path = os.path.join(root, name)
        rel = os.path.relpath(path, dist_dir)
        if rel in ('Release', 'InRelease', 'Release.gpg'):
            continue
        with open(path, 'rb') as handle:
            data = handle.read()
        files.append((rel, len(data), hashlib.md5(data).hexdigest(),
                      hashlib.sha1(data).hexdigest(), hashlib.sha256(data).hexdigest()))
files.sort()

lines = [
    'Origin: md-view',
    'Label: md-view',
    f'Suite: {suite}',
    f'Codename: {suite}',
    f'Architectures: {arch}',
    f'Components: {component}',
    'Description: md-view APT repository',
    f'Date: {email.utils.formatdate(usegmt=True)}',
]
for title, index in (('MD5Sum', 2), ('SHA1', 3), ('SHA256', 4)):
    lines.append(f'{title}:')
    for entry in files:
        lines.append(f' {entry[index]} {entry[1]:>16} {entry[0]}')

with open(os.path.join(dist_dir, 'Release'), 'w') as handle:
    handle.write('\n'.join(lines) + '\n')

print(f'Release written with {len(files)} files')
PY

# An unsigned repository forces users to trust it blindly, so sign whenever a
# key is available.
if [[ -n "${APT_SIGNING_KEY:-}" ]]; then
  GNUPGHOME="$(mktemp -d)"
  export GNUPGHOME
  trap 'rm -rf "$GNUPGHOME"' EXIT
  printf '%s' "$APT_SIGNING_KEY" | gpg --batch --quiet --import
fi

if gpg --list-secret-keys 2>/dev/null | grep -q '^sec'; then
  gpg --batch --yes --armor --detach-sign -o "$dist_dir/Release.gpg" "$dist_dir/Release"
  gpg --batch --yes --clearsign -o "$dist_dir/InRelease" "$dist_dir/Release"
  echo "Signed with $(gpg --list-secret-keys --with-colons | awk -F: '/^fpr/{print $10; exit}')"
else
  echo "WARNING: no signing key found; the repository is unsigned" >&2
fi

echo "Repository ready in $out"
find "$out" -type f | sort
