# md-view

Visor y **editor** de Markdown de escritorio (Tauri 2 + React), minimalista y con dos temas.
La ventana usa una barra de título propia, al estilo del editor de texto de GNOME, con
**pestañas** para varios documentos, una **barra de formato** Markdown en el editor y
**exportación** a PDF, HTML, imágenes y más.
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

- **Node** 24+ (lo pide `engines` y lo fijan los workflows) y **pnpm** 10+
- **Rust** 1.77+ (probado con 1.97)
- Dependencias del sistema para Tauri:

```bash
# Debian / Ubuntu (probado en 26.04; sin appindicator, la app no usa bandeja)
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev librsvg2-dev patchelf

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

## Configuraciones

**☰ → Configuraciones…** o `Ctrl/⌘ + ,` abre un diálogo con todo lo configurable; se guarda
solo y los accesos rápidos del menú ☰ (Apariencia, Explorador, PDF en claro) siguen
funcionando igual.

| Sección | Opciones |
| --- | --- |
| Apariencia | Tema **claro / oscuro / sistema**, paleta (GitHub, One Dark, Dracula) |
| Editor | Tamaño de fuente (11–20), números de línea, ajuste de línea |
| Vista previa | Scroll sincronizado, tamaño de fuente (13–22) |
| Explorador | Ubicación izquierda/derecha |
| Exportación | PDF en modo claro |
| Inicio | Mostrar recientes, borrar la lista |

Abajo hay un botón **Restablecer** (con confirmación) que vuelve a los valores por defecto.

## Idiomas

La interfaz está en **inglés por defecto**, con **español** disponible desde
**Configuraciones → Idioma** (se guarda como el resto de las preferencias).

Todos los textos viven en `src/lib/i18n.ts`: cada idioma es un diccionario con las mismas
claves y los componentes los resuelven con `useI18n()` (`t('clave')`, y `plural('clave',
n)` para singular/plural). Los módulos que no son React (exportación, post-proceso del
preview, backend) usan `t()` con el idioma activo, que se fija al renderizar el provider.

Para agregar un idioma:

1. sumá el idioma a `LANGUAGES` (`{ id, label, native }`),
2. copiá el diccionario `en` y traducí los valores,
3. agregalo a `dictionaries`.

Los mensajes de error que vienen de Rust (`read_document`, `write_document`, etc.) siguen
en español; son rutas de error poco frecuentes y quedan pendientes de traducir.

### Documentos grandes

Todo lo pesado se mide en `lib/limits.ts` y se resuelve sin copiar el documento entero
en el hilo de la interfaz:

- **>300 KB** se apaga el resaltado de sintaxis.
- **>400 KB** la vista previa va sin resaltado ni diagramas Mermaid.
- **>500 KB** el texto se vuelca al estado de la app solo tras una pausa corta.
- **>1,2 MB** el editor trabaja en texto plano (sin parseo ni resaltado).
- **>1,5 MB** la vista previa muestra solo las **primeras 2.000 líneas** (la ventana se
  recorta con `indexOf`/`slice`, que en V8 no copia).
- **>8 MB** el documento es "enorme": no se copia el texto nunca más. El editor
  (CodeMirror) es la única fuente de verdad, el preview se refresca leyendo del editor y
  los conteos se marcan como aproximados.
- **>256 KB** el conteo de palabras y líneas se despacha a un **worker** por trozos de
  2 MB, alineados a saltos de línea (`lib/text-tasks.ts` + `workers/text-tasks.ts`). El
  worker se crea bajo demanda, se reutiliza y se termina solo tras 30 s sin uso; sin
  documentos abiertos se libera al instante.

### ¿Qué librería frena el render?

Medido en Chromium con un documento sintético, sin caché:

| Tamaño | markdown-it | DOMPurify | pipeline completo |
| --- | --- | --- | --- |
| 10 KB | 13 ms | 7 ms | 31 ms |
| 300 KB | 113 ms | 216 ms | 468 ms |
| 1 MB | 367 ms | 671 ms | 1410 ms |
| 3 MB | 1099 ms | 1901 ms | 4443 ms |

La que más pesa es **DOMPurify** (~45%): parsea todo el HTML en un DOM y lo recorre.
markdown-it es ~25% y el resto son sus plugins, KaTeX y el resaltado. Por eso:

- Si el Markdown **no trae HTML crudo** (ningún `<`), se saltea DOMPurify: markdown-it ya
  escapa el texto y valida los protocolos de los enlaces. Con HTML crudo se sanitiza igual
  que siempre (verificado contra `<script>`, `onerror`, `javascript:` y `<iframe>`).
- En documentos grandes, markdown-it + plugins se renderizan en el **worker** (ese código no
  toca el DOM) y el hilo principal solo sanitiza (si hace falta) e inserta el HTML.

Mismo archivo, mismas condiciones: 1 MB pasó de 1439 ms con un bloqueo de 939 ms a **547 ms
con 192 ms**; 10 MB de 527/180 a **356/95**.

WASM (md4c/comrak) o renderizar en Rust no cambian el cuadro: el cuello no es el parseo
Markdown sino la sanitización y la construcción del DOM.

Además:

- **Un editor por pestaña, como VS Code**: cada documento tiene su propia vista de
  CodeMirror montada; cambiar de pestaña es solo mostrar/ocultar (visibilidad), sin
  instalar estados ni volver a medir. El scroll, la selección y el historial de deshacer
  de cada pestaña se conservan nativamente y cerrar una pestaña libera su editor.
- **HTML del preview cacheado** (LRU de 3): volver a una pestaña no vuelve a pasar por
  markdown-it + DOMPurify; la clave es el propio string, así que V8 la busca en O(1).
- **Estadísticas cacheadas por documento**: cambiar de pestaña no recalcula ni trocea el
  texto de nuevo.
- El indicador de cambios es un booleano por pestaña (antes se comparaban los textos
  completos), el cursor se actualiza como máximo cada 100 ms y en modo texto plano el
  ajuste de línea queda apagado (medir 1 M de líneas con wrap congela).

Medido con un `.md` de **100 MB** (build de producción):

| Acción | Antes | Ahora |
| --- | --- | --- |
| Abrir (pestaña + preview) | 22 s | ~1,6 s |
| Salir del archivo grande | segundos de freeze | **0 ms** |
| Volver al archivo grande | — | ~86 ms |
| Escribir 10 caracteres | 3 s (cortes de hasta 679 ms) | cortes de 20-50 ms |

No hizo falta WASM: el cuello de botella no era el procesamiento de texto sino las copias
del documento, el intercambio de estados de CodeMirror y el re-render; todo eso se eliminó
con la arquitectura por pestañas y las cachés.

## Atajos

| Atajo | Acción |
| --- | --- |
| `Ctrl/⌘ + O` | Abrir archivo |
| `Ctrl/⌘ + N` / `Ctrl/⌘ + T` | Nueva pestaña |
| `Ctrl/⌘ + W` | Cerrar pestaña |
| `Ctrl/⌘ + Tab` | Siguiente pestaña (`Shift` para la anterior) |
| `Ctrl/⌘ + Shift + E` | Mostrar/ocultar el explorador de carpetas |
| `Ctrl/⌘ + ,` | Configuraciones |
| `Ctrl/⌘ + S` | Guardar (si es nuevo, pide la ruta) |
| `Ctrl/⌘ + Shift + S` | Guardar como |
| `Ctrl/⌘ + 1` / `2` / `3` | Solo editor / dividido / solo lectura |
| `Ctrl/⌘ + F` | Buscar en el editor (el panel incluye reemplazar) |
| `Ctrl/⌘ + Alt + G` | Ir a la línea |
| `Ctrl/⌘ + B` / `I` | Negrita / cursiva |
| `Ctrl/⌘ + E` | Código en línea |
| `Ctrl/⌘ + K` | Insertar enlace |

La barra de formato (visible en los modos editor y dividido) también permite títulos,
citas, listas, listas de tareas, imágenes, tablas, líneas horizontales, deshacer y rehacer.

También podés **arrastrar uno o varios `.md` sobre la ventana** para abrirlos, cada uno en
su propia pestaña.

## Explorador de carpetas

**☰ → Abrir carpeta…** (o una carpeta desde el menú *Abrir*) recorre la carpeta y sus
subcarpetas y muestra un árbol al estilo VS Code **a la izquierda** (`Ctrl+Shift+E` lo
muestra u oculta). En **☰ → Apariencia → Explorador** se puede pasar al lado derecho; la
elección queda guardada. Se puede plegar cada carpeta, recargar el árbol y arrastrar el
borde para cambiar el ancho.

Cuando el explorador está visible, el panel llega hasta la barra de título y las pestañas
quedan a su lado (más bajas que su cabecera); sin explorador, las pestañas ocupan todo el
ancho como antes. Las pestañas son estilo Chrome: bajas, con las esquinas de arriba
redondeadas y la activa del mismo color que el contenido, así se siente parte de él.

- **Solo se pueden abrir archivos de texto**, sin importar la extensión. El backend decide
  así: extensiones conocidas de texto se aceptan, las claramente binarias se descartan, y
  para el resto se miran los primeros 4 KB (sin bytes NUL y UTF-8 válido). Los que no son
  texto quedan deshabilitados en el árbol.
- El documento abierto se resalta, y si se abre un archivo desde otro lado (recientes, un
  enlace interno) se despliegan sus carpetas solas.
- Se omiten `.git`, `node_modules`, `target`, `dist`, `build`, entornos virtuales y
  similares; los enlaces simbólicos se ignoran para no entrar en ciclos.
- Hay un tope de 20.000 entradas y 16 niveles de profundidad: si se supera, el árbol
  avisa que quedó truncado.
- En el **navegador** (modo desarrollo) también funciona con un `<input webkitdirectory>`,
  pero la detección de binarios es solo por extensión (no puede leer bytes) y la carpeta
  vive mientras dure la sesión.

## MDX y derivados

Se reconocen como documentos editables `.md`, `.markdown`, `.mdx`, `.mdown`, `.mkd`,
`.mkdn`, `.mdwn`, `.mdtxt`, `.mdtext`, `.mdoc`, `.rmd`, `.qmd` y `.txt`; cualquier archivo
de texto que se abra desde el explorador se renderiza con el mismo pipeline de Markdown.

Para los `.mdx` hay un preprocesado en `lib/mdx.ts` antes de renderizar:

- se descarta el frontmatter YAML,
- se quitan las sentencias `import`/`export` (incluidas las multilínea),
- los componentes propios (`<Note>texto</Note>`) se desenvuelven conservando su contenido
  y los que se cierran solos (`<Chart data={...} />`) se descartan,
- las expresiones `{...}` quedan visibles como código en línea, sin ejecutar nada.

El HTML/JSX resultante pasa por DOMPurify igual que el resto.

Los archivos de texto que **no** son Markdown (un `.ts`, un `.json`, un `.yaml`...) se
muestran en el panel derecho como **código**: monoespaciado, con el resaltado del lenguaje
y sin convertir el contenido en párrafos. La cabecera del panel trae un botón para
alternar entre *código* y *Markdown* cuando haga falta (por ejemplo, para ver crudo un
`.md`), y la barra de formato del editor solo aparece cuando el documento es Markdown.

## Exportar

Desde **☰ → Exportar** (el documento activo, con la apariencia que tengas puesta):

| Formato | Qué genera |
| --- | --- |
| PDF (paginado) | Documento vectorial con saltos de página, impreso por WebKitGTK. Sale en **modo claro** por defecto (hay un checkbox en el mismo menú para usar el tema actual). En Linux se escribe directo en la ruta elegida; en otros sistemas se abre el diálogo de impresión para elegir "Guardar como PDF". |
| HTML autocontenido | Un único `.html` con el CSS, las fuentes de KaTeX y las imágenes incrustadas (data URLs). Se abre en cualquier navegador, sin conexión. |
| PNG por páginas (ZIP) | Un PNG A4 por página a escala 2x, todos dentro de un `.zip` (`nombre.zip`). |
| PNG / JPG / WebP | La vista previa completa en una sola imagen. |
| SVG vectorial | Generado con [dom-to-svg](https://github.com/felixfbecker/dom-to-svg): texto real (seleccionable y editable en Illustrator/Inkscape/Figma), tablas, listas con sus marcadores y casillas como vectores. Las imágenes del `.md` van incrustadas y los diagramas Mermaid se anidan como SVG. Las fuentes de KaTeX quedan embebidas. |
| Texto plano | El texto del render, sin formato. |

El rasterizado lo hace [modern-screenshot](https://github.com/qq15725/modern-screenshot);
si un documento es enorme, la escala se ajusta sola para no agotar la memoria del webview.

## Detalles que vale la pena conocer

- **Pestañas**: cada documento conserva su propio cursor, selección, posición de scroll,
  historial de deshacer y modo de vista. Una pestaña con cambios muestra un punto y, al
  cerrarla (o al cerrar la ventana), la app pregunta antes de descartarlos. Si un archivo
  ya está abierto, se enfoca su pestaña en lugar de duplicarlo.
- **Scroll alineado y sin saltos**: en modo dividido cada bloque del preview lleva su línea
  del fuente (`data-line`), así el scroll de un panel deja la misma línea en el otro. El
  preview se redibuja unos milisegundos después de la última tecla (y Mermaid cachea sus
  diagramas) para que escribir no mueva el layout.
- **Ventana sin marco nativo**: la barra de título la dibuja la app (Abrir, pestaña nueva,
  documento centrado, información, menú y controles de ventana). Se arrastra desde
  cualquier punto libre de la barra y se redimensiona desde los bordes, con las zonas
  invisibles que agrega `WindowResizeHandles`.
- **Guardado seguro**: se escribe en un archivo temporal y se renombra, así un fallo a mitad
  de camino no rompe el original. Se conservan los permisos del archivo.
- **Fin de línea y BOM**: se detectan al abrir y se respetan al guardar (LF o CRLF, con o sin
  BOM UTF-8). Los archivos UTF-16 se convierten a UTF-8 al leerlos.
- **Rutas relativas**: las imágenes y los enlaces se resuelven contra la carpeta del
  documento. Un `/assets/x.png` primero se busca como ruta absoluta y, si no existe, relativo
  al documento. Si ninguna interpretación existe en disco, se deja la ruta original: así
  siguen funcionando las imágenes servidas por la propia app (por ejemplo `/demo-animado.svg`).
- **Enlaces**: los `http(s)` se abren en el navegador; un enlace a otro `.md` se abre dentro de
  la app; cualquier otro archivo se abre con la aplicación predeterminada del sistema.
- **Scroll sincronizado**: en modo dividido, el editor y la vista previa se siguen.
- **Cambios sin guardar**: al cerrar la ventana la app pregunta antes de descartar.
- **Mermaid** se carga con `import()` dinámico (solo si el documento tiene diagramas) y se
  redibuja al cambiar de tema, con los colores de la interfaz.
- **Recientes**: los últimos 12 archivos se guardan en el directorio de configuración de la app.

## Publicar una versión

Requisitos: árbol limpio y estar en `main` (el script lo verifica).

```bash
pnpm release 0.2.0
```

Eso actualiza la versión en `package.json`, `src-tauri/tauri.conf.json` y
`src-tauri/Cargo.toml` (más `Cargo.lock`), commitea `chore(release): v0.2.0`, crea el
tag `v0.2.0` y lo empuja. El push del tag dispara
[`.github/workflows/release.yml`](.github/workflows/release.yml), que:

1. valida que el tag coincida con la versión de `package.json`,
2. crea un **release en borrador** en GitHub,
3. compila y sube los instaladores con `tauri-action`:
   - **Linux** (`ubuntu-22.04`): `.deb`, `.rpm` y AppImage
   - **macOS** (`macos-latest`): `.dmg` universal (Intel + Apple Silicon)
   - **Windows** (`windows-latest`): `.msi` y `.exe` (NSIS)
4. deja todo en el borrador para que lo revises y le des **Publish release**
   (o `gh release edit v0.2.0 --draft=false`).

También se puede disparar a mano: `gh workflow run release.yml -f tag=v0.2.0` (mismo
resultado, también en borrador).

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre en cada push a `main` y en
cada PR: typecheck + build del frontend, `cargo fmt --check` y `cargo test`.

La guía completa (runners, secretos de firma, iconos, problemas comunes y reintentos) está
en [`.github/RELEASING.md`](.github/RELEASING.md).

## Estructura

```
src/
  App.tsx                 estado de la app, pestañas, carpetas, atajos, paneles, scroll sync
  components/             barra de título, pestañas, barra de formato, editor, preview,
                          explorador de carpetas, configuraciones, bienvenida, barra de estado
  components/ui/          componentes shadcn (button, dialog, menu, switch, slider...)
  editor/setup.ts         CodeMirror 6 (tema, ajustes y resaltado de Markdown)
  editor/format.ts        comandos de formato Markdown (negrita, listas, tablas...)
  lib/
    backend.ts            puente con Tauri (y fallback para usar en el navegador)
    i18n.ts               diccionarios (ingles por defecto) y traduccion
    i18n-react.tsx        provider y hook de idioma para los componentes
    prefs.ts              preferencias persistidas (idioma, tema, editor, preview...)
    limits.ts             umbrales de rendimiento para documentos grandes
    text-tasks.ts         despacho de workers bajo demanda (conteos por trozos)
    export.ts             exportacion a PDF/HTML/PNG/JPG/WebP/SVG/TXT
    markdown-core.ts      markdown-it + KaTeX + plugins (sin DOM, usable en worker)
    markdown.ts           cache + sanitizado con DOMPurify
    mdx.ts                preprocesado de MDX (ESM, componentes, expresiones)
    scroll-sync.ts        alineacion editor <-> vista previa por linea
    enhance.ts            post-proceso del HTML: anclas, alertas, rutas, Mermaid, copiar
    mermaid.ts            carga diferida y temas de Mermaid
    paths.ts              utilidades de rutas multiplataforma
  demo.md                 documento de demostración ("Ver demo")
  workers/
    text-tasks.ts         worker: estadisticas y render de Markdown por trozos
