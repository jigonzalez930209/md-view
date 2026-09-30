#!/usr/bin/env bash
# Prepares the manual testing fixtures as defined in docs/development/manual-testing.md
# Works on Linux and macOS.
set -euo pipefail

TARGET_DIR="${HOME}/mdview-tests"
echo "Creating test fixtures directory at: ${TARGET_DIR}"
mkdir -p "${TARGET_DIR}/repo"
cd "${TARGET_DIR}"

echo "Creating small.md..."
printf '# Small\n\nbody\n' > small.md

echo "Creating empty.md..."
: > empty.md

echo "Creating big.md (~9 MB)..."
python3 -c "
with open('big.md', 'w') as f:
    f.write('line with some text to grow the document\n' * 200000)
"

echo "Creating huge.md (~100 MB)..."
python3 -c "
chunk = 'line with some text to grow the document\n' * 100000
with open('huge.md', 'w') as f:
    for _ in range(22):
        f.write(chunk)
"

echo "Creating latin1.md (invalid UTF-8 byte 0xE9)..."
printf 'caf\xe9 latin1\n' > latin1.md

echo "Creating utf16le.md (UTF-16 LE with BOM)..."
python3 - <<'PY'
text = 'línea uno\nlínea dos\n'
with open('utf16le.md', 'wb') as f:
    f.write(b'\xff\xfe' + text.encode('utf-16-le'))
PY

echo "Setting up git repo fixture inside ${TARGET_DIR}/repo..."
cd "${TARGET_DIR}/repo"
if [ ! -d .git ]; then
    git init -q
fi
printf '# Version one\n' > chapter.md
git add .
git commit -qm "init" || true
printf '# Version one\n\nnew paragraph\n' > chapter.md
printf '# Draft\n' > untracked.md

echo ""
echo "=== Fixtures created successfully ==="
ls -lh "${TARGET_DIR}"
echo ""
echo "Repo status:"
git status -s
