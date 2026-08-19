# ImageMagick builder

Builds the upstream `magick` CLI for browser WebAssembly.

## Windows

```text
build-imagemagick.bat browser-full
```

## Linux/macOS

```text
./builders/imagemagick/build.sh browser-full
```

The initial profile is intentionally conservative:

- single-threaded ImageMagick core executed inside a Worker;
- Emscripten MEMFS;
- PNG + JPEG delegates enabled through the pinned Emscripten ports;
- no SharedArrayBuffer or cross-origin isolation requirement;
- no Ghostscript/PDF, TIFF, WebP, HEIC, OpenEXR, color-management or font-stack integration in v0.4.0.

### Single-threaded browser runtime

`browser-full` disables ImageMagick thread support and OpenMP, uses Emscripten's standard single-threaded zlib/libpng/libjpeg ports, and links the final modularized `magick` module without `-pthread`. Each CLI invocation still runs inside an outer Web Worker, so expensive image work stays off the page's main thread while the Wasm module itself needs neither SharedArrayBuffer nor cross-origin isolation. Distributed pixel cache remains disabled.

### WebAssembly function-pointer compatibility

`browser-full` keeps ImageMagick itself single-threaded. The final `magick` link uses Emscripten `-sEMULATE_FUNCTION_POINTER_CASTS=1` with a final-link optimization level of `-O1` and a 4 MiB WebAssembly stack. Emscripten 6.0.6 crashed in Binaryen when the same fpcast emulation was combined with the O2+ optimizer pipeline; `-O1` still runs fpcast emulation while avoiding that pipeline. Source compilation remains `-O3`.

### Browser zero-configuration pixel-cache patch

ImageMagick normally asks the security-policy layer once whether the pixel cache should use anonymous memory mapping. `browser-full` uses `--enable-zero-configuration`, whose built-in policy map is empty, and Emscripten reports no working `mmap`, so the decision is always disabled. The builder pins that cached decision to `0` for this profile, avoiding the policy/semaphore initialization cycle reached on the first real pixel-cache open without changing the resulting browser behavior. The build checks the exact upstream initializer before applying the patch so a future ImageMagick source change fails closed for review.
