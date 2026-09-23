import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "../../packages/zstd/package.json"), "utf8"));
const failures = [];
const need = (ok, reason) => { if (!ok) failures.push(reason); };
const env = read("versions.env");
for (const token of [
  "BUILDER_VERSION=0.3.0",
  "EMSDK_VERSION=6.0.7",
  "EMSCRIPTEN_COMMIT=4483d70a78098ed5d860dff2dc21f3025b2da2ee",
  "ZSTD_REF=v1.5.7",
  "ZSTD_COMMIT=f8745da6ff1ad1e7bab384bd1f9d742439278e99"
]) need(env.includes(token), "Missing required exact pin " + token);
need(pkg.status === "available" && (!pkg.npm || (pkg.npm.status === "published" && pkg.npm.package === "@wasm-zoo/zstd" && pkg.npm.profile === "browser-full")) && pkg.release?.tag === "zstd-v0.3.0",
  "Published Zstandard must retain the reviewed zstd-v0.3.0 release and the registered browser-full npm distribution");
need(pkg.release?.sourceAsset === "zstd-sources-1.5.7-zoo-0.3.0.tar.gz" &&
  pkg.release?.checksumsAsset === "SHA256SUMS.txt",
  "Published Zstandard release metadata must retain exact source/checksum assets");
need(pkg.zoo?.sourceBundle === true && pkg.zoo?.checksums === true &&
  pkg.zoo?.supplyChainMetadata === true,
  "Published Zstandard must expose source, checksum, provenance and SBOM metadata");
need(pkg.tracker?.candidateMode === "none", "Automatic upstream candidate promotion remains separately gated after first public release");
need(pkg.upstream?.version === "1.5.7" && pkg.profiles?.length === 2 &&
  pkg.profiles[0]?.id === "browser-core" && pkg.profiles[1]?.id === "browser-full",
  "Must preserve published browser-core and separate upstream browser-full profile");
need(pkg.profiles[1]?.arbitraryCli === true && pkg.profiles[1]?.workerFs === true &&
  pkg.profiles[1]?.sharedArrayBuffer === false, "CLI profile must document original CLI, isolated MEMFS and no SAB");
for (const file of ["runtime/browser-zstd.js", "runtime/browser-zstd-worker.js", "runtime/wasm-zoo.mjs",
  "runtime/browser-zstd-cli.js", "runtime/browser-zstd-cli-worker.js", "runtime/wasm-zoo-cli.mjs", "scripts/smoke-test.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  need(result.status === 0, file + " failed JS syntax check: " + (result.stderr || result.stdout));
}
const fetch = read("scripts/fetch-zstd.sh");
need(fetch.includes("refs/tags/$ZSTD_REF:refs/tags/$ZSTD_REF") &&
  fetch.includes("ZSTD_COMMIT") && fetch.includes("describe --tags --exact-match"),
  "Must fetch and verify upstream tag and exact commit");
const build = read("scripts/build-core.sh");
for (const token of ["emmake make", "libzstd.a", "ZSTD_LEGACY_SUPPORT=0", "ZSTD_NO_ASM=1", "emcc", "zstd-core.wasm",
  "-sUSE_PTHREADS=0", "_zoo_version_number", "LICENSE", "manifest.json", "features.json"]) {
  need(build.includes(token), "Missing core build contract " + token);
}
const c = read("scripts/zstd-wasm.c");
for (const token of ["ZSTD_compress(", "ZSTD_decompress(", "ZSTD_compressBound(", "ZSTD_getFrameContentSize(", "ZSTD_isError(", "ZSTD_versionNumber("]) {
  need(c.includes(token), "Missing real upstream C API operation " + token);
}
const browser = read("tests/smoke-test.html");
for (const token of ["version !== 10507", "zstd.compress(", "zstd.decompress(", "0x28, 0xb5, 0x2f, 0xfd",
  "restored.some", "Invalid Zstandard frame", "SMOKE_TEST_PASS_zstd_1.5.7"]) {
  need(browser.includes(token), "Browser smoke must verify " + token);
}
const worker = read("runtime/browser-zstd-worker.js");
need(worker.includes("MAX_BYTES = 64 * 1024 * 1024") &&
  worker.includes("Zstandard output exceeds") &&
  worker.includes("_zoo_frame_size") && !worker.includes("SharedArrayBuffer"),
  "Bounded one-shot Worker contract changed");
const cliBuild = read("scripts/build-cli.sh");
for (const token of ["libzstd.a", "/src/zstd/programs", "zstdcli.c", "emcc", "-sFORCE_FILESYSTEM=1",
  "-sUSE_PTHREADS=0", "createZstdCli", "zstd-cli.wasm", "ZSTD_LEGACY_SUPPORT=0", "zstd-cli.js.gz"]) {
  need(cliBuild.includes(token), "Missing exact-upstream CLI build contract: " + token);
}
need(!cliBuild.includes("-sUSE_PTHREADS=1"), "Experimental upstream CLI must remain single-threaded");
const docker = read("docker/Dockerfile");
need(docker.includes('PROFILE" = "browser-core"') && docker.includes('PROFILE" = "browser-full"') &&
  docker.includes("build-cli.sh"), "Docker profile dispatch must build both profiles from exact-source checkout");
const cliTest = read("tests/smoke-test-cli.html");
for (const token of ["--version", "1.5.7", "/packed.zst", "/restored.bin", "0x28, 0xb5, 0x2f, 0xfd",
  "native-fixture.zst", "__native-output", "native-restored.bin", "SMOKE_TEST_PASS_zstd_1.5.7_upstream_cli"]) {
  need(cliTest.includes(token), "CLI browser fixture missing a real test: " + token);
}
const harness = read("scripts/smoke-test.mjs");
for (const token of ["browser-full", "ZSTD_NATIVE_INTEROP", "nativeOutput", "native.stdout.equals(originalFixture)"]) {
  need(harness.includes(token), "Native/browser interop gate missing: " + token);
}
const cliWorker = read("runtime/browser-zstd-cli-worker.js");
need(cliWorker.includes("importScripts(coreJsUrl)") && cliWorker.includes("core.callMain(args)") &&
  cliWorker.includes("core.FS.writeFile") && cliWorker.includes("core.FS.readFile") &&
  cliWorker.includes("Collected output exceeds 64 MiB") && !cliWorker.includes("SharedArrayBuffer"),
  "Original CLI must run in fresh bounded MEMFS Worker without cross-origin isolation");

for(const script of ["scripts/verify-build-inputs.mjs","scripts/verify-release-assets.mjs"]) {
 const syntax=spawnSync(process.execPath,["--check",path.join(root,script)],{encoding:"utf8"});
 need(syntax.status===0,"Release verification syntax invalid: "+script);
}
const prep=read("scripts/prepare-release.sh");
for(const token of ["zstd-v", "verify-build-inputs.mjs", "verify-release-assets.mjs", "sha256sum -c",
  "git -C \"$work/zstd-src\" rev-parse HEAD", "source-bundle", "LICENSE-zstd.txt", "browser-core browser-full"]) {
 need(prep.includes(token)||token==="browser-core browser-full"&&prep.includes("for profile in browser-core browser-full"),
  "Missing exact-source release preparation gate: "+token);
}
need(!prep.includes("gh release create")&&!prep.includes("git tag "), "Packaging alone must never publish or tag");

if (failures.length) {
  failures.forEach((reason) => console.error("[NG] " + reason));
  process.exitCode = 1;
} else {
  console.log("[OK] exact-source published Zstandard core + upstream CLI release contracts");
}
