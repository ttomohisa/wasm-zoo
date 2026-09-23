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
  "BUILDER_VERSION=0.1.0",
  "EMSDK_VERSION=6.0.7",
  "EMSCRIPTEN_COMMIT=4483d70a78098ed5d860dff2dc21f3025b2da2ee",
  "ZSTD_REF=v1.5.7",
  "ZSTD_COMMIT=f8745da6ff1ad1e7bab384bd1f9d742439278e99"
]) need(env.includes(token), "Missing required exact pin " + token);
need(pkg.status === "experimental" && !pkg.npm && !pkg.release,
  "A CI-only Zstandard canary must never pretend to be a published package");
need(pkg.tracker?.candidateMode === "none", "Automation must be disabled until the canary is proven");
need(pkg.upstream?.version === "1.5.7" && pkg.profiles?.[0]?.id === "browser-core", "Wrong canary package/profile");
for (const file of ["runtime/browser-zstd.js", "runtime/browser-zstd-worker.js", "runtime/wasm-zoo.mjs", "scripts/smoke-test.mjs"]) {
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
if (failures.length) {
  failures.forEach((reason) => console.error("[NG] " + reason));
  process.exitCode = 1;
} else {
  console.log("[OK] exact-source experimental Zstandard builder and real browser smoke contracts");
}
