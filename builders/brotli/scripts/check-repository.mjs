import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const repoRoot=path.resolve(root,"../..");
const errors=[]; const need=(ok,msg)=>{if(!ok)errors.push(msg)}; const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const env=Object.fromEntries(read("versions.env").split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const pkg=JSON.parse(fs.readFileSync(path.join(repoRoot,"packages/brotli/package.json"),"utf8"));
const profile=pkg.profiles?.find((item)=>item.id==="browser-full");

for(const rel of ["scripts/smoke-test.mjs","runtime/browser-brotli.js","runtime/wasm-zoo.mjs"]) {
  const r=spawnSync(process.execPath,["--check",path.resolve(root,rel)],{encoding:"utf8"});
  if(r.status!==0) errors.push(`JavaScript syntax check failed: ${rel}: ${r.stderr||r.stdout}`);
}

need(pkg.status==="available","Brotli must remain an available reviewed package");
need(pkg.upstream?.version===env.BROTLI_VERSION,"Brotli manifest upstream version must match versions.env");
need(pkg.upstream?.ref===env.BROTLI_REF&&env.BROTLI_REF===`v${env.BROTLI_VERSION}`,"Brotli reviewed ref must be v<version>");
need(pkg.tracker?.candidateMode==="auto","Brotli must use review-only automatic candidates");
need(JSON.stringify(pkg.tracker?.candidateProfiles)===JSON.stringify(["browser-full"]),"Brotli automatic candidate must test browser-full");
need(pkg.zoo?.builderVersion===env.BUILDER_VERSION,"Brotli builder version mismatch");
need(pkg.zoo?.toolchain===`Emscripten ${env.EMSDK_VERSION}`,"Brotli toolchain metadata mismatch");
need(pkg.zoo?.buildModel==="upstream-cmake-cli-patch-zero","Brotli build model must preserve patch-zero upstream CMake CLI");
need(profile?.target==="browser"&&profile?.threads===false&&profile?.sharedArrayBuffer===false&&profile?.playground===true&&profile?.playgroundPath==="./brotli-playground/","Brotli browser-full runtime/Playground contract mismatch");
need(profile?.releaseAsset===`brotli-browser-full-${env.BROTLI_VERSION}-zoo-${env.BUILDER_VERSION}.zip`,"Brotli release asset must follow reviewed version/builder");
need(pkg.release?.tag===`brotli-v${env.BUILDER_VERSION}`,"Brotli package release tag must follow builder version");
need(pkg.release?.sourceAsset===`brotli-sources-${env.BROTLI_VERSION}-zoo-${env.BUILDER_VERSION}.tar.gz`,"Brotli source asset must follow reviewed version/builder");
need(pkg.release?.checksumsAsset==="SHA256SUMS.txt","Brotli release must retain SHA256SUMS.txt");

need(/^\d+\.\d+\.\d+$/.test(env.BUILDER_VERSION||""),"Brotli builder version must be x.y.z");
need(/^\d+\.\d+\.\d+$/.test(env.BROTLI_VERSION||""),"Brotli upstream version must be x.y.z");
need(env.EMSDK_VERSION==="6.0.8"&&env.EMSCRIPTEN_REF===env.EMSDK_VERSION,"unexpected Emscripten version/ref");
need(env.EMSCRIPTEN_COMMIT==="aeb67926e7de656da38bc807d83050af93578758","unexpected Emscripten commit");
need(env.BROTLI_REPOSITORY==="https://github.com/google/brotli.git","Brotli source repository must remain official google/brotli");
need(/^[0-9a-f]{40}$/.test(env.BROTLI_COMMIT||""),"Brotli commit must be an exact 40-character SHA");

const fetchScript=read("scripts/fetch-brotli.sh");
for(const token of ["refs/tags/$BROTLI_REF:refs/tags/$BROTLI_REF","rev-parse HEAD","describe --tags --exact-match","c/tools/brotli.c","no source patch step"]) need(fetchScript.includes(token),`fetch contract missing: ${token}`);
for(const forbidden of ["git apply","patch -p","sed -i","perl -pi"]) need(!fetchScript.includes(forbidden),`fetch path must not patch upstream source: ${forbidden}`);
const build=read("scripts/build-full.sh");
for(const token of ["emcmake cmake -S /src/brotli","--target brotli","-DBROTLI_BUILD_TOOLS=ON","-DBUILD_SHARED_LIBS=OFF","createBrotliCore","-sUSE_PTHREADS=0","-sFORCE_FILESYSTEM=1","-sEXPORTED_RUNTIME_METHODS=FS,callMain","sourcePatchCount\": 0","upstreamBuildTarget\": \"brotli\""]) need(build.includes(token),`build contract missing: ${token}`);
need(!build.includes("c/tools/brotli.c >")&&!build.includes("cp /workspace"),"build must not replace upstream Brotli source");
const smoke=read("tests/smoke-test.html");
for(const token of [`brotli ${env.BROTLI_VERSION}`,"['-q','11'","['-t','/payload.br']","['-d','-o','/roundtrip.txt'",`SMOKE_TEST_PASS_brotli_${env.BROTLI_VERSION}`]) need(smoke.includes(token),`smoke contract missing: ${token}`);
const runtime=read("runtime/browser-brotli.js");
for(const token of ["createBrotliCore","brotli-core.js","brotli-core.wasm","core.FS.writeFile","core.callMain","typeof Worker"]) need(runtime.includes(token),`runtime contract missing: ${token}`);
need(!runtime.includes("SharedArrayBuffer"),"Brotli runtime must not require SharedArrayBuffer");
const release=read("scripts/prepare-release.sh");
for(const token of ["provenance.json","sbom.cdx.json","wasm-zoo.mjs",'binary="brotli-${PROFILE}-${BROTLI_VERSION}-zoo-${BUILDER_VERSION}.zip"','source_asset="brotli-sources-${BROTLI_VERSION}-zoo-${BUILDER_VERSION}.tar.gz"',"SHA256SUMS.txt"]) need(release.includes(token),`release contract missing: ${token}`);
if(errors.length){console.error(`[NG] ${errors.length} Brotli repository check(s)`);for(const e of errors)console.error(` - ${e}`);process.exit(1);}
console.log(`[OK] Brotli ${env.BROTLI_VERSION} patch-zero release/automatic-candidate contract verified`);
