(function (global) {
  'use strict';
  let loadedScript = null;

  function absolute(url, base) { return new URL(url, base || location.href).href; }
  function loadScript(url) {
    if (global.Vips) return Promise.resolve();
    if (loadedScript) return loadedScript;
    loadedScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load libvips runtime: ${url}`));
      document.head.append(script);
    });
    return loadedScript;
  }

  async function loadHosted(options = {}) {
    if (!global.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('libvips browser profiles require SharedArrayBuffer and cross-origin isolation.');
    }
    const baseUrl = absolute(options.baseUrl || './');
    const jsUrl = absolute(options.jsUrl || 'vips.js', baseUrl);
    const wasmUrl = absolute(options.wasmUrl || 'vips.wasm', baseUrl);
    await loadScript(jsUrl);
    if (typeof global.Vips !== 'function') throw new Error('Vips() was not exposed by vips.js');
    const vips = await global.Vips({
      mainScriptUrlOrBlob: jsUrl,
      locateFile(path) { return path.endsWith('.wasm') ? wasmUrl : absolute(path, baseUrl); },
      print: options.print || (() => {}),
      printErr: options.printErr || ((message) => console.warn(message))
    });
    if (options.blockUntrusted !== false && typeof vips.blockUntrusted === 'function') vips.blockUntrusted(true);
    return vips;
  }

  global.WasmZooLibvips = Object.freeze({ loadHosted });
})(globalThis);
