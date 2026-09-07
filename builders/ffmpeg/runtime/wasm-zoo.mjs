// WASM Zoo Consumer API v1 ESM adapter for FFmpeg.
// The legacy browser wrapper remains supported; this module is an additive interface.
export const API_VERSION = 1;

export const packageInfo = Object.freeze({
  apiVersion: API_VERSION,
  package: "ffmpeg",
  name: "FFmpeg",
  kind: "cli",
  tool: "ffmpeg",
  defaultProfile: "browser-full",
  classicScript: "browser-ffmpeg.js",
  requires: Object.freeze(["WebAssembly", "Web Worker", "SharedArrayBuffer", "cross-origin isolation"])
});

let classicPromise = null;

function resolveBaseUrl(value) {
  const url = new URL(value || "./", import.meta.url);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function legacyApi() { return globalThis.WasmZooFFmpeg; }

async function ensureLegacy(baseUrl) {
  if (legacyApi()) return legacyApi();
  if (typeof document === "undefined") throw new Error("FFmpeg Consumer API requires a browser document to load browser-ffmpeg.js.");
  if (!classicPromise) {
    const scriptUrl = new URL(packageInfo.classicScript, baseUrl).href;
    classicPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => legacyApi() ? resolve(legacyApi()) : reject(new Error("browser-ffmpeg.js loaded without exposing WasmZooFFmpeg."));
      script.onerror = () => reject(new Error(`Failed to load FFmpeg legacy runtime: ${scriptUrl}`));
      document.head.append(script);
    }).catch((error) => { classicPromise = null; throw error; });
  }
  return classicPromise;
}

export function isSupported() { return (typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined"); }

function joined(lines) { return lines.length ? lines.join("\n") + "\n" : ""; }

function createRuntime(runner, profile) {
  let disposed = false;
  return Object.freeze({
    apiVersion: API_VERSION,
    package: packageInfo.package,
    kind: packageInfo.kind,
    tool: packageInfo.tool,
    profile,
    async exec(args = [], options = {}) {
      if (disposed) throw new Error("FFmpeg Consumer API runtime has been disposed.");
      if (!Array.isArray(args)) throw new TypeError("args must be an array of CLI arguments.");
      const opts = options || {};
      const stdoutLines = [];
      const stderrLines = [];
      const onLog = typeof opts.onLog === "function" ? opts.onLog : null;
      const onStdout = typeof opts.onStdout === "function" ? opts.onStdout : null;
      const onStderr = typeof opts.onStderr === "function" ? opts.onStderr : null;
      const forwardLog = (event = {}) => {
        const stream = event.stream === "stdout" ? "stdout" : "stderr";
        const message = String(event.message ?? "");
        (stream === "stdout" ? stdoutLines : stderrLines).push(message);
        onLog?.({ stream, message });
        if (stream === "stdout") onStdout?.(message); else onStderr?.(message);
      };
      const { onLog: _oldOnLog, onStdout: _oldStdout, onStderr: _oldStderr, ...legacyOptions } = opts;
      const result = await runner.exec([...args], { ...legacyOptions, onLog: forwardLog });
      return {
        exitCode: Number(result?.exitCode ?? 0),
        stdout: typeof result?.stdout === "string" ? result.stdout : joined(stdoutLines),
        stderr: typeof result?.stderr === "string" ? result.stderr : joined(stderrLines),
        files: Array.isArray(result?.files) ? result.files : []
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof runner.dispose === "function") runner.dispose();
    }
  });
}

export async function load(options = {}) {
  if (!isSupported()) throw new Error("FFmpeg Consumer API is not supported in this browser context. Required: " + packageInfo.requires.join(", ") + ".");
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const legacy = await ensureLegacy(baseUrl);
  const runner = await legacy.loadHosted({
    coreJsUrl: new URL(options.coreJsUrl || "ffmpeg-core.js", baseUrl).href,
    wasmUrl: new URL(options.wasmUrl || "ffmpeg-core.wasm", baseUrl).href
  });
  return createRuntime(runner, options.profile || packageInfo.defaultProfile);
}

export default Object.freeze({ API_VERSION, packageInfo, isSupported, load });
