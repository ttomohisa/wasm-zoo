// Static source-only gates: release safety, Pages staging and Playground contract.
// Actual ZIPs and native/browser interop are independently verified in GitHub Actions.
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(rel)=>fs.readFileSync(path.join(root,rel),"utf8");
const pkg=JSON.parse(read("packages/zstd/package.json"));
const env=read("builders/zstd/versions.env");
const fail=[];
const need=(ok,why)=>{if(!ok)fail.push(why);};
const expected=env.match(/^BUILDER_VERSION=(.+)$/m)?.[1];
need(expected==="0.3.0", "Unexpected Zstandard release preparation builder pin");
need(pkg.status==="available" && pkg.release?.tag==="zstd-v0.3.0" && !pkg.npm &&
  pkg.tracker.candidateMode==="none",
  "Promotion must record only the verified GitHub Release; npm and automatic candidate promotion remain separate gates");
need(pkg.release?.sourceAsset==="zstd-sources-1.5.7-zoo-0.3.0.tar.gz" &&
  pkg.release?.checksumsAsset==="SHA256SUMS.txt" &&
  pkg.profiles.every(p=>p.playground===true && p.playgroundPath==="./zstd-playground/" && p.releaseAsset),
  "Published release/profile metadata must reference the reviewed immutable assets and Playground");
need(pkg.zoo.builderVersion===expected && pkg.profiles.length===2,
  "Both reviewed published Zstandard profiles must be preserved");
for(const entry of ["site/zstd-playground/app.js","scripts/verify-staged-zstd.mjs",
 "builders/zstd/scripts/verify-build-inputs.mjs","builders/zstd/scripts/verify-release-assets.mjs",
 "builders/zstd/scripts/check-repository.mjs","scripts/smoke-zstd-playground.mjs"]) {
 const out=spawnSync(process.execPath,["--check",path.join(root,entry)],{encoding:"utf8"});
 need(out.status===0,"JavaScript syntax check failed for "+entry+": "+out.stderr);
}
const pages=read(".github/workflows/pages.yml");
need(pages.includes("gh release view \"$tag\"") && pages.includes("gh release download \"$tag\"") &&
  pages.includes("sha256sum -c SHA256SUMS.txt") && pages.includes("node scripts/verify-staged-zstd.mjs") &&
  pages.includes('state:"published"') && pages.includes("site/zstd-playground/release-status.json"),
  "Pages must refuse unpublished or checksum-invalid Zstandard binaries");
const rel=read(".github/workflows/release-zstd.yml");
for(const token of ["zstd-v*.*.*","git merge-base --is-ancestor", "needs: build",
 "ZSTD_NATIVE_INTEROP", "prepare-release.sh", "gh release create", "--verify-tag"])
 need(rel.includes(token),"Missing manually tagged release gate: "+token);
need(!rel.includes("workflow_dispatch") && rel.includes("tags:"),
 "No automatic tag/merge/publish workflow should be introduced by this PR");
const build=read(".github/workflows/build-zstd.yml");
need(build.includes("needs: build") && build.includes("prepare-release.sh") &&
 build.includes("experimental-zstd-release-bundle") && !build.includes("gh release create"),
 "PR CI must package and verify both profiles without publishing");
const ui=read("site/zstd-playground/app.js");
for(const token of ["release-status.json", 'state.state==="published"',
 'localhost && state.state==="local-preview"', "manifestFor(profile)", "MAX_BYTES", "URL.createObjectURL",
 "runner.compress", "runner.decompress", "runner.exec", "runner.dispose()"])
 need(ui.includes(token), "Missing release-gated dual-profile local Playground: "+token);
const pending=JSON.parse(read("site/zstd-playground/release-status.json"));
need(pending.state==="not-published" && pending.tag==="zstd-v"+expected,
 "Committed Pages status must be disabled until a reviewed GitHub release exists");
if(fail.length){fail.forEach(s=>console.error("[NG] "+s));process.exit(1);}
console.log("[OK] Zstandard published-release metadata, fail-closed Pages staging, exact-source and safety contracts");
