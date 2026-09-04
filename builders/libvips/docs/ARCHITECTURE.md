# libvips browser build architecture

The Zoo build has three separately pinned inputs:

1. upstream libvips `v8.18.6`;
2. Emscripten `6.0.8`;
3. the browser binding/build adapter from `kleisauke/wasm-vips` at an exact commit.

The adapter is required because upstream libvips does not ship a ready-to-host browser JavaScript binding. Its compatibility changes are not trusted through moving branches: the builder fetches the exact upstream and fork commits and reconstructs the two patch sets with `git diff` inside the Docker build.

## Browser profiles

Both profiles use the same Embind API, pthread pool, WebAssembly SIMD, memory growth and MEMFS runtime.

- `browser-core` keeps JPEG, PNG and WebP. Before running the pinned adapter recipe, the Zoo builder skips the TIFF, cgif and imagequant dependency builds and explicitly disables TIFF, cgif/imagequant/quantizr, nsgif, PPM, Analyze and Radiance in libvips Meson configuration.
- `browser-full` leaves the pinned adapter's JPEG/PNG/WebP/TIFF/GIF/imagequant raster set intact.

AVIF/HEIC, JPEG XL, SVG/resvg and UltraHDR are disabled for both profiles. Both profiles require SharedArrayBuffer and cross-origin isolation; Pages uses the site-root cross-origin-isolation Service Worker already required by FFmpeg.

Each profile emits raw and gzip sizes in `manifest.json`. Once both manifests exist, `scripts/compare-profiles.mjs` writes `dist/size-comparison.json` and `dist/size-comparison.md` so the reduction is measured from the actual binaries rather than estimated.
