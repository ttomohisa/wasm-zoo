import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "./lib.mjs";

const errors = [];
const need = (condition, message) => { if (!condition) errors.push(message); };

const specs = [
  { slug: "ffmpeg", name: "FFmpeg", kind: "cli", global: "WasmZooFFmpeg", sab: true },
  { slug: "libarchive", name: "libarchive", kind: "cli", global: "WasmZooLibarchive", sab: false },
  { slug: "imagemagick", name: "ImageMagick", kind: "cli", global: "WasmZooImageMagick", sab: false },
  { slug: "libvips", name: "libvips", kind: "library", global: "WasmZooLibvips", sab: true },
  { slug: "ghostscript", name: "Ghostscript", kind: "cli", global: "WasmZooGhostscript", sab: false },
  { slug: "jq", name: "jq", kind: "cli", global: "WasmZooJq", sab: false }
];

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

if (typeof globalThis.Worker === "undefined") defineGlobal("Worker", class MockWorker {});
if (typeof globalThis.SharedArrayBuffer === "undefined") defineGlobal("SharedArrayBuffer", class MockSharedArrayBuffer {});
defineGlobal("crossOriginIsolated", true);

async function loadModule(slug) {
  const file = path.join(root, "builders", slug, "runtime", "wasm-zoo.mjs");
  const url = `${pathToFileURL(file).href}?contract=${Date.now()}-${slug}`;
  return import(url);
}

async function testNormalCli(spec, mod) {
  let disposed = false;
  let loaded = false;
  let hostedOptions = null;
  const runner = {
    async load() { loaded = true; },
    async exec(args, options) {
      need(Array.isArray(args), `${spec.slug}: legacy runner must receive an args array`);
      options.onLog?.({ stream: "stdout", message: `${spec.slug}-stdout` });
      options.onLog?.({ stream: "stderr", message: `${spec.slug}-stderr` });
      if (spec.slug === "jq") return { exitCode: 0, stdout: "jq-direct-out\n", stderr: "jq-direct-err\n", files: [] };
      return { exitCode: 0, files: [{ name: "/out.bin", data: new Uint8Array([1, 2, 3]) }] };
    },
    dispose() { disposed = true; }
  };
  const legacy = {
    loadHosted(options) { hostedOptions = options; return spec.slug === "ffmpeg" ? Promise.resolve(runner) : runner; }
  };
  defineGlobal(spec.global, legacy);
  const stdout = [];
  const stderr = [];
  const runtime = await mod.load({ baseUrl: `https://example.test/${spec.slug}/` });
  const result = await runtime.exec(["--version"], { onStdout: (line) => stdout.push(line), onStderr: (line) => stderr.push(line) });
  need(runtime.apiVersion === 1 && runtime.kind === "cli", `${spec.slug}: loaded runtime must expose CLI Consumer API v1`);
  need(result.exitCode === 0 && Array.isArray(result.files), `${spec.slug}: exec result shape is invalid`);
  if (spec.slug === "jq") {
    need(result.stdout === "jq-direct-out\n" && result.stderr === "jq-direct-err\n", "jq: direct stdout/stderr must be preserved");
  } else {
    need(result.stdout === `${spec.slug}-stdout\n`, `${spec.slug}: stdout normalization failed`);
    need(result.stderr === `${spec.slug}-stderr\n`, `${spec.slug}: stderr normalization failed`);
  }
  need(stdout[0] === `${spec.slug}-stdout` && stderr[0] === `${spec.slug}-stderr`, `${spec.slug}: stream convenience callbacks failed`);
  if (spec.slug === "ffmpeg") {
    need(hostedOptions?.coreJsUrl === "https://example.test/ffmpeg/ffmpeg-core.js", "ffmpeg: core JS URL must resolve from baseUrl");
    need(hostedOptions?.wasmUrl === "https://example.test/ffmpeg/ffmpeg-core.wasm", "ffmpeg: WASM URL must resolve from baseUrl");
  } else {
    need(hostedOptions?.baseUrl === `https://example.test/${spec.slug}/`, `${spec.slug}: baseUrl must be forwarded to the legacy loader`);
    need(loaded, `${spec.slug}: Consumer load() must eagerly initialize the legacy runtime`);
  }
  runtime.dispose();
  need(disposed, `${spec.slug}: dispose() must forward to the legacy runner`);
  let disposedRejected = false;
  try { await runtime.exec([]); } catch { disposedRejected = true; }
  need(disposedRejected, `${spec.slug}: exec() after dispose must reject`);
}

