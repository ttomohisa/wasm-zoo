// WASM Zoo Consumer API v1 ESM adapter for libarchive.
// Bind one libarchive CLI tool at load time so exec(args, options) is common across CLI packages.
export const API_VERSION = 1;
export const TOOLS = Object.freeze(["bsdtar", "bsdcpio", "bsdcat", "bsdunzip"]);
export const packageInfo = Object.freeze({
  apiVersion: API_VERSION, package: "libarchive", name: "libarchive", kind: "cli",
  defaultProfile: "browser-full", defaultTool: "bsdtar", tools: TOOLS,
  classicScript: "browser-libarchive.js", requires: Object.freeze(["WebAssembly", "Web Worker"])
});
let classicPromise = null;
function resolveBaseUrl(value) { const url = new URL(value || "./", import.meta.url); if (!url.pathname.endsWith("/")) url.pathname += "/"; return url; }
function legacyApi() { return globalThis.WasmZooLibarchive; }
async function ensureLegacy(baseUrl) {
  if (legacyApi()) return legacyApi();
  if (typeof document === "undefined") throw new Error("libarchive Consumer API requires a browser document to load browser-libarchive.js.");
  if (!classicPromise) {
    const scriptUrl = new URL(packageInfo.classicScript, baseUrl).href;
    classicPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = scriptUrl; script.async = true;
      script.onload = () => legacyApi() ? resolve(legacyApi()) : reject(new Error("browser-libarchive.js loaded without exposing WasmZooLibarchive."));
      script.onerror = () => reject(new Error(`Failed to load libarchive legacy runtime: ${scriptUrl}`));
      document.head.append(script);
    }).catch((error) => { classicPromise = null; throw error; });
  }
  return classicPromise;
}
export function isSupported() { return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined"; }
function joined(lines) { return lines.length ? lines.join("\n") + "\n" : ""; }
function createRuntime(runner, tool, profile) {
  let disposed = false;
  return Object.freeze({
    apiVersion: API_VERSION, package: packageInfo.package, kind: packageInfo.kind, tool, profile,
    async exec(args = [], options = {}) {
      if (disposed) throw new Error("libarchive Consumer API runtime has been disposed.");
      if (!Array.isArray(args)) throw new TypeError("args must be an array of CLI arguments.");
      const opts = options || {}; const stdoutLines = []; const stderrLines = [];
      const onLog = typeof opts.onLog === "function" ? opts.onLog : null;
      const onStdout = typeof opts.onStdout === "function" ? opts.onStdout : null;
      const onStderr = typeof opts.onStderr === "function" ? opts.onStderr : null;
      const forwardLog = (event = {}) => {
        const stream = event.stream === "stdout" ? "stdout" : "stderr"; const message = String(event.message ?? "");
        (stream === "stdout" ? stdoutLines : stderrLines).push(message); onLog?.({ stream, message });
        if (stream === "stdout") onStdout?.(message); else onStderr?.(message);
      };
      const { onLog: _a, onStdout: _b, onStderr: _c, ...legacyOptions } = opts;
      const result = await runner.exec(tool, [...args], { ...legacyOptions, onLog: forwardLog });
      return { exitCode: Number(result?.exitCode ?? 0), stdout: typeof result?.stdout === "string" ? result.stdout : joined(stdoutLines), stderr: typeof result?.stderr === "string" ? result.stderr : joined(stderrLines), files: Array.isArray(result?.files) ? result.files : [] };
    },
    dispose() { if (disposed) return; disposed = true; if (typeof runner.dispose === "function") runner.dispose(); }
  });
}
export async function load(options = {}) {
  if (!isSupported()) throw new Error("libarchive Consumer API requires WebAssembly and Web Worker support.");
  const tool = options.tool || packageInfo.defaultTool;
  if (!TOOLS.includes(tool)) throw new RangeError(`Unknown libarchive tool: ${tool}. Expected one of: ${TOOLS.join(", ")}.`);
  const baseUrl = resolveBaseUrl(options.baseUrl); const legacy = await ensureLegacy(baseUrl);
  const runner = legacy.loadHosted({ baseUrl: baseUrl.href, toolAssets: options.toolAssets }); await runner.loadTool(tool);
  return createRuntime(runner, tool, options.profile || packageInfo.defaultProfile);
}
export default Object.freeze({ API_VERSION, TOOLS, packageInfo, isSupported, load });
