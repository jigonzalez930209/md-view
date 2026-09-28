/**
 * Records the LinkedIn promo video from the REAL app (1080×1350, H.264).
 *
 *   pnpm tauri build --no-bundle   (once, or whenever the app changes)
 *   pnpm promo                     → scripts/promo/out/md-view-linkedin.mp4 (+ cover.png, PDF)
 *
 * Requirements (Linux): xvfb, xdotool, dbus-run-session, pdftoppm.
 *
 * How it works:
 *  1. probe.mjs measures the layout (where tabs, menus and panes are).
 *  2. The real md-view binary runs in a private X display (Xvfb, 2× HiDPI) with
 *     isolated config/data dirs and its own D-Bus session, so nothing touches
 *     the user's own md-view.
 *  3. xdotool drives it with real mouse and keyboard input while ffmpeg grabs
 *     the screen (x11grab). Every action is logged on a timeline.
 *  4. stage.html composites each captured frame with captions and a smooth
 *     camera, and ffmpeg encodes the result.
 *
 * Env: PROMO_APP=/path/to/md-view (defaults to the release build),
 *      PROMO_BROWSER=/path/to/chrome (compositing browser).
 */

import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile, copyFile, readdir } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';
import ffmpegPath from 'ffmpeg-static';
import { probeLayout } from './probe.mjs';
import * as S from './script.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out');
const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const demoPath = (name) => join(homedir(), S.DEMO_DIR, name);

const APP_BIN = process.env.PROMO_APP ?? join(ROOT, 'src-tauri/target/release/md-view');
const SCREEN = { width: S.APP.width * S.SCALE, height: S.APP.height * S.SCALE };

/* ------------------------------------------------------------------------ */
/* Environment                                                                */
/* ------------------------------------------------------------------------ */

function freeDisplay() {
  for (let number = 99; number < 140; number += 1) {
    if (!existsSync(`/tmp/.X11-unix/X${number}`) && !existsSync(`/tmp/.X${number}-lock`)) return `:${number}`;
  }
  throw new Error('No free X display number');
}

async function checkTools() {
  const missing = [];
  for (const tool of ['Xvfb', 'xdotool', 'dbus-run-session', 'pdftoppm', 'git']) {
    try {
      await run('sh', ['-c', `command -v ${tool}`]);
    } catch {
      missing.push(tool);
    }
  }
  if (missing.length) throw new Error(`Missing tools: ${missing.join(', ')} (sudo apt install xvfb xdotool dbus poppler-utils)`);
  if (!existsSync(APP_BIN)) throw new Error(`App binary not found: ${APP_BIN}\nBuild it first: pnpm tauri build --no-bundle`);
}

/** Writes the app preferences where WebKitGTK keeps localStorage. */
function seedPreferences(dataHome) {
  const dir = join(dataHome, 'com.mdview.desktop', 'localstorage');
  return mkdir(dir, { recursive: true }).then(() => {
    const db = new DatabaseSync(join(dir, 'tauri_localhost_0.localstorage'));
    db.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB NOT NULL ON CONFLICT FAIL)');
    db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
      'md-view:prefs',
      Buffer.from(JSON.stringify(S.PREFS), 'utf16le'),
    );
    db.close();
  });
}

/** Demo folder as a git repo: commits S.GIT.committed, then leaves the edited files on disk. */
async function createDemoRepo(dir) {
  const write = async (files) => {
    for (const [name, body] of Object.entries(files)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), body);
    }
  };
  // Isolated from the user's git config (signing, hooks, templates).
  const git = (...args) =>
    run('git', ['-c', 'user.name=md-view', '-c', 'user.email=demo@md-view', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: dir,
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    });
  await write({ ...S.FILES, ...S.GIT.committed });
  await git('init', '-q', '-b', S.GIT.branch);
  await git('add', '-A');
  await git('commit', '-q', '-m', 'Demo project');
  await write(S.FILES);
}

