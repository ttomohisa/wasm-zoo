/* Zstandard experimental original upstream CLI: isolated Worker/MEMFS adapter. */
(() => {
  "use strict";
  const MAX = 64 * 1024 * 1024;
  const supported = () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
  const nameOk = (name) => typeof name === "string" && name.length <= 512 &&
    name.startsWith("/") && name !== "/" && !name.includes("\\") &&
    !name.split("/").some((part) => part === "." || part === "..") &&
    !/^\/(?:dev|proc|etc|tmp)(?:\/|$)/.test(name);
  const copy = async (value) => {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    if (typeof Blob !== "undefined" && value instanceof Blob) return value.arrayBuffer();
    throw new TypeError("Input must be Blob, ArrayBuffer or TypedArray");
  };
  class Cli {
    constructor({ baseUrl, coreJsUrl, wasmUrl, workerUrl }) {
      this.baseUrl = new URL(baseUrl || "./", document.baseURI);
      this.coreJsUrl = new URL(coreJsUrl || "zstd-cli.js", this.baseUrl).href;
      this.wasmUrl = new URL(wasmUrl || "zstd-cli.wasm", this.baseUrl).href;
      this.workerUrl = new URL(workerUrl || "browser-zstd-cli-worker.js", this.baseUrl).href;
      this.wasm = null;
      this.workers = new Set();
      this.disposed = false;
    }
    async load() {
      if (!supported()) throw new Error("Zstandard CLI requires WebAssembly and Web Workers");
      if (!this.wasm) {
        const response = await fetch(this.wasmUrl);
        if (!response.ok) throw new Error("Unable to load zstd CLI WASM: " + response.status);
        this.wasm = await response.arrayBuffer();
      }
    }
    async exec(args = [], options = {}) {
      if (this.disposed) throw new Error("Zstandard CLI runtime has been disposed");
      if (!Array.isArray(args) || args.length > 48 || args.some((x) => typeof x !== "string" || x.length > 2048)) {
        throw new TypeError("CLI args must be an array of at most 48 short strings");
      }
      const opts = options || {};
      if (!Array.isArray(opts.files ?? []) || !Array.isArray(opts.outputs ?? []) ||
          opts.files?.length > 8 || opts.outputs?.length > 8) {
        throw new TypeError("A maximum of eight input and eight output files is supported");
      }
      const files = [], transfer = [];
      let total = 0;
      for (const entry of opts.files || []) {
        if (!nameOk(entry?.name)) throw new Error("Unsafe staged MEMFS input path");
        const data = await copy(entry.data);
        total += data.byteLength;
        if (total > MAX) throw new RangeError("Total staged input exceeds 64 MiB");
        files.push({ name: entry.name, data });
        transfer.push(data);
      }
      const outputs = opts.outputs || [];
      if (outputs.some((name) => !nameOk(name))) throw new Error("Unsafe requested MEMFS output path");
      await this.load();
      if (this.disposed) throw new Error("Zstandard CLI runtime has been disposed");
      const timeoutMs = opts.timeoutMs === undefined ? 90000 : Number(opts.timeoutMs);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
        throw new RangeError("timeoutMs must be between 1 and 300000 ms");
      }
      const wasmBytes = this.wasm.slice(0);
      transfer.push(wasmBytes);
      return new Promise((resolve, reject) => {
        const worker = new Worker(this.workerUrl);
        this.workers.add(worker);
        let settled = false;
        const timer = setTimeout(() => finish(new Error("Zstandard CLI timed out")), timeoutMs);
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          worker.terminate();
          this.workers.delete(worker);
          if (error) reject(error); else resolve(value);
        };
        worker.onerror = (event) => finish(event.error || new Error(event.message || "CLI worker failed"));
        worker.onmessage = (event) => {
          const msg = event.data;
          if (msg?.type === "log") { opts.onLog?.({ stream: msg.stream, message: msg.message }); return; }
          if (msg?.type === "error") { finish(new Error(msg.message)); return; }
          if (msg?.type === "done") {
            finish(null, {
              exitCode: msg.exitCode,
              stdout: msg.stdout,
              stderr: msg.stderr,
              files: msg.files.map((item) => ({ name: item.name, data: new Uint8Array(item.data) }))
            });
          }
        };
        worker.postMessage({ coreJsUrl: this.coreJsUrl, wasmBytes, args: [...args], files, outputs: [...outputs] }, transfer);
      });
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const worker of this.workers) worker.terminate();
      this.workers.clear();
      this.wasm = null;
    }
  }
  globalThis.WasmZooZstdCli = Object.freeze({
    loadHosted: (options) => new Cli(options || {}),
    isSupported: supported
  });
})();
