import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const need = (ok, msg) => { if (!ok) errors.push(msg); };

for (const rel of ['scripts/smoke-test.mjs', 'scripts/compare-profiles.mjs', 'runtime/browser-libvips.js', '../../site/libvips-playground/app.js']) {
  const result = spawnSync(process.execPath, ['--check', path.resolve(root, rel)], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`[NG] JavaScript syntax check failed: ${rel}`);
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

const env = read('versions.env');
for (const expected of [
  'BUILDER_VERSION=0.5.2',
  'EMSDK_VERSION=6.0.8',
  'EMSCRIPTEN_COMMIT=aeb67926e7de656da38bc807d83050af93578758',
  'LIBVIPS_REF=v8.18.6',
  'LIBVIPS_COMMIT=426af3f44246fce9cfa8dd51a353aa4dfd48c553',
  'WASM_VIPS_COMMIT=79103664d21ce00982e80571cf12f58bd3dcc5f3',
  'WASM_VIPS_VERSION=0.0.18',
  'WASM_VIPS_LIBVIPS_PATCH_COMMIT=13e85e04f69050fe634fa24539a045be731838fd',
  'WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT=4bc39ffdd215e69e29d1b01c93217334cc732bd4'
]) need(env.includes(expected), `pin missing: ${expected}`);

for (const profile of ['browser-core', 'browser-full']) {
  need(fs.existsSync(path.join(root, 'profiles', profile, 'profile.env')), `profile missing: ${profile}`);
}
const coreProfile = read('profiles/browser-core/profile.env');
for (const expected of ['PROFILE_TRIM_RASTER=true', 'PROFILE_TIFF=false', 'PROFILE_GIF=false', 'PROFILE_IMAGEQUANT=false']) {
  need(coreProfile.includes(expected), `browser-core contract missing: ${expected}`);
}
const fullProfile = read('profiles/browser-full/profile.env');
for (const expected of ['PROFILE_TRIM_RASTER=false', 'PROFILE_TIFF=true', 'PROFILE_GIF=true', 'PROFILE_IMAGEQUANT=true']) {
  need(fullProfile.includes(expected), `browser-full contract missing: ${expected}`);
}

const build = read('scripts/build-full.sh');
for (const flag of [
  'git -C /tmp/libvips-patch diff --binary',
  'patch -p1 < /opt/libvips-wasm.patch',
  '--disable-uhdr --disable-jxl --disable-avif --disable-svg --disable-modules -e web',
  'WASM_ZOO_CORE_MESON_ARGS',
  '-Dcgif=disabled -Dimagequant=disabled -Dquantizr=disabled -Dtiff=disabled',
  '-Dnsgif=false -Dppm=false -Danalyze=false -Dradiance=false',
  'lib/vips.js',
  'lib/vips.wasm',
  'git -C /tmp/libvips-patch show refs/remotes/upstream/base:LICENSE > /opt/LICENSE-libvips.txt',
  'cp /opt/LICENSE-libvips.txt /out/LICENSE-libvips.txt',
  '"threads": true',
  '"simd": true',
  '"sharedArrayBuffer": true',
  '"tiff": $PROFILE_TIFF',
  '"gif": $PROFILE_GIF',
  '"quantizr": false'
]) need(build.includes(flag), `build contract missing: ${flag}`);
need(!build.includes('build/deps/vips/COPYING'), 'obsolete libvips COPYING path must not be used');
need(!build.includes('build/deps/vips/LICENSE'), 'license collection must not depend on the transient libvips build directory');

const wrapper = read('build.sh');
need(wrapper.includes('build_profile browser-core') && wrapper.includes('build_profile browser-full'), 'build.sh all mode must build both profiles');
const ps1 = read('scripts/build.ps1');
need(ps1.includes("@('browser-core','browser-full')"), 'build.ps1 all mode must build both profiles');
const compare = read('scripts/compare-profiles.mjs');
for (const flag of ['browserCoreSavingsVsFull', 'size-comparison.json', 'size-comparison.md', 'vips.wasm.gz', 'vips.js.gz']) {
  need(compare.includes(flag), `size comparison contract missing: ${flag}`);
}

const runtime = read('runtime/browser-libvips.js');
for (const flag of ['crossOriginIsolated', 'SharedArrayBuffer', 'global.Vips', 'mainScriptUrlOrBlob', 'locateFile', 'blockUntrusted']) need(runtime.includes(flag), `runtime contract missing: ${flag}`);
const smoke = read('tests/smoke-test.html');
for (const flag of ["vips.version()", 'Image.newFromBuffer', 'resize(0.5)', "writeToBuffer('.jpg[Q=80]')", "writeToBuffer('.webp[Q=80]')", '#SMOKE_TEST_PASS_']) need(smoke.includes(flag), `smoke contract missing: ${flag}`);

if (errors.length) {
  console.error(`[NG] ${errors.length} libvips builder check(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('[OK] libvips browser-core + browser-full repository checks passed');
