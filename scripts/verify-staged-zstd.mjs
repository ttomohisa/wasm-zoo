// A Pages build must not serve a tag's binary unless both published ZIP
// contents match reviewed exact version/commit and all packed WASM digests.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {root,readEnv} from "./lib.mjs";
const env=await readEnv(path.join(root,"builders/zstd/versions.env"));
const pinned=env.ZSTD_REF.replace(/^v/,"");
for(const profile of ["browser-core","browser-full"]){
 const dir=path.join(root,"site/assets/zstd",pinned,profile);
 const mf=JSON.parse(await fs.readFile(path.join(dir,"manifest.json"),"utf8"));
 const features=JSON.parse(await fs.readFile(path.join(dir,"features.json"),"utf8"));
 if(mf.package!=="zstd"||mf.profile!==profile||mf.upstream?.version!==pinned||
    mf.upstream?.ref!==env.ZSTD_REF||mf.upstream?.commit!==env.ZSTD_COMMIT||
    mf.build?.builderVersion!==env.BUILDER_VERSION||features.profile!==profile)
   throw new Error("Pages is refusing a mismatched official Zstandard binary profile: "+profile);
 const base=profile==="browser-core"?"zstd-core":"zstd-cli";
 for(const name of [base+".js",base+".wasm"]){
  const data=await fs.readFile(path.join(dir,name));
  const hash=crypto.createHash("sha256").update(data).digest("hex");
  if(!data.length || data.length!==mf.files?.[name]?.bytes||hash!==mf.files?.[name]?.sha256)
   throw new Error("Refusing published file with mismatched pinned manifest: "+profile+"/"+name);
 }
 for(const name of profile==="browser-core"
   ? ["browser-zstd.js","browser-zstd-worker.js","wasm-zoo.mjs"]
   : ["browser-zstd-cli.js","browser-zstd-cli-worker.js","wasm-zoo-cli.mjs"])
  if(!(await fs.stat(path.join(dir,name))).size)throw new Error("Missing published runner "+profile+"/"+name);
 console.log("[OK] Published Zstandard "+profile+" exact source and immutable binary hashes");
}