async function startXvfb(display) {
  const xvfb = spawn('Xvfb', [display, '-screen', '0', `${SCREEN.width}x${SCREEN.height}x24`, '-nolisten', 'tcp'], {
    stdio: 'ignore',
  });
  const socket = `/tmp/.X11-unix/X${display.slice(1)}`;
  for (let i = 0; i < 100 && !existsSync(socket); i += 1) await sleep(50);
  if (!existsSync(socket)) throw new Error('Xvfb did not start');
  return xvfb;
}

/** Without a window manager the default X cursor is a cross: use the themed arrow. */
function arrowCursor(env) {
  return run('xsetroot', ['-cursor_name', 'left_ptr'], { env }).catch(() => {});
}

/* ------------------------------------------------------------------------ */
/* Real input                                                                 */
/* ------------------------------------------------------------------------ */

function input(env) {
  const xdo = (...args) => run('xdotool', args, { env });
  const pointer = { x: SCREEN.width - 80, y: SCREEN.height - 80 };
  const px = (value) => Math.round(value * S.SCALE);

  return {
    xdo,
    /** Smooth pointer motion (logical coordinates), eased like a hand would. */
    async moveTo(x, y, ms = 550) {
      const steps = Math.max(1, Math.round(ms / 16));
      const args = [];
      const from = { ...pointer };
      for (let i = 1; i <= steps; i += 1) {
        const p = i / steps;
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        args.push('mousemove', String(Math.round(from.x + (px(x) - from.x) * e)), String(Math.round(from.y + (px(y) - from.y) * e)));
        if (i < steps) args.push('sleep', '0.016');
      }
      await xdo(...args);
      Object.assign(pointer, { x: px(x), y: px(y) });
    },
    park: () => xdo('mousemove', String(pointer.x), String(pointer.y)),
    click: () => xdo('click', '1'),
    key: (combo) => xdo('key', '--clearmodifiers', combo),
    wheel: (clicks) => xdo('click', '--repeat', String(clicks), '--delay', '45', '5'),
    /** Newlines and backticks go as explicit keys: `xdotool type` drops them in WebKitGTK. */
    async type(text, delay) {
      let pending = '';
      const flush = async () => {
        if (pending) await xdo('type', '--delay', String(delay), '--', pending);
        pending = '';
      };
      for (const char of text) {
        if (char !== '\n' && char !== '`') {
          pending += char;
          continue;
        }
        await flush();
        await xdo('key', char === '\n' ? 'Return' : 'grave');
        await sleep(delay * 1.5);
      }
      await flush();
    },
  };
}

/* ------------------------------------------------------------------------ */
/* App and capture                                                            */
/* ------------------------------------------------------------------------ */

/** Started from the demo folder: that is where the native file dialogs open. */
function launchApp(env, files) {
  return spawn('dbus-run-session', ['--', APP_BIN, ...files], {
    env,
    cwd: join(homedir(), S.DEMO_DIR),
    stdio: 'ignore',
    detached: true,
  });
}

