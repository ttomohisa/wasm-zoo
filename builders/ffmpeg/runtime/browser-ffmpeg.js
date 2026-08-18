/* WASM Zoo FFmpeg browser runtime. Generic upstream ffmpeg CLI wrapper. */
(() => {
  "use strict";

  const WORKER_SOURCE = String.raw`
    "use strict";
    let fatalPosted = false;
    const postFatal = (error, fallback = "FFmpeg worker failed.") => {
      if (fatalPosted) return;
      fatalPosted = true;
      const message = error?.message || (typeof error === "string" ? error : fallback);
      const name = error?.name && error.name !== "Event" ? error.name : "Error";
      self.postMessage({ type: "error", name, message, stack: error?.stack || "" });
    };
    self.addEventListener("error", (event) => {
      postFatal(event.error, event.message || "An FFmpeg pthread worker failed to initialize. Reload the page and try again.");
      event.preventDefault();
    });
    self.addEventListener("unhandledrejection", (event) => {
      postFatal(event.reason, "FFmpeg worker promise rejected unexpectedly.");
      event.preventDefault();
    });
    const ensureParent = (FS, path) => {
      const index = path.lastIndexOf("/");
      if (index <= 0) return;
      try { FS.mkdirTree(path.slice(0, index)); } catch (_) {}
    };
    self.onmessage = async (event) => {
      const { coreJsUrl, wasmBytes, args, files, outputs } = event.data;
      const sendLog = (stream, message) => self.postMessage({ type: "log", stream, message: String(message) });
      try {
        if (!self.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
          throw new Error("WASM Zoo FFmpeg full builds require SharedArrayBuffer and cross-origin isolation (COOP/COEP).");
        }
        importScripts(coreJsUrl);
        if (typeof createFFmpegCore !== "function") throw new Error("createFFmpegCore factory was not found.");
        const wasmView = new Uint8Array(wasmBytes);
        const core = await createFFmpegCore({
          wasmBinary: wasmView,
          // Modern Emscripten pthread builds reuse the main JS module as the worker bootstrap.
          mainScriptUrlOrBlob: coreJsUrl,
          print: (message) => sendLog("stdout", message),
          printErr: (message) => sendLog("stderr", message)
        });
        for (const file of files) {
          ensureParent(core.FS, file.name);
          core.FS.writeFile(file.name, new Uint8Array(file.data));
        }
        let exitCode = 0;
        try {
          const result = core.callMain(args);
          if (typeof result === "number") exitCode = result;
        } catch (error) {
          if (typeof error?.status === "number") exitCode = error.status;
          else throw error;
        }
        if (exitCode !== 0) throw new Error("FFmpeg exited with code " + exitCode);
        const resultFiles = [];
        const transfer = [];
        for (const name of outputs) {
          const bytes = core.FS.readFile(name);
          const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          resultFiles.push({ name, data: copy });
          transfer.push(copy);
        }
        self.postMessage({ type: "done", exitCode, files: resultFiles }, transfer);
      } catch (error) {
        postFatal(error);
      }
    };
  `;

  const toArrayBuffer = async (value) => {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    if (value instanceof Blob) return await value.arrayBuffer();
    throw new TypeError("Input data must be Blob, File, ArrayBuffer, or TypedArray.");
  };

  const assertSupported = () => {
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
      throw new Error("WASM Zoo FFmpeg full builds require COOP/COEP headers and SharedArrayBuffer.");
    }
  };

  const createOuterWorker = () => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
  };

  class FFmpegRunner {
    constructor({ coreJsUrl, wasmBytes }) {
      this.coreJsUrl = coreJsUrl;
      this.wasmBytes = wasmBytes;
      this.disposed = false;
    }

    async exec(args = [], options = {}) {
      if (this.disposed) throw new Error("FFmpeg runner has been disposed.");
      assertSupported();
      if (!Array.isArray(args)) throw new TypeError("args must be an array of ffmpeg CLI arguments.");
      const outputs = Array.isArray(options.outputs) ? [...options.outputs] : [];
      const onLog = typeof options.onLog === "function" ? options.onLog : () => {};
      const files = [];
      const transfer = [];
      for (const file of Array.isArray(options.files) ? options.files : []) {
        if (!file?.name) throw new Error("Every input file needs a virtual filesystem path.");
        const data = await toArrayBuffer(file.data);
        files.push({ name: file.name, data });
        transfer.push(data);
      }
      const wasmForRun = this.wasmBytes.slice(0);
      transfer.push(wasmForRun);

      return await new Promise((resolve, reject) => {
        const worker = createOuterWorker();
        const finish = () => worker.terminate();
        worker.onmessage = (event) => {
          const message = event.data;
          if (message?.type === "log") {
            onLog({ stream: message.stream, message: message.message });
            return;
          }
          if (message?.type === "done") {
            finish();
            resolve({
              exitCode: message.exitCode,
              files: message.files.map((file) => ({ name: file.name, data: new Uint8Array(file.data) }))
            });
            return;
          }
          if (message?.type === "error") {
            finish();
            const error = new Error(message.message);
            error.name = message.name || "Error";
            error.stack = message.stack || error.stack;
            reject(error);
          }
        };
        worker.onerror = (event) => {
          finish();
          const error = event.error instanceof Error
            ? event.error
            : new Error(event.message || "FFmpeg worker failed before it could report a structured error.");
          reject(error);
        };
        worker.postMessage({
          coreJsUrl: this.coreJsUrl,
          wasmBytes: wasmForRun,
          args: [...args],
          files,
          outputs
        }, transfer);
      });
    }

    dispose() {
      this.disposed = true;
      this.wasmBytes = new ArrayBuffer(0);
    }
  }

  async function loadHosted({ coreJsUrl, wasmUrl }) {
    assertSupported();
    const absoluteWasmUrl = new URL(wasmUrl, document.baseURI).href;
    const response = await fetch(absoluteWasmUrl);
    if (!response.ok) throw new Error(`Failed to load FFmpeg WASM: ${response.status} ${response.statusText}`);
    return new FFmpegRunner({
      coreJsUrl: new URL(coreJsUrl, document.baseURI).href,
      wasmBytes: await response.arrayBuffer()
    });
  }

  window.WasmZooFFmpeg = Object.freeze({
    loadHosted,
    isSupported: () => globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined"
  });
})();
