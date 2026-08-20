/* WASM Zoo Ghostscript browser runtime. Upstream gs CLI wrapper. */
(() => {
  "use strict";
  const TOOL = "gs";
  const WORKER_SOURCE = String.raw`
    "use strict";
    let fatalPosted = false;
    const postFatal = (error, fallback = "Ghostscript worker failed.", files = []) => {
      if (fatalPosted) return;
      fatalPosted = true;
      const transfer = files.map((file) => file.data);
      self.postMessage({ type: "error", name: error?.name || "Error", message: error?.message || String(error || fallback), stack: error?.stack || "", files }, transfer);
    };
    self.addEventListener("error", (event) => {
      postFatal(event.error, event.message || "Ghostscript worker failed to initialize.");
      event.preventDefault();
    });
    self.addEventListener("unhandledrejection", (event) => {
      postFatal(event.reason, "Ghostscript worker promise rejected unexpectedly.");
      event.preventDefault();
    });
    const ensureParent = (FS, path) => {
      const index = path.lastIndexOf("/");
      if (index <= 0) return;
      try { FS.mkdirTree(path.slice(0, index)); } catch (_) {}
    };
    const walkFiles = (FS, root) => {
      const out = [];
      const walk = (dir) => {
        let names;
        try { names = FS.readdir(dir); } catch (_) { return; }
        for (const name of names) {
          if (name === "." || name === "..") continue;
          const full = dir === "/" ? "/" + name : dir.replace(/\/$/, "") + "/" + name;
          let stat;
          try { stat = FS.stat(full); } catch (_) { continue; }
          if (FS.isDir(stat.mode)) walk(full);
          else if (FS.isFile(stat.mode)) out.push(full);
        }
      };
      walk(root);
      return out;
    };
    self.onmessage = async (event) => {
      const { coreJsUrl, wasmBytes, args, files, outputs, collectDirs, dirs } = event.data;
      const recentLogs = [];
      const sendLog = (stream, message) => {
        const text = String(message);
        recentLogs.push(stream + ": " + text);
        if (recentLogs.length > 80) recentLogs.shift();
        self.postMessage({ type: "log", stream, message: text });
      };
      let core = null;
      const collectRequestedFiles = () => {
        if (!core) return [];
        const names = new Set(outputs);
        for (const dir of collectDirs) for (const name of walkFiles(core.FS, dir)) names.add(name);
        const resultFiles = [];
        for (const name of names) {
          try {
            const bytes = core.FS.readFile(name);
            const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            resultFiles.push({ name, data: copy });
          } catch (_) {}
        }
        return resultFiles;
      };
      try {
        importScripts(coreJsUrl);
        if (typeof createGhostscriptCore !== "function") throw new Error("createGhostscriptCore factory was not found.");
        core = await createGhostscriptCore({
          wasmBinary: new Uint8Array(wasmBytes),
          print: (message) => sendLog("stdout", message),
          printErr: (message) => sendLog("stderr", message)
        });
        for (const dir of dirs) { try { core.FS.mkdirTree(dir); } catch (_) {} }
        for (const file of files) {
          ensureParent(core.FS, file.name);
          core.FS.writeFile(file.name, new Uint8Array(file.data));
        }
        let exitCode = 0;
        try {
          const value = core.callMain(args);
          if (typeof value === "number") exitCode = value;
        } catch (error) {
          if (typeof error?.status === "number") exitCode = error.status;
          else throw error;
        }
        if (exitCode !== 0) {
          const detail = recentLogs.length ? "\nRecent CLI output:\n" + recentLogs.slice(-40).join("\n") : "";
          throw new Error("Ghostscript CLI exited with code " + exitCode + detail);
        }
        const resultFiles = collectRequestedFiles();
        const transfer = resultFiles.map((file) => file.data);
        self.postMessage({ type: "done", exitCode, files: resultFiles }, transfer);
      } catch (error) {
        const resultFiles = collectRequestedFiles();
        postFatal(error, "Ghostscript worker failed.", resultFiles);
      }
    };
  `;
  const toArrayBuffer = async (value) => {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    if (value instanceof Blob) return value.arrayBuffer();
    throw new TypeError("Input data must be Blob, File, ArrayBuffer, or TypedArray.");
  };
  const assertSupported = () => {
    if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
      throw new Error("WASM Zoo Ghostscript browser-full requires Web Workers and WebAssembly support.");
    }
  };
  const createOuterWorker = () => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return worker;
  };
  class GhostscriptRunner {
    constructor({ baseUrl }) {
      this.baseUrl = new URL(baseUrl, document.baseURI);
      this.wasm = null;
      this.disposed = false;
    }
    async load() {
      assertSupported();
      if (this.wasm) return;
      const url = new URL(`gs-core.wasm`, this.baseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load Ghostscript WASM: ${response.status} ${response.statusText}`);
      this.wasm = await response.arrayBuffer();
    }
    async exec(args = [], options = {}) {
      if (this.disposed) throw new Error("Ghostscript runner has been disposed.");
      assertSupported();
      if (!Array.isArray(args)) throw new TypeError("args must be an array of CLI arguments.");
      await this.load();
      const files = [];
      const transfer = [];
      for (const file of Array.isArray(options.files) ? options.files : []) {
        if (!file?.name) throw new Error("Every input file needs a virtual filesystem path.");
        const data = await toArrayBuffer(file.data);
        files.push({ name: file.name, data });
        transfer.push(data);
      }
      const wasmBytes = this.wasm.slice(0);
      transfer.push(wasmBytes);
      const onLog = typeof options.onLog === "function" ? options.onLog : () => {};
      return new Promise((resolve, reject) => {
        const worker = createOuterWorker();
        let settled = false;
        const timeoutMs = Number(options.timeoutMs || 0);
        let timer = null;
        const finish = () => {
          if (timer) clearTimeout(timer);
          worker.terminate();
        };
        const resolveOnce = (value) => {
          if (settled) return;
          settled = true;
          finish();
          resolve(value);
        };
        const rejectOnce = (error) => {
          if (settled) return;
          settled = true;
          finish();
          reject(error);
        };
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
          timer = setTimeout(() => {
            const error = new Error(`Ghostscript CLI timed out after ${timeoutMs} ms`);
            error.name = "TimeoutError";
            rejectOnce(error);
          }, timeoutMs);
        }
        worker.onmessage = (event) => {
          const message = event.data;
          if (message?.type === "log") { onLog({ stream: message.stream, message: message.message }); return; }
          if (message?.type === "done") {
            resolveOnce({ exitCode: message.exitCode, files: message.files.map((file) => ({ name: file.name, data: new Uint8Array(file.data) })) });
            return;
          }
          if (message?.type === "error") {
            const error = new Error(message.message || "Ghostscript worker failed.");
            error.name = message.name || "Error";
            error.stack = message.stack || error.stack;
            error.files = Array.isArray(message.files)
              ? message.files.map((file) => ({ name: file.name, data: new Uint8Array(file.data) }))
              : [];
            rejectOnce(error);
          }
        };
        worker.onerror = (event) => {
          const detail = [event.message, event.filename && `${event.filename}:${event.lineno || 0}:${event.colno || 0}`].filter(Boolean).join(" @ ");
          rejectOnce(event.error instanceof Error ? event.error : new Error(detail || "Ghostscript worker failed."));
        };
        worker.postMessage({
          coreJsUrl: new URL(`gs-core.js`, this.baseUrl).href,
          wasmBytes,
          args: [...args],
          files,
          outputs: Array.isArray(options.outputs) ? [...options.outputs] : [],
          collectDirs: Array.isArray(options.collectDirs) ? [...options.collectDirs] : [],
          dirs: Array.isArray(options.dirs) ? [...options.dirs] : []
        }, transfer);
      });
    }
    dispose() { this.disposed = true; this.wasm = null; }
  }
  window.WasmZooGhostscript = Object.freeze({
    loadHosted: ({ baseUrl }) => new GhostscriptRunner({ baseUrl }),
    isSupported: () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined"
  });
})();
