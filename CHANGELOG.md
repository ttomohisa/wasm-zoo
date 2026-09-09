# Changelog

## Unreleased

- promote Ghostscript 10.08.0 to builder 0.7.2 after the isolated upstream candidate build and browser smoke test passed, moving the reviewed source pin to exact commit `4d175558193ad50d6fbc329fe28dbb48af626126`;

- fix automatic promotion PR scheduling so a successful selected upstream candidate still reaches the review-only promotion job when the other package-specific candidate jobs are skipped;

- make Ghostscript upstream promotions automatic by resolving the official source Release asset, GitHub-published SHA-256 digest and matching GhostPDL source commit before candidate build, then carrying the same immutable pins into the review-only promotion PR;

## v0.13.0

- complete the six-package npm rollout with public Registry + package-specific Vite/Chromium smoke gates for jq, libarchive, ImageMagick, Ghostscript, libvips and FFmpeg;
- record `@wasm-zoo/ffmpeg@0.2.7` as `published` after its pthread/COOP-COEP raw-PCM → WAV live smoke passed;
- retire the temporary brand-new-package bootstrap/direct-publish path after all six package names were created, leaving `pack` plus Trusted Publisher OIDC / `npm stage publish` as the maintained publication workflow;
- finalize the project version as WASM Zoo v0.13.0 while keeping every package's upstream pin, Zoo builder version and immutable GitHub Release unchanged;
- add `@wasm-zoo/ffmpeg@0.2.7` as the sixth and final npm rollout canary, deriving the LGPL `browser-full` core/metadata/license payload from immutable `ffmpeg-v0.2.7` while keeping the GPL/libx264 `browser-full-gpl` profile outside the npm tarball;
- add a cross-origin-isolated Vite/Chromium FFmpeg npm smoke that feeds real signed 16-bit PCM through the upstream `ffmpeg` CLI, writes WAV with `pcm_s16le`, and validates RIFF/WAVE framing;
- record libvips as `published` after `@wasm-zoo/libvips@0.5.2` completed its Registry + Vite/Chromium pthread/library-API smoke;

- add `@wasm-zoo/libvips@0.5.2` as the fifth npm rollout canary, deriving the browser-core `vips.js` / `vips.wasm` library payload from immutable `libvips-v0.5.2` while preserving the reviewed LGPL/wasm-vips/third-party notices;
- add npm profile pinning so a one-profile tarball cannot be requested as a different Zoo profile, and map libvips bundler-emitted `vips.js` through Consumer API `coreJsUrl` to the native `jsUrl` loader option;
- make the generic Vite/Chromium npm smoke server cross-origin isolated with COOP/COEP/CORP and add a real libvips PNG decode → resize → JPEG/WebP library-API smoke;
- record Ghostscript as `published` after `@wasm-zoo/ghostscript@0.7.1` completed its Registry + Vite/Chromium smoke;
- add `@wasm-zoo/ghostscript@0.7.1` as the fourth npm rollout canary, deriving its core/metadata payload from immutable `ghostscript-v0.7.1` and preserving `LICENSE-Ghostscript.txt` plus the complete reviewed `THIRD-PARTY-LICENSES/` tree;
- make the Ghostscript browser wrapper honor bundler-emitted `gs-core.js` / `gs-core.wasm` URLs and add a real Vite/Chromium PostScript-to-PDF smoke that validates `%PDF-` / `%%EOF` framing;
- extend the generic npm package generator and tarball-install contract to copy reviewed Release directories recursively, rather than dropping nested license inventories;
- record ImageMagick as `published` after `@wasm-zoo/imagemagick@0.4.3` completed its Registry + Vite/Chromium smoke;
- add `@wasm-zoo/imagemagick@0.4.3` as the third npm rollout canary, deriving its binary/core/metadata payload from immutable `imagemagick-v0.4.3` while overlaying the reviewed browser/Consumer API/bundler wrappers;
- make the ImageMagick browser wrapper honor bundler-emitted `magick-core.js` / `magick-core.wasm` URLs and add a real Vite/Chromium resize-to-PNG smoke that validates the output signature and dimensions;
- promote jq, libarchive and ImageMagick npm metadata to `published` after their Registry + production-browser gates;
- generalize the npm distribution generator and contract checks from the jq-only canary into package metadata-driven infrastructure shared by multiple Zoo packages;
- add `@wasm-zoo/libarchive@0.3.1` as the second npm rollout canary, bundling all four reviewed libarchive CLI cores and forwarding bundler-emitted per-tool JavaScript/Wasm URLs through Consumer API v1;
- add a guarded `bootstrap` mode for brand-new npm package names, while retaining Trusted Publisher OIDC + staged publishing for every version after the first package creation;
- replace the jq-specific live npm smoke harness with a reusable Vite/Chromium smoke runner and add a real in-browser `bsdtar` extraction fixture for libarchive;

## v0.12.0

- make the live-registry Vite/Chromium smoke terminate deterministically by serving the production `dist/` from an in-process Node HTTP server instead of leaving a `vite preview` child process behind, and run that smoke on relevant pull requests before merge;

