# libarchive browser build architecture

`browser-full` keeps the upstream command-line programs rather than replacing them with a custom archive API. Each CLI is linked as its own modular Emscripten executable and shares a small JavaScript runner contract.

```text
libarchive 3.8.9
  ├─ bsdtar   -> bsdtar-core.js + bsdtar-core.wasm
  ├─ bsdcpio  -> bsdcpio-core.js + bsdcpio-core.wasm
  ├─ bsdcat   -> bsdcat-core.js + bsdcat-core.wasm
  └─ bsdunzip -> bsdunzip-core.js + bsdunzip-core.wasm
```

The browser profile is deliberately single-threaded. Files are staged in Emscripten MEMFS and returned to JavaScript after each CLI invocation. This means it does not require SharedArrayBuffer or COOP/COEP.
