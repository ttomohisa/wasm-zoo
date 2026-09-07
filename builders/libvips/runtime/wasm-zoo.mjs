// WASM Zoo Consumer API v1 ESM adapter for libvips.
// libvips is a library package: runtime.api exposes the existing wasm-vips Embind API.
export const API_VERSION = 1;
export const packageInfo = Object.freeze({
  apiVersion: API_VERSION, package: "libvips", name: "libvips", kind: "library",
  defaultProfile: "browser-core", profiles: Object.freeze(["browser-core", "browser-full"]),
  classicScript: "browser-libvips.js",
  requires: Object.freeze(["WebAssembly", "Web Worker", "SharedArrayBuffer", "cross-origin isolation"])
});
let classicPromise = null;
function resolveBaseUrl(value) { const url = new URL(value || "./", import.meta.url); if (!url.pathname.endsWith("/")) url.pathname += "/"; return url; }
function legacyApi() { return globalThis.WasmZooLibvips; }
async function ensureLegacy(baseUrl) {
  if (legacyApi()) return legacyApi();
  if (typeof document === "undefined") throw new Error("libvips Consumer API requires a browser document to load browser-libvips.js.");
  if (!classicPromise) {
    const scriptUrl = new URL(packageInfo.classicScript, baseUrl).href;
    classicPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = scriptUrl; script.async = true;
      script.onload = () => legacyApi() ? resolve(legacyApi()) : reject(new Error("browser-libvips.js loaded without exposing WasmZooLibvips."));
      script.onerror = () => reject(new Error(`Failed to load libvips legacy runtime: ${scriptUrl}`));
      document.head.append(script);
    }).catch((error) => { classicPromise = null; throw error; });
  }
  return classicPromise;
}
export function isSupported() { return typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== "undefined"; }
export async function load(options = {}) {
  if (!isSupported()) throw new Error("libvips Consumer API requires WebAssembly, Web Workers, SharedArrayBuffer and cross-origin isolation.");
  const profile = options.profile || packageInfo.defaultProfile;
  if (!packageInfo.profiles.includes(profile)) throw new RangeError(`Unknown libvips profile: ${profile}.`);
  const baseUrl = resolveBaseUrl(options.baseUrl); const legacy = await ensureLegacy(baseUrl);
  let api = await legacy.loadHosted({
    baseUrl: baseUrl.href,
    jsUrl: options.jsUrl ? new URL(options.jsUrl, baseUrl).href : undefined,
    wasmUrl: options.wasmUrl ? new URL(options.wasmUrl, baseUrl).href : undefined,
    print: options.print, printErr: options.printErr, blockUntrusted: options.blockUntrusted
  });
  let disposed = false;
  return Object.freeze({
    apiVersion: API_VERSION, package: packageInfo.package, kind: packageInfo.kind, profile,
    get api() { if (disposed || !api) throw new Error("libvips Consumer API runtime has been disposed."); return api; },
    dispose() { disposed = true; api = null; }
  });
}
export default Object.freeze({ API_VERSION, packageInfo, isSupported, load });
