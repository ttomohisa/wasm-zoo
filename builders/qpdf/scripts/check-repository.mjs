import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const repoRoot=path.resolve(root,"../..");
const errors=[]; const need=(ok,msg)=>{if(!ok)errors.push(msg);};
const read=async(rel)=>(await fs.readFile(path.join(root,rel),"utf8")).replace(/\r\n/g,"\n");
const env={}; for(const raw of (await read("versions.env")).split("\n")){const line=raw.trim();if(!line||line.startsWith("#")||!line.includes("="))continue;const i=line.indexOf("=");env[line.slice(0,i)]=line.slice(i+1).replace(/^['"]|['"]$/g,"");}
const pkg=JSON.parse(await fs.readFile(path.join(repoRoot,"packages/qpdf/package.json"),"utf8"));
const profile=pkg.profiles?.find((item)=>item.id==="browser-full");

need(pkg.status==="available","QPDF must remain an available reviewed package");
need(pkg.upstream?.version===env.QPDF_VERSION,"QPDF manifest upstream version must match versions.env");
need(pkg.upstream?.ref===env.QPDF_REF&&env.QPDF_REF===`v${env.QPDF_VERSION}`,"QPDF reviewed ref must be v<version>");
need(pkg.tracker?.candidateMode==="auto","QPDF must use review-only automatic candidates");
need(JSON.stringify(pkg.tracker?.candidateProfiles)===JSON.stringify(["browser-full"]),"QPDF automatic candidate must test browser-full");
need(pkg.tracker?.candidateSource?.repository==="qpdf/qpdf","QPDF candidate source repository must be qpdf/qpdf");
need(pkg.tracker?.candidateSource?.refTemplate==="v{version}"&&pkg.tracker?.candidateSource?.releaseTagTemplate==="v{version}","QPDF candidate ref/release templates must follow v{version}");
need(pkg.tracker?.candidateSource?.assetNameTemplate==="qpdf-{version}.tar.gz"&&pkg.tracker?.candidateSource?.digestAlgorithm==="sha256","QPDF candidate must use the official digest-pinned release source archive");

need(pkg.zoo?.builderVersion===env.BUILDER_VERSION,"QPDF builder version mismatch");
need(pkg.zoo?.toolchain==="Emscripten "+env.EMSDK_VERSION,"QPDF toolchain metadata mismatch");
need(profile?.target==="browser"&&profile?.threads===false&&profile?.sharedArrayBuffer===false&&profile?.playground===true&&profile?.playgroundPath==="./qpdf-playground/","QPDF browser-full runtime/Playground contract mismatch");
need(profile?.releaseAsset===`qpdf-browser-full-${env.QPDF_VERSION}-zoo-${env.BUILDER_VERSION}.zip`,"QPDF release asset must follow reviewed version/builder");
need(pkg.release?.tag===`qpdf-v${env.BUILDER_VERSION}`,"QPDF package release tag must follow builder version");
need(pkg.release?.sourceAsset===`qpdf-sources-${env.QPDF_VERSION}-zoo-${env.BUILDER_VERSION}.tar.gz`,"QPDF source asset must follow reviewed version/builder");

need(/^\d+\.\d+\.\d+$/.test(env.BUILDER_VERSION||""),"QPDF builder version must be x.y.z");
need(env.EMSDK_VERSION==="6.0.8"&&env.EMSCRIPTEN_REF===env.EMSDK_VERSION,"unexpected Emscripten version/ref");
need(env.EMSCRIPTEN_COMMIT==="aeb67926e7de656da38bc807d83050af93578758","unexpected Emscripten commit");
need(/^[0-9a-f]{40}$/.test(env.QPDF_COMMIT||""),"QPDF commit must be an exact 40-character SHA");
need(env.QPDF_SOURCE_URL===`https://github.com/qpdf/qpdf/releases/download/v${env.QPDF_VERSION}/qpdf-${env.QPDF_VERSION}.tar.gz`,"QPDF source must use the official release asset");
need(/^[0-9a-f]{64}$/.test(env.QPDF_SOURCE_SHA256||""),"QPDF source SHA-256 must be exact");
need(env.ZLIB_VERSION==="1.3.2"&&/^[0-9a-f]{128}$/.test(env.ZLIB_SOURCE_SHA512||""),"QPDF must retain reviewed Emscripten 6.0.8 zlib 1.3.2 source");
need(env.LIBJPEG_VERSION==="9f"&&/^[0-9a-f]{128}$/.test(env.LIBJPEG_SOURCE_SHA512||""),"QPDF must retain reviewed Emscripten 6.0.8 libjpeg 9f source");

const docker=await read("docker/Dockerfile"); need(docker.includes("emscripten/emsdk:${EMSDK_VERSION}")&&docker.includes("fetch-qpdf.sh")&&docker.includes("ZLIB_SOURCE_SHA512")&&docker.includes("LIBJPEG_SOURCE_SHA512"),"Dockerfile must use pinned toolchain, verified QPDF source and pinned Emscripten port inputs");
const build=await read("scripts/build-full.sh");
for(const marker of ["embuilder build zlib libjpeg","zlib port version drift","libjpeg port version drift","-fwasm-exceptions","REQUIRE_CRYPTO_NATIVE=ON","USE_IMPLICIT_CRYPTO=OFF","INCOMING_MODULE_JS_API=wasmBinary,locateFile,print,printErr,thisProgram","qpdf-core.wasm"]) need(build.includes(marker),"QPDF build missing contract marker: "+marker);
const fetcher=await read("scripts/fetch-qpdf.sh"); need(fetcher.includes("sha256sum -c")&&fetcher.includes('refs/tags/$QPDF_REF^{}'),"QPDF fetch must verify official digest and peeled tag commit");
const thirdParty=await read("scripts/stage-third-party-licenses.sh");
need(thirdParty.includes("sha512sum -c")&&thirdParty.includes("LICENSE-ZLIB.txt")&&thirdParty.includes("LICENSE-LIBJPEG.txt"),"QPDF third-party license staging must verify pinned source archives");
const prepare=await read("scripts/prepare-release.sh");
for(const marker of ["qpdf-v${BUILDER_VERSION}","sha512sum -c","zlib-LICENSE.txt","libjpeg-README.txt","emscripten-port-recipes","provenance-browser-full.json","sbom-browser-full.cdx.json"]) need(prepare.includes(marker),"QPDF release prep missing contract marker: "+marker);
const runtime=await read("runtime/browser-qpdf.js"); need(runtime.includes("createQpdfCore")&&runtime.includes("WasmZooQpdf")&&runtime.includes('thisProgram: "qpdf"'),"QPDF runtime core contract mismatch");
const consumer=await read("runtime/wasm-zoo.mjs"); need(consumer.includes('package: "qpdf"')&&consumer.includes('kind: "cli"'),"QPDF Consumer API metadata mismatch");
const smoke=await read("tests/smoke-test.html");
for(const marker of ["makeOnePagePdf","--check","--linearize","--encrypt","--decrypt",`qpdf version ${env.QPDF_VERSION}`]) need(smoke.includes(marker),"QPDF smoke missing reviewed operation/version marker: "+marker);
if(errors.length){console.error("[NG] "+errors.length+" QPDF repository check(s)");for(const e of errors)console.error(" - "+e);process.exit(1);}
console.log(`[OK] QPDF ${env.QPDF_VERSION} reviewed source/release/automatic-candidate contract verified`);
