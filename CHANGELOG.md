# Changelog

## 0.3.0 - 2026-08-19

- Added libarchive 3.8.9 as the second available WASM Zoo package.
- Added reproducible `browser-full` builds for upstream `bsdtar`, `bsdcpio`, `bsdcat` and `bsdunzip`.
- Enabled Emscripten toolchain-pinned zlib and bzip2 backends; documented optional compression/XML/crypto gaps.
- Added real Chromium ZIP/Deflate list + extraction smoke testing.
- Added libarchive release workflow with binary ZIP, corresponding source and SHA-256 checksums.
- Added a libarchive Playground and generalized catalog manifest sizing/Playground links for multiple packages.
- Updated Pages staging so published FFmpeg and libarchive cores power their demos.

## Unreleased

- Fixed the Pages Playground pthread worker crash by moving cross-origin isolation from `/playground/` scope to the WASM Zoo Pages root, so Emscripten workers loaded from `/assets/ffmpeg/**` are controlled too.
- Added migration logic that unregisters the old Playground-scoped Service Worker and reloads once under the new root-scoped worker.
- Pages now keeps the published v0.2.6 core binaries unchanged while overlaying the current thin browser runtime wrapper, allowing Playground-only fixes without republishing FFmpeg.
- Improved asynchronous worker error reporting so pthread startup failures surface a useful message instead of `Uncaught [object Event]`.
- Added stable FFmpeg v0.2.6 Release/download/source/checksum links to package metadata and the catalog UI.
- Added a GitHub Pages FFmpeg Playground that runs the published `browser-full` and `browser-full-gpl` cores with arbitrary CLI arguments, local file input and output download.
- Pages deployment now stages the exact published v0.2.6 Release cores instead of rebuilding a separate demo binary.
- Added a same-origin Service Worker isolation bootstrap for pthread/SharedArrayBuffer support on GitHub Pages.
- The catalog reads staged release manifests to show actual WASM/gzip sizes.
- Polished README badges, release documentation, Playground usage and corrected the v0.2.6 tag message.

## 0.2.6 - 2026-08-19

- Fixed the GPL browser smoke deadlock caused by FFmpeg input decoder/filter auto-threading exhausting the fixed Emscripten pthread pool.
- The libx264 smoke now limits decoder, filter, and encoder thread counts while still performing a real H.264 decode -> libx264 encode.
- Raised the generic full-build pthread pool default from 8 to 32 workers.
- Enabled `PTHREAD_POOL_SIZE_STRICT=2` so pool exhaustion fails explicitly instead of hanging indefinitely.
- Added regression checks for both the smoke-test thread caps and the full-build pthread-pool contract.

## 0.2.5 - 2026-08-19

- Fixed Windows smoke-test batch path resolution when invoked via another batch file.
- Captured `%~dp0` before changing directories so relative `call` invocations cannot duplicate `builders\ffmpeg` in the Node script path.
- Added a repository regression check for the stable smoke-test launcher pattern.

## 0.2.4 - 2026-08-19

- Reduced the `browser-full-gpl` real-browser smoke test to one libx264-encoded video frame instead of a full one-second transcode.
- Removed the redundant standalone `ffmpeg -version` WASM invocation from smoke tests, so each profile instantiates the large pthread core only once.
- Added profile-aware smoke timeouts (`300s` for GPL, `180s` for baseline) and in-page progress reporting in timeout errors.
- Kept the GPL smoke meaningful: it still executes the real `libx264` encoder and validates a non-trivial MP4 output.

## 0.2.3 - 2026-08-18

- Fixed Windows browser smoke-test cleanup after a successful FFmpeg run.
- The spawned Chromium process tree is now terminated before removing its temporary user-data directory.
- Temporary profile removal retries transient `EBUSY`/`EPERM` locks and degrades to a warning instead of turning an already-passed smoke test into a build failure.
- Added regression checks for the cleanup contract.

## 0.2.2 - 2026-08-18

- Fixed FFmpeg full builds for Emscripten 6.0.6 by removing the obsolete separate `.worker.js` artifact requirement.
- Pthread workers now bootstrap from `ffmpeg-core.js` through `mainScriptUrlOrBlob`, matching current Emscripten behavior.
- Updated smoke tests, releases, runtime API, docs and CI artifact lists to the two-file core contract (`.js` + `.wasm`).
- Added regression checks so a separate pthread worker artifact cannot silently return.


## 0.2.1 - 2026-08-18

- Fixed FFmpeg pthread linking on Emscripten 6.0.6 by replacing `INITIAL_HEAP` with `INITIAL_MEMORY`; pthread builds use imported/shared WebAssembly memory and Emscripten rejects `INITIAL_HEAP` in that configuration.
- Added a repository check that prevents `INITIAL_HEAP` from being reintroduced into the full pthread build.

## 0.2.0 - 2026-08-18

- Reframed FFmpeg around generic upstream `fftools/ffmpeg` CLI builds.
- Added `browser-full`: broad built-in FFmpeg software feature set without `--disable-everything`.
- Added `browser-full-gpl`: generic full CLI plus GPL components and libx264.
- Enabled Emscripten pthreads and WebAssembly SIMD for both full profiles.
- Added arbitrary CLI browser runtime, COOP/COEP real-browser smoke test, `features.json`, `ffmpeg-config.mak`, per-file SHA-256 and size metadata.
- Added explicit native → WASM capability-gap table in the catalog UI.
- Removed legacy profile runners and narrowed APIs while standardizing the generic distribution contract.

## 0.1.0 - 2026-08-18

- Initial WASM Zoo repository structure and catalog.