function kill(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

function launchViewer(env, file) {
  return spawn('dbus-run-session', ['--', S.PDF_VIEWER.command, file], {
    env: { ...env, ADW_DEBUG_COLOR_SCHEME: 'prefer-dark', GSK_RENDERER: 'cairo' },
    stdio: 'ignore',
    detached: true,
  });
}

function hasCommand(name) {
  return run('sh', ['-c', `command -v ${name}`]).then(() => true, () => false);
}

async function waitForWindow(env, windowClass = 'md-view') {
  const { stdout } = await run('xdotool', ['search', '--sync', '--onlyvisible', '--class', windowClass], { env });
  return stdout.trim().split('\n')[0];
}

/** Waits for a second top-level window (the native save dialog); returns its rect in logical pixels. */
async function waitForDialog(env, mainId) {
  for (let i = 0; i < 50; i += 1) {
    const { stdout } = await run('xdotool', ['search', '--onlyvisible', '--class', 'md-view'], { env }).catch(() => ({ stdout: '' }));
    const id = stdout.trim().split('\n').find((item) => item && item !== mainId);
    if (id) {
      const { stdout: shell } = await run('xdotool', ['getwindowgeometry', '--shell', id], { env });
      const value = (key) => Number(shell.match(new RegExp(`${key}=(\\d+)`))[1]) / S.SCALE;
      return { x: value('X'), y: value('Y'), width: value('WIDTH'), height: value('HEIGHT') };
    }
    await sleep(100);
  }
  return null;
}

async function waitForDialogClosed(env, mainId, ms) {
  for (let waited = 0; waited < ms; waited += 100) {
    const { stdout } = await run('xdotool', ['search', '--onlyvisible', '--class', 'md-view'], { env }).catch(() => ({ stdout: '' }));
    if (!stdout.trim().split('\n').some((id) => id && id !== mainId)) return true;
    await sleep(100);
  }
  return false;
}

function startCapture(display, file) {
  const ffmpeg = spawn(ffmpegPath, [
    '-y', '-hide_banner',
    '-f', 'x11grab', '-framerate', String(S.OUTPUT.fps), '-video_size', `${SCREEN.width}x${SCREEN.height}`,
    '-draw_mouse', '1', '-i', `${display}.0`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '10', '-g', String(S.OUTPUT.fps), '-pix_fmt', 'yuv420p', file,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });

  // x11grab stamps frames with the wall clock: "start: <unix seconds>".
  const started = new Promise((resolve, reject) => {
    let log = '';
    ffmpeg.stderr.on('data', (chunk) => {
      log += chunk;
      const match = log.match(/start: (\d+\.\d+)/);
      if (match) resolve(Number(match[1]));
    });
    ffmpeg.on('exit', () => reject(new Error(`ffmpeg capture exited:\n${log.slice(-800)}`)));
  });

  return {
    started,
    stop: () =>
      new Promise((resolve) => {
        ffmpeg.on('exit', resolve);
        ffmpeg.stdin.write('q');
      }),
  };
}

/**
 * First frame after `from` with the dark UI on screen. Before that the capture
 * is the empty X screen (black) and then the blank webview (white).
 */
async function detectReady(file, from) {
  const { stderr } = await run(ffmpegPath, [
    '-hide_banner', '-ss', from.toFixed(3), '-t', '5', '-i', file,
    '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-',
  ], { maxBuffer: 64 * 1024 * 1024 }).catch((error) => error);
  const frames = [...String(stderr).matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map(([, time, luma]) => ({
    time: Number(time),
    luma: Number(luma),
  }));
  // The window maps grey (GTK), turns white (webview loading), then paints the UI.
  const lastWhite = frames.findLastIndex((frame) => frame.luma > 200 && frame.time < 3);
  const painted = lastWhite >= 0 ? frames[lastWhite + 1] : frames.find((frame) => frame.luma > 20);
  return painted ? from + painted.time : null;
}

/* ------------------------------------------------------------------------ */
/* Recording                                                                  */
/* ------------------------------------------------------------------------ */

async function record(layout, env, display) {
  const io = input(env);
  const raw = join(OUT, 'raw.mkv');
  const files = S.OPEN.map(demoPath);

  // Warm-up launch off camera (first WebKit start builds caches), like an app you already use.
  await io.park();
  const warm = launchApp(env, files);
  await waitForWindow(env);
  await sleep(2500);
  kill(warm);
  await sleep(800);

  const viewerAvailable = await hasCommand(S.PDF_VIEWER.command);
  if (!viewerAvailable) console.warn(`  ${S.PDF_VIEWER.command} not found: showing a PDF card instead.`);
  const sample = viewerAvailable && (await readdir(OUT)).find((name) => name.endsWith('.pdf'));
  if (sample) {
    // The viewer's first start is off camera too.
    const warmViewer = launchViewer(env, join(OUT, sample));
    await waitForWindow(env, S.PDF_VIEWER.windowClass);
    await sleep(2000);
    kill(warmViewer);
    await sleep(500);
  }

  const capture = startCapture(display, raw);
  const t0 = await capture.started;
  const now = () => Date.now() / 1000 - t0;
  const timeline = { captions: [], camera: [], clicks: [], launch: null, windowIn: 0, pdf: null, end: null };
  const mark = (label) => console.log(`  ${now().toFixed(1).padStart(5)}s  ${label}`);

  const caption = (key) => timeline.captions.push({ t: now(), ...S.CAPTIONS[key] });
  const camera = (rect, zoom = 1, dur = S.CAMERA.transition) => {
    timeline.camera.push({ t: now(), rect, zoom, dur });
    return sleep(dur * 1000);
  };
  const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const clickAt = async ({ x, y }, ms = 550) => {
    await io.moveTo(x, y, ms);
    timeline.clicks.push({ t: now(), x, y });
    await io.click();
  };
  const type = async (chunks) => {
    for (const chunk of chunks) {
      await io.type(chunk.text, 22);
      await sleep(chunk.pause);
    }
  };

  let app;
  let viewer;
  try {
    await sleep(400);
    mark('launch');
    caption('launch');
    await sleep(900);
    const launchedAt = now();
    app = launchApp(env, files);
    const mainId = await waitForWindow(env);
    timeline.windowIn = now();
    timeline.launch = { t: launchedAt };
    await sleep(1100);

    mark('folder');
    caption('folder');
    await clickAt(center(layout.openMenu), 550);
    await sleep(300);
    await clickAt(center(layout.openFolderItem), 400);
    const folderDialog = await waitForDialog(env, mainId);
    if (folderDialog) {
      await io.key('ctrl+l');
      // The location entry comes pre-filled with the current folder.
      await io.key('ctrl+a');
      await io.type(`~/${S.DEMO_DIR}`, 14);
      await sleep(250);
      await io.key('Return');
      // Some GTK versions only enter the folder on the first Return.
      if (!(await waitForDialogClosed(env, mainId, 1200))) {
        await io.key('Return');
        await waitForDialogClosed(env, mainId, 2000);
      }
    }
    await sleep(400);
    for (const name of S.BROWSE) {
      if (name === S.NOTES) {
        mark('changes');
        caption('changes');
      }
      await clickAt(center(layout.tree[name]), 450);
      await sleep(600);
      if (name === S.NOTES) {
        await sleep(900);
        // Scrolled now, so coming back to this tab later shows it kept its place.
        const notesPreview = center(layout.previewPane);
        await io.moveTo(notesPreview.x, notesPreview.y, 350);
        await io.wheel(7);
        await sleep(250);
      }
    }

    mark('mermaid');
    caption('mermaid');
    const editorPoint = { x: layout.editor.x + layout.editor.width * 0.35, y: layout.workspace.y + layout.workspace.height * 0.8 };
    await clickAt(editorPoint, 650);
    await io.key('ctrl+End');
    await type(S.TYPING.mermaid);
    const art = layout.diagramArt;
    const pad = 24;
    await camera({ x: art.x - pad, y: art.y - pad, width: art.width + pad * 2, height: art.height + pad * 2 }, S.CAMERA.closeUp);
    await sleep(700);

    mark('math');
    caption('math');
    await camera(null, 1, 0.7);
    await type(S.TYPING.math);
    const bottom = layout.formula.y + layout.formula.height;
    const result = { x: layout.previewPane.x, y: layout.diagram.y, width: layout.previewPane.width, height: bottom - layout.diagram.y };
    timeline.coverAt = now() + S.CAMERA.transition + 0.3;
    await camera(result, 1.3);
    await sleep(800);

    mark('tabs');
    caption('tabs');
    await camera(null, 1, 0.7);
    await clickAt(center(layout.tabs[S.NOTES]), 450);
    await sleep(900);
    await clickAt(center(layout.tabs[S.PDF_DOC]), 400);
    await sleep(300);

    // Themes and export share one open menu: appearance choices keep it open.
    mark('themes');
    caption('themes');
    await clickAt(center(layout.menuButton), 500);
    await sleep(250);
    const appearance = center(layout.appearanceItem);
    await io.moveTo(appearance.x, appearance.y, 400);
    await sleep(300);
    for (const step of S.THEME_STEPS) {
      await clickAt(center(layout.appearance[step.item]), 350);
      await sleep(step.hold);
    }

    mark('pdf');
    caption('pdf');
    const pdfFile = demoPath(S.PDF_DOC.replace(/\.md$/, '.pdf'));
    await rm(pdfFile, { force: true });
    const exportAt = center(layout.exportItem);
    await io.moveTo(appearance.x, appearance.y, 300);
    await io.moveTo(exportAt.x, exportAt.y, 450);
    await sleep(250);
    await clickAt(center(layout.pdfItem), 400);
    await waitForDialog(env, mainId);
    await sleep(500);
    await io.key('Return');
    for (let i = 0; i < 100 && !existsSync(pdfFile); i += 1) await sleep(100);
    await sleep(300);
    if (viewerAvailable && existsSync(pdfFile)) {
      mark('pdf viewer');
      // GTK4 shows an "x" cursor without a window manager: keep the pointer out of frame.
      await io.moveTo(S.APP.width, S.APP.height, 300);
      viewer = launchViewer(env, pdfFile);
      const viewerId = await waitForWindow(env, S.PDF_VIEWER.windowClass);
      await io.xdo('windowmove', viewerId, '0', '0', 'windowsize', viewerId, String(SCREEN.width), String(SCREEN.height));
      caption('viewer');
      timeline.viewer = { t: now() };
      await sleep(2000);
    } else {
      timeline.pdf = { t: now(), file: pdfFile };
      await sleep(2000);
    }

    mark('end card');
    timeline.end = { t: now(), card: S.END_CARD };
    await sleep(S.END_HOLD * 1000);
    mark('done');
  } finally {
    await capture.stop();
    kill(app);
    kill(viewer);
  }

  const ready = await detectReady(raw, timeline.launch.t);
  timeline.launch.ready = ready ?? timeline.windowIn;
  timeline.launch.seconds = timeline.launch.ready - timeline.launch.t;
  timeline.launch.hideAt = S.LAUNCH_TIMER ? timeline.launch.ready + 1.8 : timeline.launch.t;
  // The empty window frames (grey, then white while the webview loads) are cut.
  timeline.windowIn = timeline.launch.ready;
  console.log(`  launch → UI on screen: ${timeline.launch.seconds.toFixed(2)} s`);
  return { raw, timeline };
}

/* ------------------------------------------------------------------------ */
/* Compositing                                                                */
/* ------------------------------------------------------------------------ */

async function extractFrames(raw, dir, from) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-ss', from.toFixed(3), '-i', raw,
    '-vf', `fps=${S.OUTPUT.fps}`, '-q:v', '2', join(dir, '%05d.jpg'),
  ]);
  return (await readdir(dir)).length;
}

