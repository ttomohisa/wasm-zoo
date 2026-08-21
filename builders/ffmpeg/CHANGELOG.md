# FFmpeg builder changelog

## 0.2.7 - 2026-08-21

- Metadata-enabled patch release for WASM Zoo v0.8.0; FFmpeg 9.0.1 and both browser profile feature sets are unchanged.
- Publish standalone SLSA provenance and CycloneDX 1.6 SBOM assets after the real browser smoke test.
- Generate the same provenance/SBOM files from the Windows build path.

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

- Fixed Emscripten 6.0.6 pthread linking by switching the initial allocation flag from `INITIAL_HEAP` to `INITIAL_MEMORY`.
- Added a static regression check for the pthread/imported-memory constraint.

## 0.2.0 - 2026-08-18

- Rebuilt the Zoo FFmpeg integration around upstream `fftools/ffmpeg` with generic CLI behavior.
- Added `browser-full` and `browser-full-gpl`.
- Enabled pthreads, SharedArrayBuffer runtime contract and WebAssembly SIMD.
- Added actual configure inventory (`features.json`, `ffmpeg-config.mak`) and real COOP/COEP browser testing.
