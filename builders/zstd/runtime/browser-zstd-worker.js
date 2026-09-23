/* WASM Zoo Zstandard browser-core: fresh Worker per operation, bounded inputs. */
"use strict";
const MAX_BYTES = 64 * 1024 * 1024;
let factoryLoaded = false;
self.onmessage = async (event) => {
  const { operation, coreJsUrl, wasmBytes, input, level } = event.data;
  let core, inputPtr = 0, outputPtr = 0;
  try {
    if (!factoryLoaded) { importScripts(coreJsUrl); factoryLoaded = true; }
    if (typeof createZstdCore !== "function") throw new Error("Zstandard core factory unavailable");
    core = await createZstdCore({ wasmBinary: new Uint8Array(wasmBytes), locateFile: (name) => new URL(name, coreJsUrl).href });
    if (core._zoo_version_number() !== 10507) throw new Error("Unexpected libzstd version: " + core._zoo_version_number());
    if (operation === "version") {
      self.postMessage({ type: "done", versionNumber: core._zoo_version_number() });
      return;
    }
    const source = new Uint8Array(input);
    if (!source.length || source.length > MAX_BYTES) throw new Error("Input must be between 1 byte and 64 MiB");
    inputPtr = core._malloc(source.length);
    if (!inputPtr) throw new Error("Unable to allocate input buffer");
    core.HEAPU8.set(source, inputPtr);
    let capacity;
    if (operation === "compress") {
      capacity = core._zoo_compress_bound(source.length);
    } else if (operation === "decompress") {
      capacity = core._zoo_frame_size(inputPtr, source.length);
      if (capacity === -1) throw new Error("Invalid Zstandard frame");
      if (capacity === -2) throw new Error("Frame content size is unknown; streaming support is not enabled");
    } else {
      throw new Error("Unknown Zstandard operation");
    }
    if (!Number.isSafeInteger(capacity) || capacity < 0 || capacity > MAX_BYTES) {
      throw new Error("Zstandard output exceeds 64 MiB browser-core safety limit");
    }
    outputPtr = core._malloc(Math.max(capacity, 1));
    if (!outputPtr) throw new Error("Unable to allocate output buffer");
    const size = operation === "compress"
      ? core._zoo_compress(inputPtr, source.length, outputPtr, capacity, level)
      : core._zoo_decompress(inputPtr, source.length, outputPtr, capacity);
    if (core._zoo_is_error(size)) throw new Error("Upstream libzstd returned an error for " + operation);
    if (!Number.isSafeInteger(size) || size > capacity) throw new Error("Invalid upstream libzstd result length");
    const copy = core.HEAPU8.slice(outputPtr, outputPtr + size).buffer;
    self.postMessage({ type: "done", bytes: copy }, [copy]);
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  } finally {
    if (core) {
      if (outputPtr) core._free(outputPtr);
      if (inputPtr) core._free(inputPtr);
    }
  }
};