function shift(timeline, by) {
  const at = (t) => t - by;
  return {
    ...timeline,
    captions: timeline.captions.map((item) => ({ ...item, t: at(item.t) })),
    camera: timeline.camera.map((item) => ({ ...item, t: at(item.t) })),
    clicks: timeline.clicks.map((item) => ({ ...item, t: at(item.t) })),
    windowIn: at(timeline.windowIn),
    coverAt: at(timeline.coverAt),
    launch: { ...timeline.launch, t: at(timeline.launch.t), ready: at(timeline.launch.ready), hideAt: at(timeline.launch.hideAt) },
    pdf: timeline.pdf && { ...timeline.pdf, t: at(timeline.pdf.t) },
    viewer: timeline.viewer && { t: at(timeline.viewer.t) },
    end: { ...timeline.end, t: at(timeline.end.t) },
  };
}

async function launchBrowser() {
  const forced = process.env.PROMO_BROWSER;
  if (forced) return chromium.launch({ executablePath: forced });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

async function composite(timeline, framesDir, frameCount) {
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: S.OUTPUT.width, height: S.OUTPUT.height } });
  await page.goto(pathToFileURL(join(HERE, 'stage.html')).href);
  await page.evaluate((t) => window.stage.setup(t), {
    ...timeline,
    fps: S.OUTPUT.fps,
    app: S.APP,
    captureOffset: 0,
    frameCount,
    framesUrl: pathToFileURL(framesDir).href,
  });

  const output = join(OUT, 'md-view-linkedin.mp4');
  const encoder = spawn(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(S.OUTPUT.fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', output,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const encoded = new Promise((resolve, reject) => encoder.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));

  const speed = S.OUTPUT.speed ?? 1;
  const sourceFrames = Math.min(frameCount, Math.round((timeline.end.t + S.END_HOLD) * S.OUTPUT.fps));
  const total = Math.floor(sourceFrames / speed);
  for (let index = 0; index < total; index += 1) {
    await page.evaluate((t) => window.stage.render(t), (index * speed) / S.OUTPUT.fps);
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!encoder.stdin.write(jpeg)) await new Promise((resolve) => encoder.stdin.once('drain', resolve));
    if (index % 150 === 0) console.log(`  frame ${index}/${total}`);
  }
  encoder.stdin.end();
  await encoded;

  // Cover (LinkedIn thumbnail): the diagram + formula close-up with its own headline.
  await page.evaluate(
    ([t, cover]) => window.stage.render(t, { captions: [{ t: -10, ...cover }], hideStopwatch: true, hidePdf: true, hideEnd: true }),
    [timeline.coverAt, S.CAPTIONS.cover],
  );
  await page.screenshot({ path: join(OUT, 'cover.png') });
  await browser.close();
  return { output, seconds: total / S.OUTPUT.fps };
}

