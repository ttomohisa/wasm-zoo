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

const envText = read('versions.env');
const env = Object.fromEntries(envText.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => {
    const i = line.indexOf('=');
    return [line.slice(0, i), line.slice(i + 1).replace(/^[\"']|[\"']$/g, '')];
  }));
const pkg = JSON.parse(read('../../packages/libvips/package.json'));
need(/^\d+\.\d+\.\d+$/.test(env.BUILDER_VERSION || ''), 'builder version must be x.y.z');
need(env.BUILDER_VERSION === pkg.zoo?.builderVersion, 'builder version must match package metadata');
need(/^\d+\.\d+\.\d+$/.test(env.EMSDK_VERSION || ''), 'EMSDK_VERSION must be x.y.z');
need(env.EMSCRIPTEN_REF === env.EMSDK_VERSION, 'EMSCRIPTEN_REF must match the emsdk image version');
need(pkg.zoo?.toolchain === `Emscripten ${env.EMSDK_VERSION}`, 'package toolchain must match EMSDK_VERSION');
need(env.LIBVIPS_REF === `v${pkg.upstream?.version}`, 'LIBVIPS_REF must match package upstream version');
need(/^\d+\.\d+\.\d+$/.test(env.WASM_VIPS_VERSION || ''), 'WASM_VIPS_VERSION must be x.y.z');
need(pkg.referenceWasm?.packageVersion === env.WASM_VIPS_VERSION, 'reference wasm-vips version must match the pinned adapter');
need(pkg.tracker?.candidateMode === 'auto', 'libvips must use fail-closed automatic adapter candidates');
for (const key of [
  'EMSCRIPTEN_COMMIT',
  'LIBVIPS_COMMIT',
  'WASM_VIPS_COMMIT',
  'WASM_VIPS_LIBVIPS_PATCH_COMMIT',
  'WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT'
]) need(/^[0-9a-f]{40}$/i.test(env[key] || ''), `${key} must be an exact 40-character commit`);

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
