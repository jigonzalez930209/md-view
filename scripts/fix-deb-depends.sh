#!/usr/bin/env bash
#
# Rewrites the `Depends:` field of a .deb built by Tauri.
#
# Tauri appends `libwebkit2gtk-4.1-0` and `libgtk-3-0` to whatever
# `bundle.linux.deb.depends` declares (crates/tauri-cli/src/interface/rust.rs),
# and `libgtk-3-0` does not exist on Ubuntu 24.04 or newer (it is
# `libgtk-3-0t64`), so the package would refuse to install there. This replaces
# the whole field with the list from tauri.conf.json, which declares the
# alternative for both names.
#
# Usage: scripts/fix-deb-depends.sh <file.deb>

set -euo pipefail

deb="${1:-}"
if [[ -z "$deb" || ! -f "$deb" ]]; then
  echo "Usage: scripts/fix-deb-depends.sh <file.deb>" >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - "$deb" "$root/src-tauri/tauri.conf.json" <<'PY'
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

deb, config_path = sys.argv[1], sys.argv[2]

with open(config_path) as handle:
    config = json.load(handle)
depends = config["bundle"]["linux"]["deb"]["depends"]
field = "Depends: " + ", ".join(depends)

work = tempfile.mkdtemp(prefix="md-view-deb-")
try:
    subprocess.run(["dpkg-deb", "-R", deb, work], check=True)
    control = os.path.join(work, "DEBIAN", "control")
    with open(control) as handle:
        text = handle.read()
    updated = re.sub(r"^Depends:.*$", field, text, count=1, flags=re.M)
    if updated == text and field not in text:
        raise SystemExit("Could not find the Depends field in the control file")
    with open(control, "w") as handle:
        handle.write(updated)
    # `--root-owner-group` keeps every entry as root:root: repacking as a normal
    # user would otherwise leave the files owned by uid 1000.
    subprocess.run(["dpkg-deb", "--root-owner-group", "-b", work, deb], check=True)
finally:
    shutil.rmtree(work, ignore_errors=True)

subprocess.run(["dpkg-deb", "-I", deb], check=True)
PY

echo "Fixed: $deb"
