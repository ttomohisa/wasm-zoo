import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const env=Object.fromEntries(fs.readFileSync(path.join(root,"versions.env"),"utf8")
 .split(/\r?\n/).filter(s=>/^[A-Z_]+=/.test(s)).map(s=>{const i=s.indexOf("=");return[s.slice(0,i),s.slice(i+1)];}));
const dir=path.join(root,"release");
const names=fs.readdirSync(dir).filter(x=>fs.statSync(path.join(dir,x)).isFile()).sort();
const required = ["browser-core","browser-full"].flatMap(profile=>[
  `zstd-${profile}-${env.ZSTD_REF.slice(1)}-zoo-${env.BUILDER_VERSION}.zip`,
  `provenance-${profile}.json`,`sbom-${profile}.cdx.json`,`BUILDINFO-${profile}.txt`
]).concat([`zstd-sources-${env.ZSTD_REF.slice(1)}-zoo-${env.BUILDER_VERSION}.tar.gz`,"SHA256SUMS.txt"]).sort();
if(JSON.stringify(names)!==JSON.stringify(required))throw new Error("Release asset list differs from reviewed contract");
const recorded=new Map(fs.readFileSync(path.join(dir,"SHA256SUMS.txt"),"utf8").trim().split("\n").map(line=>{
 const match=line.match(/^([a-f0-9]{64})\s{2}(.+)$/); if(!match)throw new Error("Bad checksum line: "+line);return [match[2],match[1]];
}));
for(const n of names.filter(n=>n!=="SHA256SUMS.txt")){
 const hash=crypto.createHash("sha256").update(fs.readFileSync(path.join(dir,n))).digest("hex");
 if(recorded.get(n)!==hash)throw new Error("Release asset checksum mismatch: "+n);
}
if(recorded.size!==names.length-1)throw new Error("Unexpected checksum entry");
for(const profile of ["browser-core","browser-full"]){
 const zip=path.join(dir,`zstd-${profile}-${env.ZSTD_REF.slice(1)}-zoo-${env.BUILDER_VERSION}.zip`);
 const inspect=cp.spawnSync("unzip",["-Z","-1",zip],{encoding:"utf8"});
 if(inspect.status!==0)throw new Error("Cannot inspect "+zip+": "+inspect.stderr);
 const entries=inspect.stdout.trim().split(/\r?\n/).sort();
 const stem=profile==="browser-core"?"zstd-core":"zstd-cli";
 const runtime=profile==="browser-core"
  ? ["browser-zstd.js","browser-zstd-worker.js","wasm-zoo.mjs"]
  : ["browser-zstd-cli.js","browser-zstd-cli-worker.js","wasm-zoo-cli.mjs"];
 const wanted=[stem+".js",stem+".wasm",stem+".js.gz",stem+".wasm.gz",
  ...runtime,"manifest.json","features.json","provenance.json","sbom.cdx.json",
  "BUILDINFO.txt","LICENSE-zstd.txt"].sort();
 if(JSON.stringify(entries)!==JSON.stringify(wanted))throw new Error("Unexpected ZIP entries for "+profile+": "+entries);
 const mf=cp.spawnSync("unzip",["-p",zip,"manifest.json"],{encoding:"utf8"});
 const manifest=JSON.parse(mf.stdout);
 if(manifest.upstream?.commit!==env.ZSTD_COMMIT||manifest.build?.builderVersion!==env.BUILDER_VERSION ||
    manifest.profile!==profile)throw new Error("Packaged manifest ref/profile mismatch "+profile);
}
const source=path.join(dir,`zstd-sources-${env.ZSTD_REF.slice(1)}-zoo-${env.BUILDER_VERSION}.tar.gz`);
const contents=cp.spawnSync("tar",["-tzf",source],{encoding:"utf8",maxBuffer:8*1024*1024});
if(contents.status!==0 || !contents.stdout.includes(`source-bundle/zstd-${env.ZSTD_REF.slice(1)}/LICENSE`) ||
 !contents.stdout.includes("source-bundle/wasm-zoo-builder/scripts/prepare-release.sh"))
 throw new Error("Corresponding upstream source and full Zoo build recipe are not archived");
console.log("[OK] complete Zstandard release assets / exact source / both binary profiles / SHA256SUMS");
