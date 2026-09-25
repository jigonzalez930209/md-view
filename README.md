# md-view

Visor y **editor** de Markdown de escritorio (Tauri 2 + React), minimalista y con dos temas.
La vista previa imita el render de GitHub:

| Se renderiza | Con |
| --- | --- |
| Títulos, listas, tablas GFM, tachado, autolinks, notas al pie, emojis | [markdown-it](https://github.com/markdown-it/markdown-it) |
| Alertas `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` | plugin propio |
| Fórmulas LaTeX (`$...$`, `$$...$$`, ` ```math `) | [KaTeX](https://katex.org) |
| Diagramas Mermaid (` ```mermaid `) | [Mermaid](https://mermaid.js.org) |
| Imágenes, GIF, SVG (incluidos los animados con SMIL/CSS), `<video>` | webview + protocolo `asset:` |
| Resaltado de código (30+ lenguajes) y botón *copiar* | [highlight.js](https://highlightjs.org) |
| Listas de tareas `- [x]`, casillas deshabilitadas como en GitHub | `markdown-it-task-lists` |

Todo el HTML que produce el Markdown pasa por **DOMPurify** antes de mostrarse, porque un
`.md` puede venir de cualquier lado.

---

## Requisitos

- **Node** 20.19+ (probado con 24) y **pnpm** 10+
- **Rust** 1.77+ (probado con 1.97)
- Dependencias del sistema para Tauri:

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel

# Arch
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl libappindicator-gtk3 librsvg
```

## Uso

```bash
pnpm install      # dependencias del frontend
pnpm app          # compila el backend Rust y abre la app (tauri dev)
```

Otros comandos:

```bash
pnpm dev          # solo el frontend, en el navegador (http://localhost:1420)
pnpm build        # typecheck + build de producción del frontend
pnpm app:build    # binario y paquetes instalables (deb, AppImage, rpm, dmg, msi...)
pnpm icons        # regenera los iconos de src-tauri/icons
```

Tests de la lógica del backend (lectura/escritura, BOM, CRLF, argumentos):

```bash
cd src-tauri && cargo test
```

También podés abrir un archivo desde la terminal:

```bash
# En desarrollo, los argumentos van despues de los dos "--"
# (el primero lo consume pnpm, el segundo la CLI de Tauri).
pnpm app -- -- -- ~/notas/README.md

# Con el binario de release ya compilado
pnpm app:build
./src-tauri/target/release/md-view ~/notas/README.md
```

Los paquetes (`.deb`, AppImage, `.rpm`, `.dmg`, `.msi`) registran a **md-view** como
visor de `.md`, así que también podés abrir un documento con doble clic desde el
explorador de archivos.

Si la app ya está abierta, esa segunda invocación reutiliza la ventana
(`tauri-plugin-single-instance`) y carga el archivo ahí.

## Atajos

| Atajo | Acción |
| --- | --- |
| `Ctrl/⌘ + O` | Abrir archivo |
| `Ctrl/⌘ + N` | Documento nuevo |
| `Ctrl/⌘ + S` | Guardar (si es nuevo, pide la ruta) |
| `Ctrl/⌘ + Shift + S` | Guardar como |
| `Ctrl/⌘ + 1` / `2` / `3` | Solo editor / dividido / solo lectura |
| `Ctrl/⌘ + F` | Buscar en el editor (el panel incluye reemplazar) |
| `Ctrl/⌘ + Alt + G` | Ir a la línea |

También podés **arrastrar un `.md` sobre la ventana** para abrirlo.

## Detalles que vale la pena conocer

- **Guardado seguro**: se escribe en un archivo temporal y se renombra, así un fallo a mitad
  de camino no rompe el original. Se conservan los permisos del archivo.
- **Fin de línea y BOM**: se detectan al abrir y se respetan al guardar (LF o CRLF, con o sin
  BOM UTF-8). Los archivos UTF-16 se convierten a UTF-8 al leerlos.
- **Rutas relativas**: las imágenes y los enlaces se resuelven contra la carpeta del documento.
  Un `/assets/x.png` primero se busca como ruta absoluta y, si no existe, relativo al documento.
- **Enlaces**: los `http(s)` se abren en el navegador; un enlace a otro `.md` se abre dentro de
  la app; cualquier otro archivo se abre con la aplicación predeterminada del sistema.
- **Scroll sincronizado**: en modo dividido, el editor y la vista previa se siguen.
- **Cambios sin guardar**: al cerrar la ventana la app pregunta antes de descartar.
- **Mermaid** se carga con `import()` dinámico (solo si el documento tiene diagramas) y se
  redibuja al cambiar de tema, con los colores de la interfaz.
- **Recientes**: los últimos 12 archivos se guardan en el directorio de configuración de la app.

## Estructura

```
src/
  App.tsx                 estado de la app, atajos, paneles, scroll sync
  components/             barra superior, editor, preview, bienvenida, barra de estado
  editor/setup.ts         CodeMirror 6 (tema claro/oscuro, resaltado de Markdown)
  lib/
    backend.ts            puente con Tauri (y fallback para usar en el navegador)
    markdown.ts           markdown-it + KaTeX + plugins + sanitizado
    enhance.ts            post-proceso del HTML: anclas, alertas, rutas, Mermaid, copiar
    mermaid.ts            carga diferida y temas de Mermaid
    paths.ts              utilidades de rutas multiplataforma
  demo.md                 documento de demostración ("Ver demo")
src-tauri/
  src/lib.rs              comandos: leer/escribir, recientes, abrir enlaces, argumentos
  tauri.conf.json         ventana, CSP, protocolo asset, asociación de archivos .md
  capabilities/           permisos de la ventana principal
```

## Seguridad

- El HTML del Markdown se sanitiza con DOMPurify (`<style>`, `<script>`, `<iframe>`, `<form>`,
  `<object>`, `<embed>`, `<link>`, `<meta>` y `<base>` quedan prohibidos).
- Mermaid se inicializa con `securityLevel: 'strict'`.
- El CSP de la ventana solo permite scripts propios, estilos inline (KaTeX y Mermaid los usan)
  y fuentes locales.
- El protocolo `asset:` (para mostrar imágenes del disco) está habilitado con scope `**`.

## Créditos

Las paletas de resaltado de sintaxis siguen los temas `github.css` / `github-dark.css` de
highlight.js (MIT). El algoritmo de los anclas de los títulos imita el de GitHub.
