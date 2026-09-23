// Experimental Zstandard upstream-CLI consumer adapter. Not yet published to npm.
export const API_VERSION = 1;
export const packageInfo = Object.freeze({
  apiVersion: API_VERSION, package: "zstd", name: "Zstandard",
  kind: "cli", tool: "zstd", defaultProfile: "browser-full",
  classicScript: "browser-zstd-cli.js",
  requires: Object.freeze(["WebAssembly", "Web Worker"])
});
let loading = null;
export function isSupported() {
  return typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";
}
export async function load(options = {}) {
  if (!isSupported()) throw new Error("Zstandard CLI requires WebAssembly and Web Workers");
  if (typeof document === "undefined") throw new Error("Browser document required to load CLI adapter");
  const baseUrl = new URL(options.baseUrl || "./", import.meta.url);
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  if (!globalThis.WasmZooZstdCli) {
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = new URL("browser-zstd-cli.js", baseUrl).href;
        script.async = true;
        script.onload = () => globalThis.WasmZooZstdCli ? resolve() : reject(new Error("CLI adapter not exposed"));
        script.onerror = () => reject(new Error("Unable to load CLI adapter script"));
        document.head.append(script);
      }).catch((error) => { loading = null; throw error; });
    }
    await loading;
  }
  const runner = globalThis.WasmZooZstdCli.loadHosted({
    baseUrl: baseUrl.href,
    coreJsUrl: options.coreJsUrl && new URL(options.coreJsUrl, baseUrl).href,
    wasmUrl: options.wasmUrl && new URL(options.wasmUrl, baseUrl).href,
    workerUrl: options.workerUrl && new URL(options.workerUrl, baseUrl).href
  });
  await runner.load();
  return Object.freeze({
    apiVersion: API_VERSION, package: "zstd", kind: "cli", tool: "zstd", profile: "browser-full",
    exec: (args, opts) => runner.exec(args, opts),
    dispose: () => runner.dispose()
  });
}
export default Object.freeze({ API_VERSION, packageInfo, isSupported, load });
