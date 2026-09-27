#!/usr/bin/env bash
#
# Prepara y publica una version de md-view.
#
# Actualiza la version en package.json, src-tauri/tauri.conf.json y
# src-tauri/Cargo.toml, hace el commit, crea el tag y lo empuja. El push del
# tag dispara .github/workflows/release.yml, que compila los instaladores en
# Linux/macOS/Windows y los sube a un release en borrador.
#
# Uso: pnpm release 0.2.0   (o: scripts/release.sh v0.2.0)

set -euo pipefail

version="${1:-}"
if [[ -z "$version" ]]; then
  echo "Uso: pnpm release <version>    (ej: pnpm release 0.2.0)" >&2
  exit 1
fi
version="${version#v}"

if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "'$version' no parece una version valida (se espera 1.2.3)." >&2
  exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

tag="v$version"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Hay cambios sin commitear; commitealos antes de publicar." >&2
  exit 1
fi

if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "El tag $tag ya existe." >&2
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Estas en '$branch'; cambia a main antes de publicar." >&2
  exit 1
fi

echo "Actualizando la version a $version..."

node - "$version" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');

const version = process.argv[2];

// package.json y tauri.conf.json: la primera clave "version".
for (const path of ['package.json', 'src-tauri/tauri.conf.json']) {
  const raw = readFileSync(path, 'utf8');
  const updated = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (updated === raw) throw new Error(`No se pudo actualizar la version en ${path}`);
  writeFileSync(path, updated.endsWith('\n') ? updated : `${updated}\n`);
  console.log(`  ${path} -> ${version}`);
}

// Cargo.toml: solo la primera `version = "..."` (la del bloque [package]).
const cargoPath = 'src-tauri/Cargo.toml';
const cargo = readFileSync(cargoPath, 'utf8');
const updatedCargo = cargo.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
if (updatedCargo === cargo) throw new Error(`No se pudo actualizar la version en ${cargoPath}`);
writeFileSync(cargoPath, updatedCargo);
console.log(`  ${cargoPath} -> ${version}`);
NODE

# Refresca la version del paquete en Cargo.lock.
cargo check --quiet --manifest-path src-tauri/Cargo.toml

git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore(release): $tag"
git tag "$tag"

echo "Empujando el commit y el tag..."
git push origin HEAD
git push origin "$tag"

echo
echo "Listo: $tag publicado. GitHub Actions esta compilando los instaladores:"
echo "  https://github.com/jigonzalez930209/md-view/actions"
echo "Cuando terminen, revisa el borrador del release y dale Publish."