/* ------------------------------------------------------------------------ */

async function main() {
  await checkTools();
  await mkdir(OUT, { recursive: true });

  console.log('Probing layout…');
  const layout = await probeLayout({ root: ROOT, here: HERE, demoPath });

  const work = await mkdtemp(join(tmpdir(), 'md-view-promo-'));
  const display = freeDisplay();
  const env = {
    ...process.env,
    DISPLAY: display,
    GDK_BACKEND: 'x11',
    GDK_SCALE: String(S.SCALE),
    XDG_SESSION_TYPE: 'x11',
    XDG_CONFIG_HOME: join(work, 'config'),
    XDG_DATA_HOME: join(work, 'data'),
    XDG_CACHE_HOME: join(work, 'cache'),
    GTK_THEME: 'Adwaita:dark',
    XCURSOR_THEME: 'Adwaita',
    XCURSOR_SIZE: String(24 * S.SCALE),
    NO_AT_BRIDGE: '1',
  };
  delete env.WAYLAND_DISPLAY;
  await seedPreferences(env.XDG_DATA_HOME);

  const demoDir = join(homedir(), S.DEMO_DIR);
  await rm(demoDir, { recursive: true, force: true });
  await createDemoRepo(demoDir);

  const xvfb = await startXvfb(display);
  await arrowCursor(env);
  let recorded;
  try {
    console.log(`Recording the real app on ${display}…`);
    recorded = await record(layout, env, display);
  } finally {
    xvfb.kill('SIGTERM');
  }

  const { raw, timeline } = recorded;
  const pdfName = S.PDF_DOC.replace(/\.md$/, '.pdf');
  const pdfFile = demoPath(pdfName);
  if (existsSync(pdfFile)) {
    await copyFile(pdfFile, join(OUT, pdfName));
    if (timeline.pdf) {
      await run('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', join(OUT, pdfName), join(OUT, 'pdf-page')]);
      timeline.pdf.name = pdfName;
      timeline.pdf.src = pathToFileURL(join(OUT, 'pdf-page.png')).href;
    }
  } else {
    console.warn('  The PDF was not written.');
    timeline.pdf = null;
  }
  await rm(demoDir, { recursive: true, force: true });
  await rm(work, { recursive: true, force: true });

  // Start right before the UI appears: the first seconds are the hook.
  const start = Math.max(0, timeline.launch.ready - 0.4);
  const shifted = shift(timeline, start);
  const framesDir = join(OUT, 'frames');
  console.log('Extracting frames…');
  const frameCount = await extractFrames(raw, framesDir, start);
  console.log('Compositing…');
  const { output, seconds } = await composite(shifted, framesDir, frameCount);
  await writeFile(join(OUT, 'timeline.json'), JSON.stringify(shifted, null, 2));
  await rm(framesDir, { recursive: true, force: true });

  console.log(`\nVideo (${seconds.toFixed(1)} s): ${output}\nCover: ${join(OUT, 'cover.png')}\nPDF:   ${join(OUT, pdfName)}\nRaw:   ${raw}`);
}

await main();
