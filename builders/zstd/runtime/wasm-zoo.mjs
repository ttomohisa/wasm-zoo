// Unpublished experimental library API: no public npm package is implied.
export const API_VERSION = 1;
export const packageInfo = Object.freeze({
  apiVersion: API_VERSION, package: "zstd", name: "Zstandard",
  kind: "library", defaultProfile: "browser-core",
  requires: Object.freeze(["WebAssembly", "Web Worker"])
});
let scriptPromise = null;
export function isSupported() {
  return typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";
}
export async function load(options = {}) {
  if (!isSupported()) throw new Error("Zstandard requires WebAssembly and Web Worker support");
  const baseUrl = new URL(options.baseUrl || "./", import.meta.url);
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  if (!globalThis.WasmZooZstd) {
    if (typeof document === "undefined") throw new Error("The experimental runtime currently requires a browser document");
    if (!scriptPromise) {
      scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("browser-zstd.js", baseUrl).href;
        script.onload = () => globalThis.WasmZooZstd ? resolve() : reject(new Error("Runtime did not expose WasmZooZstd"));
        script.onerror = () => reject(new Error("Unable to load browser-zstd.js"));
        document.head.append(script);
      }).catch((error) => { scriptPromise = null; throw error; });
    }
    await scriptPromise;
  }
  const runner = globalThis.WasmZooZstd.loadHosted({
    baseUrl: baseUrl.href,
    coreJsUrl: options.coreJsUrl ? new URL(options.coreJsUrl, baseUrl).href : undefined,
    wasmUrl: options.wasmUrl ? new URL(options.wasmUrl, baseUrl).href : undefined,
    workerUrl: options.workerUrl ? new URL(options.workerUrl, baseUrl).href : undefined
  });
  await runner.load();
  return Object.freeze({
    apiVersion: API_VERSION, package: "zstd", kind: "library", profile: "browser-core",
    version: () => runner.version(),
    compress: (data, opts) => runner.compress(data, opts),
    decompress: (data, opts) => runner.decompress(data, opts),
    dispose: () => runner.dispose()
  });
}
export default Object.freeze({ API_VERSION, packageInfo, isSupported, load });
