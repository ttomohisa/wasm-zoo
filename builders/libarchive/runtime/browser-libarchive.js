/* WASM Zoo libarchive browser runtime. Upstream CLI wrapper for bsdtar/bsdcpio/bsdcat/bsdunzip. */
(() => {
  "use strict";
  const TOOLS = Object.freeze(["bsdtar", "bsdcpio", "bsdcat", "bsdunzip"]);
  const WORKER_SOURCE = String.raw`
    "use strict";
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
      const sendLog = (stream, message) => self.postMessage({ type: "log", stream, message: String(message) });
      try {
        importScripts(coreJsUrl);
        if (typeof createLibarchiveCore !== "function") throw new Error("createLibarchiveCore factory was not found.");
        const core = await createLibarchiveCore({
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
        if (exitCode !== 0) throw new Error("libarchive CLI exited with code " + exitCode);
        const names = new Set(outputs);
        for (const dir of collectDirs) for (const name of walkFiles(core.FS, dir)) names.add(name);
        const resultFiles = [];
        const transfer = [];
        for (const name of names) {
          let bytes;
          try { bytes = core.FS.readFile(name); } catch (_) { continue; }
          const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          resultFiles.push({ name, data: copy });
          transfer.push(copy);
        }
        self.postMessage({ type: "done", exitCode, files: resultFiles }, transfer);
      } catch (error) {
        self.postMessage({ type: "error", name: error?.name || "Error", message: error?.message || String(error), stack: error?.stack || "" });
      }
    };
  `;

  const toArrayBuffer = async (value) => {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    if (value instanceof Blob) return value.arrayBuffer();
    throw new TypeError("Input data must be Blob, File, ArrayBuffer, or TypedArray.");
  };

  const createOuterWorker = () => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return worker;
  };

  class LibarchiveRunner {
    constructor({ baseUrl }) {
      this.baseUrl = new URL(baseUrl, document.baseURI);
      this.wasm = new Map();
      this.disposed = false;
    }

    async loadTool(tool) {
      if (!TOOLS.includes(tool)) throw new Error(`Unknown libarchive tool: ${tool}`);
      if (this.wasm.has(tool)) return;
      const url = new URL(`${tool}-core.wasm`, this.baseUrl);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${tool} WASM: ${response.status} ${response.statusText}`);
      this.wasm.set(tool, await response.arrayBuffer());
    }

    async exec(tool, args = [], options = {}) {
      if (this.disposed) throw new Error("libarchive runner has been disposed.");
      if (!Array.isArray(args)) throw new TypeError("args must be an array of CLI arguments.");
      await this.loadTool(tool);
      const files = [];
      const transfer = [];
      for (const file of Array.isArray(options.files) ? options.files : []) {
        if (!file?.name) throw new Error("Every input file needs a virtual filesystem path.");
        const data = await toArrayBuffer(file.data);
        files.push({ name: file.name, data });
        transfer.push(data);
      }
      const wasmBytes = this.wasm.get(tool).slice(0);
      transfer.push(wasmBytes);
      const onLog = typeof options.onLog === "function" ? options.onLog : () => {};
      return new Promise((resolve, reject) => {
        const worker = createOuterWorker();
        const finish = () => worker.terminate();
        worker.onmessage = (event) => {
          const message = event.data;
          if (message?.type === "log") { onLog({ stream: message.stream, message: message.message }); return; }
          if (message?.type === "done") {
            finish();
            resolve({ exitCode: message.exitCode, files: message.files.map((file) => ({ name: file.name, data: new Uint8Array(file.data) })) });
            return;
          }
          if (message?.type === "error") {
            finish();
            const error = new Error(message.message || "libarchive worker failed.");
            error.name = message.name || "Error";
            error.stack = message.stack || error.stack;
            reject(error);
          }
        };
        worker.onerror = (event) => {
          finish();
          const detail = [event.message, event.filename && `${event.filename}:${event.lineno || 0}:${event.colno || 0}`].filter(Boolean).join(" @ ");
          reject(event.error instanceof Error ? event.error : new Error(detail || "libarchive worker failed."));
        };
        worker.postMessage({
          coreJsUrl: new URL(`${tool}-core.js`, this.baseUrl).href,
          wasmBytes,
          args: [...args],
          files,
          outputs: Array.isArray(options.outputs) ? [...options.outputs] : [],
          collectDirs: Array.isArray(options.collectDirs) ? [...options.collectDirs] : [],
          dirs: Array.isArray(options.dirs) ? [...options.dirs] : []
        }, transfer);
      });
    }

    dispose() {
      this.disposed = true;
      this.wasm.clear();
    }
  }

  window.WasmZooLibarchive = Object.freeze({
    tools: TOOLS,
    loadHosted: ({ baseUrl }) => new LibarchiveRunner({ baseUrl })
  });
})();
