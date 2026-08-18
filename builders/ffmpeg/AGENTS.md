# AGENTS.md

## Product goal

Maintain current, generic upstream FFmpeg CLI builds for WebAssembly as part of WASM Zoo.

## Required architecture

- Link upstream `fftools/ffmpeg` and preserve generic CLI behavior.
- Preserve a broad browser-compatible feature set; `browser-full` must not use `--disable-everything`.
- Use pthreads and WebAssembly SIMD for the current full profiles.
- Declare SharedArrayBuffer / COOP / COEP as runtime requirements.
- Record target gaps instead of pretending the WASM build equals every native build.
- Keep exact pins in `versions.env`.
- Every release must include machine-readable features, hashes, licenses/source handoff, and a real browser smoke test.
- Keep the builder generic and driven by upstream capabilities rather than product-specific operations.
