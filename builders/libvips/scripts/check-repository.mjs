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
  'BUILDER_VERSION=0.5.0',
  'EMSDK_VERSION=6.0.7',
  'EMSCRIPTEN_COMMIT=4483d70a78098ed5d860dff2dc21f3025b2da2ee',
  'LIBVIPS_REF=v8.18.5',
  'LIBVIPS_COMMIT=7c28da9c2b8b5b8defe54f2ae92ee474c0e2d6e4',
  'WASM_VIPS_COMMIT=ec8ead9f9c7cf2b08025736d76d10505984daf77',
  'WASM_VIPS_LIBVIPS_PATCH_COMMIT=9cf194014a7047064b0647e20d0606b2dc29d83c',
  'WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT=408c8147747c66216a3a47620eb5287b96438492'
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
