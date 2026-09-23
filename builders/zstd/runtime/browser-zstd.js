/* WASM Zoo experimental Zstandard library wrapper. No published npm or CLI claim. */
(() => {
  "use strict";
  const MAX_BYTES = 64 * 1024 * 1024;
  const supported = () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";
  const copyBuffer = async (value) => {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    if (typeof Blob !== "undefined" && value instanceof Blob) return value.arrayBuffer();
    throw new TypeError("Input must be Blob, ArrayBuffer or TypedArray");
  };
  class Runner {
    constructor(options) {
      this.baseUrl = new URL(options.baseUrl || "./", document.baseURI);
      this.coreJsUrl = new URL(options.coreJsUrl || "zstd-core.js", this.baseUrl).href;
      this.wasmUrl = new URL(options.wasmUrl || "zstd-core.wasm", this.baseUrl).href;
      this.workerUrl = new URL(options.workerUrl || "browser-zstd-worker.js", this.baseUrl).href;
      this.wasmbin = null;
      this.disposed = false;
      this.workers = new Set();
    }
    async load() {
      if (!supported()) throw new Error("Zstandard browser-core requires WebAssembly and Workers");
      if (!this.wasmbin) {
        const response = await fetch(this.wasmUrl);
        if (!response.ok) throw new Error("Unable to fetch Zstandard WASM: " + response.status);
        this.wasmbin = await response.arrayBuffer();
      }
    }
    async run(operation, data, options = {}) {
      if (this.disposed) throw new Error("Zstandard runtime disposed");
      await this.load();
      const input = operation === "version" ? new ArrayBuffer(0) : await copyBuffer(data);
      if (input.byteLength > MAX_BYTES) throw new Error("Zstandard input exceeds 64 MiB");
      const level = options.level == null ? 3 : options.level;
      if (!Number.isInteger(level) || level < -7 || level > 22) throw new RangeError("Zstandard level must be an integer from -7 to 22");
      const wasmBytes = this.wasmbin.slice(0);
      return new Promise((resolve, reject) => {
        const worker = new Worker(this.workerUrl);
        this.workers.add(worker);
        let settled = false;
        let timer;
        const finish = (err, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          worker.terminate();
          this.workers.delete(worker);
          if (err) reject(err); else resolve(value);
        };
        worker.onmessage = (event) => {
          const message = event.data;
          if (message?.type === "done") finish(null, operation === "version" ? message.versionNumber : new Uint8Array(message.bytes));
          else if (message?.type === "error") finish(new Error(message.message));
        };
        worker.onerror = (event) => finish(event.error || new Error(event.message || "Zstandard worker error"));
        const timeout = options.timeoutMs == null ? 60000 : Number(options.timeoutMs);
        if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 300000) {
          finish(new RangeError("timeoutMs must be between 1 and 300000 ms"));
          return;
        }
        timer = setTimeout(() => finish(new Error("Zstandard worker operation timed out")), timeout);
        worker.postMessage({ operation, coreJsUrl: this.coreJsUrl, wasmBytes, input, level }, [wasmBytes, input]);
      });
    }
    version() { return this.run("version"); }
    compress(bytes, options) { return this.run("compress", bytes, options); }
    decompress(bytes, options) { return this.run("decompress", bytes, options); }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      for (const worker of this.workers) worker.terminate();
      this.workers.clear();
      this.wasmbin = null;
    }
  }
  globalThis.WasmZooZstd = Object.freeze({
    loadHosted: (options) => new Runner(options || {}),
    isSupported: supported
  });
})();
