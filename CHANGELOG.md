# Changelog

## Unreleased

## v0.6.0

- add a Version Gap Dashboard to Pages showing latest upstream, Zoo pin, representative WASM build, gap state and watcher verification date;
- add normalized Native → browser Feature Matrices for FFmpeg, libarchive, ImageMagick and libvips with Included / Excluded / N/A / Optional / Unknown semantics;
- replace the weekly generic upstream check with a daily snapshot-producing Upstream Watcher that updates `site/upstream-status.json`, opens one issue per newly detected release and dispatches isolated candidate checks;
- add candidate builds for FFmpeg, libarchive and ImageMagick that temporarily substitute only the detected upstream ref/commit, run the existing browser smoke tests and never promote the reviewed pin automatically;
- mark libvips candidate updates as adapter-gated so stale wasm-vips compatibility patches cannot masquerade as a successful test of a newer libvips release;
- add representative WASM comparison metadata for ffmpeg.wasm, magick-wasm, libarchive-wasm and wasm-vips;
- fix Ghostscript tracking to use the actual `ghostpdl-downloads` release stream while Ghostscript remains planned.


- fix the libvips `browser-core` profile by explicitly disabling the `quantizr` fallback when `imagequant` is removed under upstream `-Dauto_features=enabled`;
- add the `browser-core` libvips profile for JPEG/PNG/WebP, trimming TIFF/GIF/imagequant and legacy raster loaders while preserving pthreads/SIMD and the same public API;
- add automatic raw/gzip size comparison for `browser-core` vs `browser-full`, profile selection in the Playground, and dual-profile build/release/Pages workflows;
- fix libvips license collection to extract the upstream `LICENSE` file directly from the pinned v8.18.5 commit instead of referencing a non-existent `COPYING` path;
- add a `Use in your app` section to every published package detail with required runtime files, a copyable minimal integration example and package-specific hosting/runtime notes;

## v0.5.0

- add libvips 8.18.5 as the fourth available package, exposed as a browser library API through the exact pinned wasm-vips adapter;
- pin Emscripten 6.0.7, upstream libvips v8.18.5 and both wasm-vips compatibility patch heads to immutable commits;
- add the `browser-full` libvips profile with pthreads, WebAssembly SIMD, SharedArrayBuffer/cross-origin-isolation requirements and a deliberately reduced optional delegate set;
- add a Chromium smoke test covering libvips version reporting, real PNG decode, 2×2 → 1×1 resize and JPEG encode;
- add libvips Playground, local staging, Pages release staging, build/release Actions, catalog metadata and validation.

## v0.4.0

- improve package Details with prominent Playground / integration / download actions, and move the FFmpeg Playground to the explicit `/ffmpeg-playground/` URL while keeping `/playground/` as a compatibility redirect;

- keep ImageMagick browser-full single-threaded while linking the final Wasm module at `-O1` with Emscripten function-pointer cast emulation and a 4 MiB WebAssembly stack, avoiding the Emscripten 6.0.6 O2+ Binaryen fpcast crash and the default-stack overflow;

- make the ImageMagick browser-full runtime consistently single-threaded at configure, compile and final-link time; use the standard libpng port and avoid SharedArrayBuffer/cross-origin-isolation requirements;

- fix ImageMagick browser smoke-test script escaping and add pre-build JavaScript syntax checks;

- add ImageMagick 7.1.2-29 as an available package;
- add `builders/imagemagick` with browser-full build, Chromium smoke test, release preparation and repository checks;
- add ImageMagick Playground to GitHub Pages;
- stage published ImageMagick releases into Pages/local preview;
- update catalog, README and validation logic for the third published package.
