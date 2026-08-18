import fs from 'node:fs/promises';
import path from 'node:path';
import { readEnv, root } from './lib.mjs';

const env = await readEnv(path.join(root, 'builders', 'ffmpeg', 'versions.env'));
const version = env.FFMPEG_REF.replace(/^n/, '');
const profiles = ['browser-full', 'browser-full-gpl'];
const required = ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'browser-ffmpeg.js', 'manifest.json', 'features.json'];
let staged = 0;

for (const profile of profiles) {
  const source = path.join(root, 'builders', 'ffmpeg', 'dist', profile);
  const dest = path.join(root, 'site', 'assets', 'ffmpeg', version, profile);
  try {
    await fs.access(path.join(source, 'manifest.json'));
  } catch {
    console.log(`[skip] ${profile}: build it first if you want to use the local Playground`);
    continue;
  }
  await fs.mkdir(dest, { recursive: true });
  for (const name of required) await fs.copyFile(path.join(source, name), path.join(dest, name));
  staged += 1;
  console.log(`[OK] staged ${profile} for local Playground`);
}

if (!staged) console.log('[info] Playground release cores are not staged locally; the catalog can still be previewed.');
