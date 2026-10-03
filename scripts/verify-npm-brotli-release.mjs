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
const zoo=await readJson(path.join(root,"packages/brotli/package.json"));
const npm=zoo.npm;
if(!["canary","published"].includes(npm?.status)||npm.package!=="@wasm-zoo/brotli"){
  throw new Error("Brotli npm metadata is not in a reviewed immutable-distribution state");
}
const profile=zoo.profiles?.find((item)=>item.id===npm.profile);
if(!profile||npm.profile!=="browser-full") throw new Error("Brotli npm must target browser-full");

const envText=await fs.readFile(path.join(root,"builders/brotli/versions.env"),"utf8");
const env=Object.fromEntries(envText.split(/\r?\n/).map((line)=>line.trim()).filter((line)=>line&&!line.startsWith("#")&&line.includes("=")).map((line)=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).replace(/^['"]|['"]$/g,"")];}));
const expectedFiles=[
  "browser-brotli.js","wasm-zoo.mjs","brotli-core.js","brotli-core.wasm","manifest.json","features.json",
  "provenance.json","sbom.cdx.json","brotli-config.txt","BUILDINFO.txt"
];
for(const rel of expectedFiles){
  const stat=await fs.stat(path.join(input,rel)).catch(()=>null);
  if(!stat?.isFile()) throw new Error("Missing immutable Brotli release input: "+rel);
}
const license=await fs.stat(path.join(input,"LICENSES","Brotli-LICENSE.txt")).catch(()=>null);
if(!license?.isFile()) throw new Error("Missing immutable Brotli release notice: LICENSES/Brotli-LICENSE.txt");

const manifest=await readJson(path.join(input,"manifest.json"));
if(manifest.package!=="brotli"||manifest.profile!=="browser-full") throw new Error("Brotli release manifest package/profile mismatch");
if(manifest.upstream?.version!==zoo.upstream.version||manifest.upstream?.ref!==zoo.upstream.ref) throw new Error("Brotli release manifest upstream version/ref mismatch");
if(manifest.upstream?.commit!==env.BROTLI_COMMIT) throw new Error("Brotli release manifest exact commit mismatch");
if(manifest.build?.builderVersion!==zoo.zoo.builderVersion) throw new Error("Brotli release manifest builder mismatch");
if(manifest.toolchain?.version!==env.EMSDK_VERSION||manifest.toolchain?.commit!==env.EMSCRIPTEN_COMMIT) throw new Error("Brotli release manifest toolchain mismatch");
if(manifest.build?.sourcePatchCount!==0||manifest.build?.upstreamBuildTarget!=="brotli") throw new Error("Brotli npm source must retain patch-zero upstream CMake CLI identity");
for(const rel of ["brotli-core.js","brotli-core.wasm"]){
  if(!manifest.files?.[rel]?.sha256||!Number.isFinite(manifest.files?.[rel]?.bytes)) throw new Error("Brotli release manifest missing hashed core file "+rel);
}

const features=await readJson(path.join(input,"features.json"));
for(const key of ["upstreamCli","compress","decompress","integrityTest"]){
  if(features.features?.[key]!==true) throw new Error("Brotli feature inventory missing "+key);
}

const provenance=await readJson(path.join(input,"provenance.json"));
const params=provenance.predicate?.buildDefinition?.externalParameters;
if(params?.package!=="brotli"||params?.upstreamVersion!==zoo.upstream.version||params?.builderVersion!==zoo.zoo.builderVersion||params?.profile!=="browser-full"){
  throw new Error("Brotli provenance identity does not match the reviewed npm canary source");
}
const sbom=await readJson(path.join(input,"sbom.cdx.json"));
if(sbom.bomFormat!=="CycloneDX"||sbom.specVersion!=="1.6") throw new Error("Brotli npm distribution requires CycloneDX 1.6 SBOM");

const buildInfo=await fs.readFile(path.join(input,"BUILDINFO.txt"),"utf8");
for(const marker of [
  `Zoo build version: ${zoo.zoo.builderVersion}`,
  `Brotli version: ${zoo.upstream.version}`,
  `Brotli commit: ${env.BROTLI_COMMIT}`,
  `Emscripten version: ${env.EMSDK_VERSION}`,
  "Source patches: 0",
  "Upstream executable target: brotli"
]){
  if(!buildInfo.includes(marker)) throw new Error("Brotli BUILDINFO missing reviewed marker: "+marker);
}
console.log(`[OK] immutable Brotli ${zoo.release.tag}/${profile.releaseAsset} verified for npm ${npm.status} ${npm.version}`);
