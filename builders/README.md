# Builders

Each builder should produce a generic distribution artifact for one upstream project.

- `ffmpeg/` — upstream `fftools/ffmpeg` browser builds (`browser-full`, `browser-full-gpl`) with pthreads, SIMD, generated feature inventory and real-browser testing.

App-specific minimized builds are out of scope for WASM Zoo.
