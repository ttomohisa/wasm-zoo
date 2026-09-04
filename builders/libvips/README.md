# libvips builder

Builds libvips 8.18.6 for browser WebAssembly and exposes the library through the pinned `wasm-vips` Embind API.

The libvips source is the exact upstream `v8.18.6` release. The browser adapter, Emscripten 6.0.8 source ref and both compatibility-patch heads are pinned to immutable commits.

## Profiles

- `browser-core` — recommended small profile: JPEG / PNG / WebP. Removes TIFF, GIF, imagequant/quantizr and legacy PPM / Analyze / Radiance loaders.
- `browser-full` — JPEG / PNG / WebP / TIFF / GIF plus imagequant.

Both profiles retain libvips pthreads and WebAssembly SIMD, so they require SharedArrayBuffer plus cross-origin isolation. AVIF/HEIC, JPEG XL, SVG/resvg and UltraHDR are disabled in both current profiles.

## Windows

```text
build-libvips.bat browser-core
build-libvips.bat browser-full
build-libvips.bat all
```

## Linux/macOS

```text
./builders/libvips/build.sh browser-core
./builders/libvips/build.sh browser-full
./builders/libvips/build.sh all
```

`all` builds and smoke-tests both profiles, then writes `dist/size-comparison.json` and `dist/size-comparison.md`. A single-profile build also refreshes the comparison automatically when the other profile already exists.

Unlike the ImageMagick package, this package intentionally publishes a library API rather than inventing a CLI compatibility layer. The raw `vips.js` + `vips.wasm` pair is the primary artifact; `browser-libvips.js` only simplifies self-hosted loading.
