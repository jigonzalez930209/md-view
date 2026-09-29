// Fails when package.json, tauri.conf.json and Cargo.toml disagree on the version.
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8')).version;
const cargo = /^version = "([^"]+)"/m.exec(fs.readFileSync('src-tauri/Cargo.toml', 'utf8'))?.[1];

if (!pkg || !conf || !cargo) {
  console.error(`Could not read every version (package.json=${pkg}, tauri.conf.json=${conf}, Cargo.toml=${cargo})`);
  process.exit(1);
}
if (pkg !== conf || pkg !== cargo) {
  console.error(`Version mismatch: package.json=${pkg}, tauri.conf.json=${conf}, Cargo.toml=${cargo}`);
  process.exit(1);
}
console.log(`Versions in sync: ${pkg}`);
