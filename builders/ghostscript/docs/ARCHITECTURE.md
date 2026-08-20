# Ghostscript browser architecture

The Zoo package preserves the upstream `gs` command-line shape. `browser-ghostscript.js` is only an execution adapter:

1. fetch the published `gs-core.wasm` once;
2. create a fresh outer Web Worker per `exec()` call;
3. load the modularized Emscripten launcher inside that worker;
4. populate MEMFS with caller-supplied files;
5. invoke upstream `main()` through `callMain(args)`;
6. copy requested output files back to the page;
7. terminate the worker so Ghostscript global state never leaks between commands.

The first profile is single-threaded, so it does not require SharedArrayBuffer or cross-origin isolation. Memory growth is enabled up to 2 GiB, subject to browser limits.
