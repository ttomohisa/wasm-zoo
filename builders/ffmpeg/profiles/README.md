# FFmpeg profiles

WASM Zoo publishes upstream-oriented CLI builds with explicit browser-target capabilities and limitations.

- `browser-full`: broad FFmpeg built-in software feature set, LGPL-oriented, no optional external codec libraries.
- `browser-full-gpl`: same generic CLI plus GPL components and `libx264`.

Both profiles use the upstream `fftools/ffmpeg` frontend, Emscripten pthreads and WebAssembly SIMD. They therefore require `SharedArrayBuffer` and cross-origin isolation in the browser.

"Full" means **broad software FFmpeg feature coverage for the browser target**, not every feature from a native build. Hardware APIs, native capture devices and native socket semantics are intentionally excluded and reported as gaps in the package manifest.
