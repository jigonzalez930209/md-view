/**
 * Animated WebP for the README, encoded on every core.
 *
 *   node scripts/promo/webp.mjs [input.mp4] [output.webp]
 *
 * ffmpeg's libwebp_anim is single-threaded (each frame is a diff of the
 * previous one), so a long clip takes minutes on one core. We split the clip
 * into one slice per core, encode the slices in parallel, and splice their
 * frames into a single file. Each slice starts with a full frame, so the ANMF
 * chunks can be concatenated as they are, without re-encoding.
 *
 * Env: WEBP_WIDTH (720), WEBP_FPS (15), WEBP_QUALITY (80), WEBP_JOBS (cores).
 */

import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const input = process.argv[2] ?? join(HERE, 'out', 'md-view-linkedin.mp4');
const output = process.argv[3] ?? join(ROOT, 'docs', 'public', 'media', 'md-view-demo.webp');
const WIDTH = Number(process.env.WEBP_WIDTH ?? 720);
const FPS = Number(process.env.WEBP_FPS ?? 15);
const QUALITY = Number(process.env.WEBP_QUALITY ?? 80);
const JOBS = Number(process.env.WEBP_JOBS ?? availableParallelism());

async function duration(file) {
  // ffmpeg prints "Duration: HH:MM:SS.xx" on stderr when given no output.
  const { stderr } = await run(ffmpegPath, ['-hide_banner', '-i', file]).catch((error) => error);
  const match = /Duration: (\d+):(\d+):([\d.]+)/.exec(stderr ?? '');
  if (!match) throw new Error(`Could not read the duration of ${file}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function encodeSlice(first, last, target) {
  return run(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-vf', `fps=${FPS},scale=${WIDTH}:-2:flags=lanczos,select='between(n\\,${first}\\,${last})'`,
    '-fps_mode', 'passthrough',
    '-an',
    '-c:v', 'libwebp_anim', '-quality', String(QUALITY), '-compression_level', '6', '-loop', '0',
    target,
  ], { maxBuffer: 1 << 24 });
}

/** RIFF chunks of a WebP file: [{ id, data }]. */
function chunks(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('Not a WebP file');
  }
  const list = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    list.push({ id, data: buffer.subarray(offset + 8, offset + 8 + size) });
    offset += 8 + size + (size & 1);
  }
  return list;
}

function chunk(id, data) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return data.length & 1 ? Buffer.concat([header, data, Buffer.alloc(1)]) : Buffer.concat([header, data]);
}

async function main() {
  const frames = Math.round((await duration(input)) * FPS);
  const jobs = Math.max(1, Math.min(JOBS, Math.floor(frames / FPS)));
  const per = Math.ceil(frames / jobs);
  const dir = await mkdtemp(join(tmpdir(), 'md-view-webp-'));
  const started = performance.now();

  try {
    const slices = Array.from({ length: jobs }, (_, index) => ({
      first: index * per,
      last: Math.min(frames, (index + 1) * per) - 1,
      file: join(dir, `slice-${String(index).padStart(2, '0')}.webp`),
    })).filter((slice) => slice.first <= slice.last);

    console.log(`${frames} frames, ${slices.length} slices in parallel (${WIDTH}px, ${FPS} fps, q${QUALITY})…`);
    await Promise.all(slices.map((slice) => encodeSlice(slice.first, slice.last, slice.file)));

    let header = null;
    const frameChunks = [];
    const frameMs = Math.round(1000 / FPS);
    for (const slice of slices) {
      const parts = chunks(await readFile(slice.file));
      header ??= parts.filter((part) => part.id === 'VP8X' || part.id === 'ANIM');
      for (const part of parts.filter((item) => item.id === 'ANMF')) {
        const data = Buffer.from(part.data);
        // Frame duration (24-bit, bytes 12–14): a slice's last frame has no
        // successor to measure against, so every frame gets the nominal one.
        data.writeUIntLE(frameMs, 12, 3);
        frameChunks.push(chunk('ANMF', data));
      }
    }
    if (!header || header.length < 2) throw new Error('The slices are not animated WebP files');

    const body = Buffer.concat([...header.map((part) => chunk(part.id, part.data)), ...frameChunks]);
    const riff = Buffer.alloc(12);
    riff.write('RIFF', 0, 'ascii');
    riff.writeUInt32LE(body.length + 4, 4);
    riff.write('WEBP', 8, 'ascii');
    await writeFile(output, Buffer.concat([riff, body]));

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`${frameChunks.length} frames → ${output} (${(body.length / 1e6).toFixed(2)} MB) in ${seconds} s`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

await main();
