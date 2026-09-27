# Desplegar md-view en GitHub

Guía completa del sistema de CI/CD: qué corre, dónde, cómo publicar una versión y qué
hacer cuando algo falla.

---

## Resumen

| Workflow | Se dispara con | Qué hace |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](workflows/ci.yml) | push a `main`, pull requests, manual | Typecheck + build del frontend y `cargo fmt --check` + `cargo test` del backend |
| [`.github/workflows/release.yml`](workflows/release.yml) | tags `v*`, manual | Crea un release en borrador y sube los instaladores de Linux, macOS y Windows |

Ambos corren en **Ubuntu 26.04** y usan **Node 24** (también los propios actions: `checkout`,
`setup-node`, `github-script`, `pnpm/action-setup` y `tauri-action` v1 corren sobre Node 24).

---

## Publicar una versión

Requisitos: árbol de trabajo limpio y estar en `main`.

```bash
pnpm release 0.3.0
```

`scripts/release.sh` hace todo:

1. valida la versión (`1.2.3`, se acepta con o sin `v`) y que el tag no exista,
2. actualiza la versión en `package.json`, `src-tauri/tauri.conf.json` y
   `src-tauri/Cargo.toml`, y refresca `src-tauri/Cargo.lock`,
3. commitea `chore(release): v0.3.0`,
4. crea el tag `v0.3.0` y empuja el commit y el tag.

El push del tag dispara el release:

1. **`create-release`** valida que el tag coincida con la versión de `package.json`
   (evita publicar instaladores con la versión equivocada) y crea un **borrador** de release
   con las notas.
2. **`publish`** corre en tres runners en paralelo y sube los artefactos a ese borrador:

| Runner | Instaladores | Notas |
| --- | --- | --- |
| `ubuntu-26.04` | `.deb`, `.rpm`, AppImage | `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libxdo-dev`, `patchelf` |
| `macos-latest` | `.dmg` | Binario **universal** (`aarch64-apple-darwin` + `x86_64-apple-darwin`) |
| `windows-latest` | `.msi` (WiX), `.exe` (NSIS) | WiX y NSIS los baja Tauri automáticamente |

3. Cuando los tres terminan: revisá el borrador y dale **Publish release**
   (o `gh release edit v0.3.0 --draft=false`).

### Publicar sin tag

```bash
gh workflow run release.yml -f tag=v0.3.0
```

Mismo resultado (también queda en borrador). Útil para reintentar un build sin crear otro tag.

### Reintentar solo una plataforma

En la pestaña **Actions**, entrá al run del tag y usá **Re-run failed jobs**. También podés
re-lanzar todo con `gh run rerun <run-id>`.

---

## Los iconos

Los iconos viven en `src-tauri/icons/` y se referencian en `tauri.conf.json`
(`bundle.icon`). El set es el estándar de Tauri:

| Archivo | Para qué |
| --- | --- |
| `32x32.png`, `128x128.png`, `128x128@2x.png` (256) | Linux (hicolor), ventana y diálogos |
| `icon.png` (512) | Linux (AppImage, .deb) con más resolución |
| `icon.ico` | Windows: multi-resolución 16, 24, 32, 48, 64, 128 y 256 |
| `icon.icns` | macOS: 32, 64, 128, 256, 512 y 1024 (ic07–ic14) |

Para regenerarlos (si cambia la marca):

```bash
python3 -m pip install pillow   # única dependencia
pnpm icons
```

Después de regenerarlos, verificá que `bundle.icon` siga listando archivos que existen:

```bash
python3 - <<'PY'
import json, os
conf = json.load(open('src-tauri/tauri.conf.json'))
for icon in conf['bundle']['icon']:
    path = os.path.join('src-tauri', icon)
    print(icon, os.path.getsize(path), 'OK' if os.path.exists(path) else 'FALTA')
PY
```

---

## Secretos y firma

Por defecto los instaladores salen **sin firmar** (alcanza para uso interno y para que el
sistema operativo avise "desarrollador desconocido").

Para firmar hay que agregar secretos en
**Settings → Secrets and variables → Actions**:

| Plataforma | Secretos | Qué hace |
| --- | --- | --- |
| macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Firma y notariza el `.dmg` |
| Windows | `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Firma los instaladores (y habilita el updater) |
| Linux | — | No requiere firma |

Con los secretos cargados, el workflow no necesita cambios: Tauri los toma del entorno.

---

## Requisitos de las herramientas

| Herramienta | Versión | Dónde se fija |
| --- | --- | --- |
| Node | **24** o superior | `engines` en `package.json`, `.nvmrc` y `node-version: 24` en los workflows |
| pnpm | 10 | `pnpm/action-setup@v6` (el lockfile es `lockfileVersion: '9'`) |
| Rust | estable | `dtolnay/rust-toolchain@stable` |
| Ubuntu | 26.04 | Runner del CI y del build de Linux |

> Nota de compatibilidad: los binarios de Linux se compilan contra la glibc de Ubuntu 26.04,
> así que corren en distros igual o más nuevas. Si alguna vez necesitás soportar distros
> viejas, cambiá el runner del release (no del CI) a `ubuntu-22.04`.

---

## Problemas comunes

**`El tag (vX) no coincide con package.json (vY)`**
Se cambió la versión a mano en un solo archivo. Solución: `pnpm release X` (actualiza los
tres archivos) o corregí el tag y volvé a empujarlo.

**`frozen-lockfile` falla**
`pnpm-lock.yaml` no coincide con `package.json`. Local: `pnpm install` y commiteá el lock.

**Falla la instalación de dependencias en Linux**
Revisá que el paquete exista en la versión de Ubuntu del runner. Ejemplo real:
`libayatana-appindicator3-dev` no existe en 26.04; no se usa porque la app no compila la
feature `tray-icon` de Tauri.

**El .dmg de macOS tarda mucho o falla armando el universal**
Es la compilación doble (Intel + Apple Silicon). Verificá que `dtolnay/rust-toolchain`
instale los dos targets (está en el workflow).

**El build de Windows falla con WiX/NSIS**
Tauri descarga esas herramientas; si el runner no tiene red o cambió la URL, reintentá o
fijá la versión de `tauri-cli` en `@tauri-apps/cli`.

**Los assets no aparecen en el release**
Cada job sube con `releaseId` del borrador; si un job falla, los demás igual suben. Revisá
el log del job que falló y usá *Re-run failed jobs*.

**Quiero versionar sin publicar**
Empujá el tag sin `pnpm release` no hace falta: usá `gh workflow run release.yml -f tag=...`
y dejá el borrador sin publicar (o borralo después con `gh release delete vX`).

---

## Estructura del release

```
v0.3.0 (borrador)
├── md-view_0.3.0_amd64.deb
├── md-view-0.3.0-1.x86_64.rpm
├── md-view_0.3.0_amd64.AppImage
├── md-view_0.3.0_x64.dmg
├── md-view_0.3.0_x64-setup.exe
└── md-view_0.3.0_x64_en-US.msi
```

Los nombres exactos los define Tauri según el `productName` (`md-view`) y la versión.
