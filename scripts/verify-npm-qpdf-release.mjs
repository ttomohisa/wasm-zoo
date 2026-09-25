import fs from "node:fs/promises";
import path from "node:path";
import { root, readJson } from "./lib.mjs";

const args={};
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i], value=process.argv[i+1];
  if(!key?.startsWith("--")||value==null) throw new Error("Invalid argument near "+(key||"<end>"));
  args[key.slice(2)]=value;
}
if(!args.input) throw new Error("Missing --input");

const input=path.resolve(args.input);
const zoo=await readJson(path.join(root,"packages/qpdf/package.json"));
const npm=zoo.npm;
if(npm?.status!=="canary"||npm.package!=="@wasm-zoo/qpdf") throw new Error("QPDF npm metadata is not in reviewed canary state");
const expectedFiles=[
  "browser-qpdf.js","wasm-zoo.mjs","qpdf-core.js","qpdf-core.wasm","manifest.json","features.json",
  "provenance.json","sbom.cdx.json","qpdf-config.txt","BUILDINFO.txt"
];
for(const rel of expectedFiles){
  const stat=await fs.stat(path.join(input,rel)).catch(()=>null);
  if(!stat?.isFile()) throw new Error("Missing immutable QPDF release input: "+rel);
}
for(const rel of ["QPDF-LICENSE.txt","QPDF-NOTICE.md","zlib-LICENSE.txt","libjpeg-README.txt","THIRD-PARTY.txt"]){
  const stat=await fs.stat(path.join(input,"LICENSES",rel)).catch(()=>null);
  if(!stat?.isFile()) throw new Error("Missing immutable QPDF release notice: LICENSES/"+rel);
}

const manifest=await readJson(path.join(input,"manifest.json"));
if(manifest.package!=="qpdf"||manifest.profile!=="browser-full") throw new Error("QPDF release manifest package/profile mismatch");
if(manifest.upstream?.version!==npm.source.upstreamVersion||manifest.upstream?.ref!==`v${npm.source.upstreamVersion}`) throw new Error("QPDF release manifest upstream version/ref mismatch");
if(manifest.upstream?.commit!==npm.source.commit) throw new Error("QPDF release manifest exact commit mismatch");
if(manifest.build?.builderVersion!==npm.source.builderVersion) throw new Error("QPDF release manifest builder mismatch");
if(manifest.toolchain?.version!=="6.0.8") throw new Error("QPDF npm canary must stay on reviewed Emscripten 6.0.8");
if(!/^[0-9a-f]{64}$/.test(manifest.upstream?.sourceSha256||"")) throw new Error("QPDF release manifest source SHA-256 missing");
for(const rel of ["qpdf-core.js","qpdf-core.wasm"]){
  if(!manifest.files?.[rel]?.sha256||!Number.isFinite(manifest.files?.[rel]?.bytes)) throw new Error("QPDF release manifest missing hashed core file "+rel);
}

const provenance=await readJson(path.join(input,"provenance.json"));
const params=provenance.predicate?.buildDefinition?.externalParameters;
if(params?.package!=="qpdf"||params?.upstreamVersion!==npm.source.upstreamVersion||params?.builderVersion!==npm.source.builderVersion||params?.profile!=="browser-full"){
  throw new Error("QPDF provenance identity does not match npm canary source");
}
const sbom=await readJson(path.join(input,"sbom.cdx.json"));
if(sbom.bomFormat!=="CycloneDX"||sbom.specVersion!=="1.6") throw new Error("QPDF npm canary requires CycloneDX 1.6 SBOM");

const buildInfo=await fs.readFile(path.join(input,"BUILDINFO.txt"),"utf8");
for(const marker of [
  `Zoo build version: ${npm.source.builderVersion}`,
  `QPDF version: ${npm.source.upstreamVersion}`,
  `QPDF commit: ${npm.source.commit}`,
  "Emscripten version: 6.0.8",
  "Emscripten zlib 1.3.2 + libjpeg 9f ports"
]){
  if(!buildInfo.includes(marker)) throw new Error("QPDF BUILDINFO missing reviewed marker: "+marker);
}
console.log(`[OK] immutable QPDF ${npm.source.releaseTag}/${npm.source.releaseAsset} matches reviewed npm canary identity`);