scripts/release.sh        version + tag + push (dispara el release)
.github/
  workflows/ci.yml        typecheck + build + fmt + tests
  workflows/release.yml   instaladores por plataforma (tauri-action)
  RELEASING.md            guia completa de despliegue
src-tauri/
  src/lib.rs              comandos: leer/escribir, arbol de carpetas, recientes, PDF
  tauri.conf.json         ventana (sin decoraciones), CSP, protocolo asset, .md
  capabilities/           permisos de la ventana principal
```

## Seguridad

- El HTML del Markdown se sanitiza con DOMPurify **cuando el documento trae HTML crudo**
  (algún `<`); si no, markdown-it ya escapa el texto y valida los protocolos de los enlaces.
  La sanitización prohibe `<style>`, `<script>`, `<iframe>`, `<form>`, `<object>`, `<embed>`,
  `<link>`, `<meta>` y `<base>`, y bloquea URLs `javascript:` en atributos.
- Mermaid se inicializa con `securityLevel: 'strict'`.
- El CSP de la ventana solo permite scripts propios, estilos inline (KaTeX y Mermaid los usan)
  y fuentes locales.
- El protocolo `asset:` (para mostrar imágenes del disco) está habilitado con scope `**`.

## Créditos

Las paletas de resaltado de sintaxis siguen los temas `github.css` / `github-dark.css` de
highlight.js (MIT). El algoritmo de los anclas de los títulos imita el de GitHub.
