import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[]; const read=(p)=>fs.readFileSync(path.join(root,p),'utf8'); const need=(ok,msg)=>{if(!ok)errors.push(msg)};
for(const rel of ['scripts/smoke-test.mjs','runtime/browser-ghostscript.js','../../site/ghostscript-playground/app.js']) { const r=spawnSync(process.execPath,['--check',path.resolve(root,rel)],{encoding:'utf8'}); if(r.status!==0) errors.push(`JavaScript syntax check failed: ${rel}: ${r.stderr||r.stdout}`); }
const env=read('versions.env');
for(const pair of [
 ['BUILDER_VERSION=0.7.1','builder version must be 0.7.1'],
 ['EMSDK_VERSION=6.0.7','Emscripten must pin 6.0.7'],
 ['EMSCRIPTEN_COMMIT=4483d70a78098ed5d860dff2dc21f3025b2da2ee','exact Emscripten commit pin is missing'],
 ['GHOSTSCRIPT_VERSION=10.07.1','Ghostscript must pin 10.07.1'],
 ['GHOSTSCRIPT_REF=gs10.07.1','Ghostscript source branch ref is missing'],
 ['GHOSTSCRIPT_COMMIT=053fa3f79d74e774b11fbf399495d4ec65bb33e7','exact Ghostscript branch commit pin is missing'],
 ['GHOSTSCRIPT_RELEASE_TAG=gs10071','Ghostscript release tag pin is missing'],
 ['GHOSTSCRIPT_SOURCE_SHA256=1cdb766de8db8f1e589c817f09c5855ea5f65dfc8540e465a69ac14c18416025','official source archive SHA-256 is missing']
]) need(env.includes(pair[0]),pair[1]);
const fetch=read('scripts/fetch-ghostscript.sh');
need(fetch.includes('sha256sum -c'),'source fetch must verify the official release SHA-256');
need(fetch.includes('GS_VERSION_PATCH=1'),'source fetch must verify version.mak');
const build=read('scripts/build-full.sh');
for(const flag of ['--host="$HOST_TRIPLET"','--build="$BUILD_TRIPLET"','--disable-cups','--disable-dbus','--disable-fontconfig','--disable-gtk','--without-x','--with-drivers="$GHOSTSCRIPT_DRIVER_GROUPS"','-sMODULARIZE=1','-sEXPORT_NAME=createGhostscriptCore','-sEXPORTED_RUNTIME_METHODS=FS,callMain','-sALLOW_MEMORY_GROWTH=1','-sENVIRONMENT=web,worker','emmake make','gs-core.wasm','PDF input -> png16m output','PostScript input -> pdfwrite output']) need(build.includes(flag),`build contract missing: ${flag}`);

need(build.includes('CONFIGURE_LINK_FLAGS="$OPT_FLAGS"'),'configure must use conservative linker flags');
need(build.includes('FINAL_LINK_FLAGS="$OPT_FLAGS -sDEFAULT_TO_CXX=1 -sFILESYSTEM=1'),'final Ghostscript link must enable the Emscripten C++ runtime while isolating browser-only settings');
need(build.includes('LDFLAGS="$CONFIGURE_LINK_FLAGS"'),'configure must not receive browser-only Emscripten JS glue settings');
need(build.includes('generated Ghostscript Makefile has no LDFLAGS assignment'),'build must inject final browser flags after configure');
need(build.includes('emcc $OPT_FLAGS -sDEFAULT_TO_CXX=1 /tmp/wasm-zoo-cxx-link.o'),'build must preflight the C++ runtime with the same emcc final-link mode');
need(build.includes('Emscripten C++ runtime final-link preflight failed'),'C++ runtime preflight must fail with an actionable diagnostic');
need(!build.includes('-pthread'),'Ghostscript browser-full must stay single-threaded ');
need(build.includes('THIRD-PARTY-LICENSES') && build.includes('COPYRIGHT*'), 'build must collect bundled third-party license/copyright notices');
const runtime=read('runtime/browser-ghostscript.js');
for(const s of ['createGhostscriptCore','gs-core.js','gs-core.wasm','WasmZooGhostscript','collectDirs','Ghostscript CLI timed out after']) need(runtime.includes(s),`runtime contract missing: ${s}`);
need(!runtime.includes('SharedArrayBuffer'),'Ghostscript runtime must not require SharedArrayBuffer');
const smoke=read('tests/smoke-test.html');
for(const s of ['10.07.1','-sDEVICE=png16m','-sDEVICE=pdfwrite','SMOKE_TEST_PASS_Ghostscript']) need(smoke.includes(s),`smoke contract missing: ${s}`);
const docker=read('docker/Dockerfile'); need(docker.includes('/out/source/'),'Docker export must retain the exact official source archive for AGPL handoff');
if(errors.length){console.error(`[NG] ${errors.length} Ghostscript builder check(s)`); for(const e of errors)console.error(` - ${e}`); process.exit(1);} console.log('[OK] Ghostscript 10.07.1 browser-full repository checks passed');
