# WASM Zoo · FFmpeg full builds

This builder exists only for generic upstream FFmpeg CLI distributions.

Profiles:

- `browser-full` — broad built-in FFmpeg software feature set, LGPL-oriented.
- `browser-full-gpl` — same full CLI plus GPL components and libx264.

The build links FFmpeg's own `fftools/ffmpeg` frontend. There are no custom C runners and no app-specific command schema.

## Runtime requirements

- WebAssembly
- Web Workers
- pthreads / SharedArrayBuffer
- cross-origin isolation (COOP/COEP)
- WebAssembly SIMD

## Important target gaps

The build deliberately disables native networking and `libavdevice`; native GPU/hardware backends are unavailable. These are target differences, not silently missing features.

## Reproducibility

See `versions.env` for exact FFmpeg/Emscripten/x264 pins. Every build emits `manifest.json`, `features.json` and `ffmpeg-config.mak`.
