// Assert the actual reviewed immutable-release zstd browser-full bytes before npm overlay.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { root, readJson } from "./lib.mjs";
const index=process.argv.indexOf("--input");
if(index<0||!process.argv[index+1])throw new Error("Usage: node scripts/verify-npm-zstd-release.mjs --input <extracted-release>");
const input=path.resolve(process.argv[index+1]),pkg=await readJson(path.join(root,"packages/zstd/package.json"));
const published = pkg.npm?.publishedSource;
if(pkg.status!=="available"||published?.releaseTag!=="zstd-v0.3.0"||
   published?.upstreamVersion!=="1.5.7"||published?.builderVersion!=="0.3.0"||
   published?.registryShasum!=="29add1aaf6ab0c3e9a3d538166a51a3f70cefa99"||
   pkg.npm?.profile!=="browser-full"||pkg.npm?.status!=="published"||
   pkg.npm?.version!=="0.3.0")throw new Error("Refusing Zstandard npm input outside the independently reviewed published v0.3.0 source");
const manifest=await readJson(path.join(input,"manifest.json"));
const features=await readJson(path.join(input,"features.json"));
const provenance=await readJson(path.join(input,"provenance.json"));
const sbom=await readJson(path.join(input,"sbom.cdx.json"));
if(manifest.package!=="zstd"||manifest.profile!=="browser-full"||
 manifest.upstream?.ref!==published.upstreamRef||manifest.upstream?.version!==published.upstreamVersion||
 manifest.upstream?.commit!==published.upstreamCommit||
 manifest.build?.builderVersion!==published.builderVersion||
 features.profile!=="browser-full"||
 provenance._type!=="https://in-toto.io/Statement/v1"||
 provenance.predicateType!=="https://slsa.dev/provenance/v1"||
 sbom.bomFormat!=="CycloneDX"||sbom.specVersion!=="1.6"||
 sbom.metadata?.component?.version!==published.upstreamVersion
)throw new Error("Zstandard release does not match the exact reviewed source/build/supply-chain contract");
const subject=new Map((provenance.subject||[]).map(item=>[item.name,item.digest?.sha256]));
for(const n of ["zstd-cli.js","zstd-cli.wasm"]){
 const data=await fs.readFile(path.join(input,n));
 const sha=crypto.createHash("sha256").update(data).digest("hex");
 if(!data.length||manifest.files?.[n]?.bytes!==data.length||
    manifest.files?.[n]?.sha256!==sha||subject.get(n)!==sha)
  throw new Error("Cannot use an unverified published Zstandard CLI binary: "+n);
}
for(const n of pkg.npm.packageFiles.required){
 const f=await fs.stat(path.join(input,n)).catch(()=>null);
 if(!f?.isFile()||!f.size)throw new Error("Missing reviewed release input: "+n);
}
console.log("[OK] immutable Zstandard GitHub Release exact upstream, actual JS/WASM SHA-256, SLSA provenance and SBOM; packaging does not publish npm");
