# jq browser architecture

`browser-full` cross-compiles the exact jq 1.8.2 git commit and its exact Oniguruma 6.9.10 submodule using Emscripten 6.0.7. The normal jq executable is linked as a modularized JavaScript/Wasm pair with `callMain` and Emscripten FS exposed.

The public `browser-jq.js` wrapper fetches the Wasm bytes once, then starts a fresh outer Web Worker for every command. Inputs/modules are copied into MEMFS, normal CLI arguments are passed to `callMain`, stdout/stderr are captured, requested output files are copied back, and the Worker is terminated. This isolates command state while keeping the page main thread responsive.

No pthread worker is emitted. SharedArrayBuffer, COOP/COEP, host filesystem access and native shell pipeline semantics are outside this profile.