async function testLibarchive(mod) {
  const loadedTools = [];
  let disposed = false;
  const runner = {
    async loadTool(tool) { loadedTools.push(tool); },
    async exec(tool, args, options) {
      options.onLog?.({ stream: "stdout", message: `${tool}:${args.join(" ")}` });
      return { exitCode: 0, files: [] };
    },
    dispose() { disposed = true; }
  };
  defineGlobal("WasmZooLibarchive", { loadHosted: () => runner });
  const runtime = await mod.load({ baseUrl: "https://example.test/libarchive/", tool: "bsdunzip" });
  const result = await runtime.exec(["--version"]);
  need(runtime.tool === "bsdunzip", "libarchive: selected tool must be exposed on the runtime");
  need(loadedTools.join(",") === "bsdunzip", "libarchive: selected tool must load eagerly");
  need(result.stdout === "bsdunzip:--version\n", "libarchive: stdout normalization failed");
  runtime.dispose();
  need(disposed, "libarchive: dispose() must forward to legacy runner");
  let unknownRejected = false;
  try { await mod.load({ tool: "not-a-tool", baseUrl: "https://example.test/libarchive/" }); } catch (error) { unknownRejected = error instanceof RangeError; }
  need(unknownRejected, "libarchive: unknown tools must be rejected before execution");
}

async function testLibvips(mod) {
  const fakeApi = { Image: {}, version: () => "test" };
  let optionsSeen = null;
  defineGlobal("WasmZooLibvips", { async loadHosted(options) { optionsSeen = options; return fakeApi; } });
  const runtime = await mod.load({ baseUrl: "https://example.test/libvips/", profile: "browser-full", blockUntrusted: false });
  need(runtime.kind === "library" && runtime.api === fakeApi, "libvips: runtime.api must expose the reviewed library API");
  need(runtime.profile === "browser-full", "libvips: selected profile must be exposed");
  need(optionsSeen?.baseUrl === "https://example.test/libvips/" && optionsSeen?.blockUntrusted === false, "libvips: loader options must be forwarded");
  runtime.dispose();
  let disposedRejected = false;
  try { void runtime.api; } catch { disposedRejected = true; }
  need(disposedRejected, "libvips: runtime.api must reject access after dispose");
}

for (const spec of specs) {
  try {
    const mod = await loadModule(spec.slug);
    need(mod.API_VERSION === 1, `${spec.slug}: API_VERSION must be 1`);
    need(typeof mod.load === "function", `${spec.slug}: load export is missing`);
    need(typeof mod.isSupported === "function", `${spec.slug}: isSupported export is missing`);
    need(mod.packageInfo?.package === spec.slug, `${spec.slug}: packageInfo.package mismatch`);
    need(mod.packageInfo?.kind === spec.kind, `${spec.slug}: packageInfo.kind mismatch`);
    need(mod.isSupported() === true, `${spec.slug}: capability check must pass in the contract-test environment`);
    if (spec.slug === "libarchive") await testLibarchive(mod);
    else if (spec.slug === "libvips") await testLibvips(mod);
    else await testNormalCli(spec, mod);
  } catch (error) {
    errors.push(`${spec.slug}: ${error?.stack || error}`);
  } finally {
    try { delete globalThis[spec.global]; } catch {}
  }
}

try {
  const pages = await fs.readFile(path.join(root, ".github", "workflows", "pages.yml"), "utf8");
  for (const spec of specs) {
    need(pages.includes(`builders/${spec.slug}/runtime/wasm-zoo.mjs`), `${spec.slug}: Pages workflow must watch/stage wasm-zoo.mjs`);
    const release = await fs.readFile(path.join(root, "builders", spec.slug, "scripts", "prepare-release.sh"), "utf8");
    need(release.includes("wasm-zoo.mjs"), `${spec.slug}: future release ZIP preparation must include wasm-zoo.mjs`);
    const smokeHtml = await fs.readFile(path.join(root, "builders", spec.slug, "tests", "smoke-test.html"), "utf8");
    need(smokeHtml.includes('from "./wasm-zoo.mjs"'), `${spec.slug}: real browser smoke test must import Consumer API ESM`);
    const smokeRunner = await fs.readFile(path.join(root, "builders", spec.slug, "scripts", "smoke-test.mjs"), "utf8");
    need(smokeRunner.includes('"runtime", "wasm-zoo.mjs"'), `${spec.slug}: smoke harness must stage wasm-zoo.mjs`);
    need(smokeRunner.includes('.mjs') && smokeRunner.includes('text/javascript'), `${spec.slug}: smoke HTTP server must serve ESM with a JavaScript MIME type`);
  }
  const doc = await fs.readFile(path.join(root, "docs", "CONSUMER_API.md"), "utf8");
  need(doc.includes("Consumer API v1") && doc.includes("existing release ZIPs are never rewritten"), "Consumer API documentation must describe v1 and immutable release rollout");
} catch (error) {
  errors.push(`distribution contract: ${error?.stack || error}`);
}

if (errors.length) {
  console.error(`[NG] ${errors.length} Consumer API contract check(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log("[OK] WASM Zoo Consumer API v1 contract checks passed for all published browser packages");
