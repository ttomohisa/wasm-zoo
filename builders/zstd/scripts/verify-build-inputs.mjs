import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const get = (p) => JSON.parse(fs.readFileSync(path.join(root,p), "utf8"));
const env = Object.fromEntries(fs.readFileSync(path.join(root,"versions.env"),"utf8")
  .split(/\r?\n/).filter(s=>/^[A-Z_]+=/.test(s)).map(s=>{const i=s.indexOf("=");return [s.slice(0,i),s.slice(i+1)];}));
const requiredVersion = env.ZSTD_REF?.replace(/^v/,"");
for(const profile of ["browser-core","browser-full"]){
  const base=path.join(root,"dist",profile);
  const manifest=get(path.join("dist",profile,"manifest.json"));
  const features=get(path.join("dist",profile,"features.json"));
  if(manifest.package!=="zstd"||manifest.profile!==profile ||
     manifest.upstream?.version!==requiredVersion || manifest.upstream?.ref!==env.ZSTD_REF ||
     manifest.upstream?.commit!==env.ZSTD_COMMIT || manifest.build?.builderVersion!==env.BUILDER_VERSION ||
     features.profile!==profile) throw new Error("Unreviewed version/commit/profile in "+profile);
  const expected = profile==="browser-core" ? "zstd-core" : "zstd-cli";
  for(const n of [expected+".js",expected+".wasm",expected+".js.gz",expected+".wasm.gz"]){
    const bytes=fs.readFileSync(path.join(base,n));
    if(!bytes.length || bytes.length!==manifest.files?.[n]?.bytes ||
       crypto.createHash("sha256").update(bytes).digest("hex")!==manifest.files[n].sha256)
      throw new Error("Artifact hash disagrees with manifest: "+profile+"/"+n);
  }
  const prov=get(path.join("dist",profile,"provenance.json"));
  const sbom=get(path.join("dist",profile,"sbom.cdx.json"));
  const files=new Map(prov.subject?.map(s=>[s.name,s.digest?.sha256])||[]);
  for(const n of [expected+".js",expected+".wasm"]){
    if(files.get(n)!==manifest.files[n].sha256)throw new Error("Provenance digest disagreement "+profile+"/"+n);
  }
  if(prov.predicateType!=="https://slsa.dev/provenance/v1" ||
     prov.predicate?.buildDefinition?.externalParameters?.profile!==profile ||
     sbom.specVersion!=="1.6" ||
     sbom.metadata?.component?.version!==requiredVersion)
    throw new Error("Profile supply-chain metadata mismatch: "+profile);
  console.log("[OK] strict review-locked Zstandard build and supply-chain inputs "+profile);
}
