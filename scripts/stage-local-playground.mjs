import fs from 'node:fs/promises';
import path from 'node:path';
import { readEnv, root } from './lib.mjs';

async function stageFfmpeg() {
  const env = await readEnv(path.join(root, 'builders', 'ffmpeg', 'versions.env'));
  const version = env.FFMPEG_REF.replace(/^n/, '');
  const profiles = ['browser-full', 'browser-full-gpl'];
  const required = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'manifest.json', 'features.json'];
  let staged = 0;
  for (const profile of profiles) {
    const source = path.join(root, 'builders', 'ffmpeg', 'dist', profile);
    const dest = path.join(root, 'site', 'assets', 'ffmpeg', version, profile);
    try { await fs.access(path.join(source, 'manifest.json')); } catch { console.log(`[skip] FFmpeg ${profile}: build it first for local Playground`); continue; }
    await fs.mkdir(dest, { recursive: true });
    for (const name of required) await fs.copyFile(path.join(source, name), path.join(dest, name));
    await fs.copyFile(path.join(root, 'builders', 'ffmpeg', 'runtime', 'browser-ffmpeg.js'), path.join(dest, 'browser-ffmpeg.js'));
    staged += 1;
    console.log(`[OK] staged FFmpeg ${profile}`);
  }
  return staged;
}

async function stageLibarchive() {
  const env = await readEnv(path.join(root, 'builders', 'libarchive', 'versions.env'));
  const version = env.LIBARCHIVE_REF.replace(/^v/, '');
  const profile = 'browser-full';
  const source = path.join(root, 'builders', 'libarchive', 'dist', profile);
  const dest = path.join(root, 'site', 'assets', 'libarchive', version, profile);
  try { await fs.access(path.join(source, 'manifest.json')); } catch { console.log('[skip] libarchive browser-full: build it first for local Playground'); return 0; }
  await fs.mkdir(dest, { recursive: true });
  const required = ['manifest.json', 'features.json'];
  for (const tool of ['bsdtar', 'bsdcpio', 'bsdcat', 'bsdunzip']) required.push(`${tool}-core.js`, `${tool}-core.wasm`);
  for (const name of required) await fs.copyFile(path.join(source, name), path.join(dest, name));
  await fs.copyFile(path.join(root, 'builders', 'libarchive', 'runtime', 'browser-libarchive.js'), path.join(dest, 'browser-libarchive.js'));
  console.log('[OK] staged libarchive browser-full');
  return 1;
}


async function stageImageMagick() {
  const env = await readEnv(path.join(root, 'builders', 'imagemagick', 'versions.env'));
  const version = env.IMAGEMAGICK_REF;
  const profile = 'browser-full';
  const source = path.join(root, 'builders', 'imagemagick', 'dist', profile);
  const dest = path.join(root, 'site', 'assets', 'imagemagick', version, profile);
  try { await fs.access(path.join(source, 'manifest.json')); } catch { console.log('[skip] ImageMagick browser-full: build it first for local Playground'); return 0; }
  await fs.mkdir(dest, { recursive: true });
  for (const name of ['magick-core.js', 'magick-core.wasm', 'manifest.json', 'features.json']) await fs.copyFile(path.join(source, name), path.join(dest, name));
  await fs.copyFile(path.join(root, 'builders', 'imagemagick', 'runtime', 'browser-imagemagick.js'), path.join(dest, 'browser-imagemagick.js'));
  console.log('[OK] staged ImageMagick browser-full');
  return 1;
}

const staged = (await stageFfmpeg()) + (await stageLibarchive()) + (await stageImageMagick());
if (!staged) console.log('[info] No local release cores staged; the catalog can still be previewed.');
