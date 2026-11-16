import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input || process.argv.length > 3) {
  console.error('Usage: node scripts/build-demo-gifs.mjs /absolute/path/to/captured-frames');
  process.exit(1);
}
const framesRoot = resolve(input);
const manifest = JSON.parse(await readFile(join(root, 'docs', 'capture-stories.json'), 'utf8'));
const destination = join(root, 'docs', 'media');
const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
if (ffmpegCheck.status !== 0) throw new Error('Install FFmpeg before building the documentation GIFs.');
await mkdir(destination, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'recall-gifs-'));
const quoteConcat = path => `'${path.replaceAll("'", "'\\''")}'`;
const outputHeight = Math.round(manifest.outputWidth * manifest.viewport.height / manifest.viewport.width);
function runFfmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('FFmpeg could not complete the documentation encoding.');
}
try {
  for (const story of manifest.stories) {
    const frames = story.frames.map(frame => ({ ...frame, path: join(framesRoot, story.directory, `${frame.name}.jpg`) }));
    for (const frame of frames) await access(frame.path);
    // Scrollbars can change screenshot dimensions. Normalize first so FFmpeg
    // never resets the palette filter and loses earlier frames mid-story.
    const normalized = [];
    for (const [index, frame] of frames.entries()) {
      const path = join(scratch, `${story.id}-${index}.png`);
      runFfmpeg(['-i', frame.path, '-vf', `scale=${manifest.outputWidth}:${outputHeight}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${manifest.outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2:color=0xfaf9f6,setsar=1`, '-frames:v', '1', path]);
      normalized.push({ ...frame, path });
    }
    const seconds = frames.reduce((total, frame) => total + frame.seconds, 0);
    const concat = join(scratch, `${story.id}.ffconcat`);
    const lines = normalized.flatMap(frame => [`file ${quoteConcat(frame.path)}`, 'option framerate 4', `duration ${frame.seconds}`]);
    lines.push(`file ${quoteConcat(normalized.at(-1).path)}`, 'option framerate 4');
    await writeFile(concat, `ffconcat version 1.0\n${lines.join('\n')}\n`);
    const output = join(destination, `${story.id}.gif`);
    runFfmpeg([
      '-f', 'concat', '-safe', '0', '-i', concat,
      '-filter_complex', '[0:v]fps=4,split[frames][palette];[palette]palettegen=max_colors=128:stats_mode=diff[colors];[frames][colors]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
      '-t', String(seconds), '-loop', '0', output,
    ]);
    await copyFile(frames[0].path, join(destination, `${story.id}-poster.jpg`));
    console.log(`${story.id}: ${frames.length} real captures, ${seconds}s, ${((await stat(output)).size / 1024).toFixed(0)} KiB`);
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