- fix the jq npm canary after the production Vite smoke exposed a historical-wrapper mismatch: publish the corrected distribution as `@wasm-zoo/jq@0.9.1`, keep jq 1.8.2 / builder 0.9.0 / `jq-v0.9.0` immutable, overlay the current reviewed `browser-jq.js`, and decouple npm distribution patch versions from builder versions;

- harden the v0.12 npm canary after the initial `@wasm-zoo/jq@0.9.0` bootstrap: remove direct publish/token paths, require Trusted Publisher OIDC for `npm stage publish`, and keep maintainer 2FA approval as the final registry gate;
- add a live-registry Vite/Chromium smoke test that installs the published `@wasm-zoo/jq` package into a clean app, builds production assets, verifies emitted Wasm and executes a real jq transformation in Chromium;
- add the v0.12 npm-distribution canary for `@wasm-zoo/jq`: generate a bundler-aware ESM entry from the immutable reviewed jq Release asset, bundle the core Wasm/runtime/metadata/licenses, validate `npm pack`, and add a manual pack/publish/stage workflow designed to move to npm Trusted Publishing after first-package bootstrap;

## v0.11.0

- add Consumer API v1 ESM wrappers for all published browser packages, providing a shared `load()` / `exec()` integration model for CLI-style packages while exposing libvips through `runtime.api`;
- preserve the existing `WasmZoo*` browser APIs for backward compatibility while adding `wasm-zoo.mjs` to Pages staging and future release archives;
- route package Chromium smoke tests through Consumer API v1 and add static Consumer API contract validation for all published browser packages;
- add review-only automatic promotion PRs for successful `auto` upstream candidates while keeping merge, release tags and publication manual;
- promote libvips 8.18.6 to builder 0.5.2 with its reviewed wasm-vips/Emscripten compatibility pins;
- promote ImageMagick 7.1.2-31 to builder 0.4.3 after its isolated candidate build and Chromium smoke test passed;

## v0.9.0

- add jq 1.8.2 as the sixth WASM Zoo package with exact jq/Oniguruma/Emscripten pins, a single-threaded Worker + MEMFS browser-full CLI runtime, real Chromium JSON/regex smoke tests, Playground, upstream watcher candidates, Release Health integration, corresponding source, provenance and CycloneDX SBOM assets;
- promote ImageMagick 7.1.2-30 to builder 0.4.2 after the isolated candidate build and real Chromium smoke test passed, keeping the existing browser-full feature set and Emscripten 6.0.6 toolchain while moving the reviewed source pin to the exact 7.1.2-30 commit;
- complete the v0.8.0 metadata rollout with patch-only releases FFmpeg 0.2.7, ImageMagick 0.4.1, libvips 0.5.1 and Ghostscript 0.7.1, keeping upstream pins and Wasm feature sets unchanged while publishing standalone provenance/SBOM assets;
- make Windows builds for all five packages generate the same provenance/SBOM files after browser smoke testing as the Linux/GitHub Actions path, and enforce that parity in the metadata contract check;
- publish libarchive builder 0.3.1 as the first v0.8.0 metadata-enabled canary, keeping libarchive 3.8.9 and its browser-full feature set unchanged while requiring standalone SLSA provenance and CycloneDX SBOM release assets covered by checksums;

## v0.8.0

- add Release Health Dashboard covering release workflow gates, required assets, Playground reachability, upstream freshness and supply-chain metadata state for all five published packages;
- add `site/release-health.json`, refreshed both during Pages deployment and by the daily watcher;
- generate per-profile `provenance.json` as an in-toto Statement with the SLSA Provenance v1 predicate after the real browser smoke test succeeds;
- generate per-profile CycloneDX 1.6 `sbom.cdx.json`, using exact pinned inputs and available linked/bundled dependency inventories;
- include provenance/SBOM inside metadata-enabled binary ZIPs and expose standalone `provenance-<profile>.json` / `sbom-<profile>.cdx.json` GitHub Release assets covered by `SHA256SUMS.txt`;
- add a supply-chain metadata contract fixture test for every published profile and document the v0.8.0 trust model;
- preserve pre-v0.8 package releases as valid legacy releases while explicitly reporting that standalone provenance/SBOM assets will appear on the next metadata-enabled package release;
- fix Ghostscript final linking under Emscripten 6.0.7 by enabling `DEFAULT_TO_CXX` and add a fast C++ runtime preflight before the long compile.

## v0.7.0

- add Ghostscript 10.07.1 as the fifth available WASM Zoo package, pinned to the exact official release source archive SHA-256 and corresponding GhostPDL source commit;
- add a single-threaded `browser-full` upstream `gs` CLI build with browser-oriented BMP/JPEG/PNG/PS/TIFF output-driver groups and desktop printing/display integrations disabled;
- add an isolated Worker + MEMFS browser runtime and Chromium smoke test covering real PDF → PNG rendering and PostScript → PDF conversion through `pdfwrite`;
- add Ghostscript Playground, Pages/local release staging, build/release Actions, catalog metadata, Feature Matrix and Version Gap Dashboard integration;
- ship the exact official Ghostscript source archive, AGPL license notice, build recipe and SHA-256 checksums with release handoff;
- keep automatic Ghostscript candidate substitution disabled until the watcher also captures and verifies the new release asset digest.

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
