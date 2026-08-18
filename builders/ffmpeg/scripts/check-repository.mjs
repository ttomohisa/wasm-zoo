import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const must = async (rel, includes = []) => {
  const file = path.join(root, rel);
  try {
    const text = await fs.readFile(file, "utf8");
    for (const needle of includes) if (!text.includes(needle)) errors.push(`${rel}: missing ${needle}`);
  } catch { errors.push(`${rel}: missing file`); }
};

for (const profile of ["browser-full", "browser-full-gpl"]) {
  await must(`profiles/${profile}/profile.env`, ["PROFILE_REQUIRED_CONFIG"]);
  await must(`profiles/${profile}/ffmpeg.flags`);
}
await must("scripts/build-full.sh", ["ffmpeg_g.js", "createFFmpegCore", "-msimd128", "--enable-pthreads", "features.json"]);
const fullBuild = await fs.readFile(path.join(root, "scripts/build-full.sh"), "utf8");
if (fullBuild.includes("-sINITIAL_HEAP=")) errors.push("pthread/shared-memory build must not use INITIAL_HEAP; Emscripten rejects it with imported memory");
if (!fullBuild.includes("-sINITIAL_MEMORY=268435456")) errors.push("full build must set a deterministic INITIAL_MEMORY for pthread/shared memory");
if (!fullBuild.includes('PTHREAD_POOL_SIZE="${PTHREAD_POOL_SIZE:-32}"')) errors.push("generic FFmpeg full builds need a larger default pthread pool for decoder/filter/scheduler workloads");
if (!fullBuild.includes("-sPTHREAD_POOL_SIZE_STRICT=2")) errors.push("pthread pool exhaustion must fail instead of silently deadlocking");

if (fullBuild.includes("ffmpeg_g.worker.js") || fullBuild.includes("ffmpeg-core.worker.js")) errors.push("modern Emscripten pthread builds must not require a separate .worker.js artifact");
await must("runtime/browser-ffmpeg.js", ["WasmZooFFmpeg", "callMain", "SharedArrayBuffer", "mainScriptUrlOrBlob"]);
const runtimeText = await fs.readFile(path.join(root, "runtime/browser-ffmpeg.js"), "utf8");
if (runtimeText.includes("workerUrl") || runtimeText.includes("pthreadWorkerUrl")) errors.push("runtime must not depend on the removed separate Emscripten pthread worker artifact");
const smokeScript = await fs.readFile(path.join(root, "scripts/smoke-test.mjs"), "utf8");
for (const needle of ["taskkill", "maxRetries", "retryDelay", "removeTempBestEffort"]) {
  if (!smokeScript.includes(needle)) errors.push(`smoke test cleanup missing ${needle}`);
}
if (!smokeScript.includes("[WARN] Could not remove temporary browser profile:")) errors.push("temporary browser profile cleanup must be best-effort after a passed smoke test");
await must("tests/smoke-test.html", ["browser-full-gpl", "libx264", "-frames:v", "SMOKE_TEST_RUNNING_"]);

const smokeHtml = await fs.readFile(path.join(root, "tests/smoke-test.html"), "utf8");
if (smokeHtml.includes('await runner.exec(["-hide_banner", "-version"]')) errors.push("smoke test must not instantiate the full WASM core just to run -version");
if (!smokeScript.includes('profile === "browser-full-gpl" ? 300000 : 180000')) errors.push("GPL smoke test must have a longer timeout budget than the stream-copy baseline");
if (!smokeScript.includes("Last page status:")) errors.push("smoke timeout diagnostics must include the last in-page progress status");
for (const needle of ['"-threads:v","1","-i"', '"-filter_threads","1"', '"-filter_complex_threads","1"']) {
  if (!smokeHtml.includes(needle)) errors.push(`GPL smoke test must cap FFmpeg auto-threading: missing ${needle}`);
}

const smokeBat = await fs.readFile(path.join(root, "smoke-test.bat"), "utf8");
if (!smokeBat.includes('set "SCRIPT_DIR=%~dp0"')) errors.push("Windows smoke launcher must capture %~dp0 before changing directories");
if (!smokeBat.includes('node "%SCRIPT_DIR%scripts\\smoke-test.mjs"')) errors.push("Windows smoke launcher must invoke Node through the captured SCRIPT_DIR");
if (smokeBat.includes('node "%~dp0scripts\\smoke-test.mjs"')) errors.push("Windows smoke launcher must not re-expand %~dp0 after cd/call path changes");

await must("docker/Dockerfile", ["export-no-x264", "export-with-x264"]);

const forbidden = ["video-compressor", "lossless-video-cutter", "runners/"];
for (const rel of ["build.sh", "docker/Dockerfile", "scripts/build-full.sh", "runtime/browser-ffmpeg.js"]) {
  const text = await fs.readFile(path.join(root, rel), "utf8");
  for (const needle of forbidden) if (text.includes(needle)) errors.push(`${rel}: app-specific artifact leaked into Zoo builder: ${needle}`);
}

const fullFlags = await fs.readFile(path.join(root, "profiles/browser-full/ffmpeg.flags"), "utf8");
if (fullFlags.split(/\r?\n/).some((line) => line.trim() === "--disable-everything")) errors.push("browser-full must not use --disable-everything");
const gplFlags = await fs.readFile(path.join(root, "profiles/browser-full-gpl/ffmpeg.flags"), "utf8");
for (const flag of ["--enable-gpl", "--enable-libx264"]) if (!gplFlags.includes(flag)) errors.push(`browser-full-gpl missing ${flag}`);

if (errors.length) {
  console.error(`[NG] ${errors.length} FFmpeg builder check(s) failed`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log("[OK] FFmpeg generic full-build repository checks passed");
