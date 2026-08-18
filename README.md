# WASM Zoo

[![Verify](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml)
[![FFmpeg build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml)
[![Pages](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml)

**Current upstream software, compiled for WebAssembly.**

WASM Zoo is an unofficial distribution project for native software whose commonly available WebAssembly builds lag upstream or hide important build differences. Zoo publishes reproducible, capability-oriented WASM builds with exact source/toolchain pins, real browser smoke tests, feature inventories, checksums, license notices and corresponding source.

- Catalog: https://ttomohisa.github.io/wasm-zoo/
- FFmpeg Playground: https://ttomohisa.github.io/wasm-zoo/playground/
- FFmpeg v0.2.6 Release: https://github.com/ttomohisa/wasm-zoo/releases/tag/ffmpeg-v0.2.6

## What Zoo is

WASM Zoo aims to preserve the **upstream program/API shape** where practical and make browser-target differences explicit. Each package is treated as a reproducible distribution: the upstream revision, toolchain, enabled capabilities, target limitations, runtime requirements, checksums and corresponding source are all part of the release contract.

For FFmpeg, Zoo publishes the upstream `fftools/ffmpeg` CLI with broad browser-compatible software capabilities, arbitrary CLI arguments, machine-readable feature inventory and target-specific limitations recorded alongside the artifacts.

## First animal: FFmpeg 9.0.1

The published Zoo build is **FFmpeg 9.0.1 / Emscripten 6.0.6 / Zoo builder 0.2.6**.

| Profile | Purpose | External library | Binary license |
| --- | --- | --- | --- |
| `browser-full` | Broad upstream `fftools/ffmpeg` CLI build | — | LGPL-2.1-or-later |
| `browser-full-gpl` | Broad CLI build plus H.264 encoding | libx264 | GPL-2.0-or-later |

Both profiles:

- build the upstream `fftools/ffmpeg` CLI, not a custom runner;
- do **not** use `--disable-everything`;
- retain a broad set of built-in software codecs, formats, parsers and filters that compile for Emscripten;
- accept arbitrary FFmpeg CLI arguments;
- use WebAssembly SIMD and Emscripten pthreads;
- require `SharedArrayBuffer` and cross-origin isolation;
- publish `manifest.json`, `features.json` and `ffmpeg-config.mak` so the actual build can be inspected rather than inferred from the word “full”.

`full` means **broad browser software build**, not “every native FFmpeg feature”. Native GPU APIs, capture devices and native socket/network semantics are explicitly recorded as gaps.

## Published release

Release tag:

```text
ffmpeg-v0.2.6
```

Published assets:

```text
ffmpeg-browser-full-9.0.1-zoo-0.2.6.zip
ffmpeg-browser-full-gpl-9.0.1-zoo-0.2.6.zip
ffmpeg-sources-9.0.1-zoo-0.2.6.tar.gz
BUILDINFO-browser-full.txt
BUILDINFO-browser-full-gpl.txt
SHA256SUMS.txt
```

Each binary ZIP contains:

```text
ffmpeg-core.js
ffmpeg-core.wasm
ffmpeg-core.js.gz
ffmpeg-core.wasm.gz
browser-ffmpeg.js
manifest.json
features.json
ffmpeg-config.mak
BUILDINFO.txt
LICENSES/
```

The catalog reads the deployed release manifests and shows the actual WASM/gzip sizes instead of keeping a hand-maintained size estimate.

## FFmpeg Playground

The Pages site includes a small interactive Playground that runs the published v0.2.6 cores in the browser.

It supports:

- `ffmpeg -version`;
- arbitrary FFmpeg CLI arguments;
- local file input through Emscripten FS;
- output download;
- a one-second stream-copy preset;
- a real one-frame `libx264` encode using `browser-full-gpl`.

GitHub Pages does not supply the COOP/COEP response headers needed by pthread WASM. The Playground therefore installs a Service Worker at the WASM Zoo Pages root, reloads once, and adds the required isolation headers to both the Playground and `/assets/` pthread worker clients. The Pages workflow downloads the exact published Release ZIPs and keeps their `ffmpeg-core.js` / `ffmpeg-core.wasm` byte-for-byte; only the thin `browser-ffmpeg.js` integration wrapper is taken from the current repository so Playground fixes do not require republishing the FFmpeg binary release.

Files selected in the Playground are written to the in-browser Emscripten filesystem; the demo does not upload them to an application server.

## Browser API

The wrapper intentionally exposes generic CLI arguments:

```js
const ffmpeg = await WasmZooFFmpeg.loadHosted({
  coreJsUrl: "/ffmpeg/ffmpeg-core.js",
  wasmUrl: "/ffmpeg/ffmpeg-core.wasm"
});

const result = await ffmpeg.exec([
  "-hide_banner", "-y",
  "-filter_threads", "1",
  "-threads:v", "1",
  "-i", "/input.mp4",
  "-frames:v", "1",
  "-an",
  "-threads:v", "1",
  "-c:v", "libx264",
  "-preset", "ultrafast",
  "/output.mp4"
], {
  files: [{ name: "/input.mp4", data: file }],
  outputs: ["/output.mp4"],
  onLog: ({ stream, message }) => console.log(stream, message)
});
```

The `libx264` example requires `browser-full-gpl`.

## Build FFmpeg

Requirements: Docker Desktop / Docker Buildx, Node.js, and Chrome or Edge for the automatic browser test.

Windows:

```text
build-ffmpeg.bat browser-full
build-ffmpeg.bat browser-full-gpl
```

Linux/macOS:

```text
./builders/ffmpeg/build.sh browser-full
./builders/ffmpeg/build.sh browser-full-gpl
```

A successful build does not stop at linking. The test server serves COOP/COEP headers and headless Chromium processes a real H.264/AAC MP4. The GPL profile performs a real H.264 decode → `libx264` encode with explicit decoder/filter/encoder thread caps. Full builds prewarm a 32-worker pthread pool and use strict pool-exhaustion handling.

## Preview the site locally

After building either FFmpeg profile:

```text
start-local.bat
```

This regenerates the catalog, copies any local `builders/ffmpeg/dist/*` cores into the ignored `site/assets/` staging area, and starts the site on `http://localhost:4173`.

You can also run:

```text
npm run build:site
npm run stage:playground
```

The catalog itself works even when no local FFmpeg artifacts have been staged.

## Release FFmpeg

The release workflow rebuilds both profiles and refuses to publish unless both real Chromium smoke tests pass.

```text
git tag -a ffmpeg-v0.2.6 -m "WASM Zoo FFmpeg v0.2.6"
git push origin ffmpeg-v0.2.6
```

The release preparation fetches the exact FFmpeg and x264 commits again, packages corresponding source/build recipes, writes build information and generates SHA-256 checksums before publication.

## Catalog metadata

The catalog is generated from `packages/*/package.json`. An available package can declare a `release` object plus per-profile `releaseAsset` values. The site then provides stable Release/download links, while the deployed manifests provide exact generated sizes and hashes.

FFmpeg also exposes a Native → Zoo capability matrix rather than pretending a browser target is equivalent to an arbitrary native build.

Tracked next candidates:

- ImageMagick
- libvips
- Ghostscript
- libarchive

They remain `planned` until a reproducible artifact passes its own meaningful runtime test.

## Repository layout

```text
packages/                 catalog + release metadata
builders/ffmpeg/          generic full FFmpeg build pipeline
scripts/                  catalog/upstream/local staging tooling
site/                     static catalog + FFmpeg Playground
docs/                     manifest/package contracts
.github/workflows/        verify, build, release, upstream tracking, Pages
```

## License

WASM Zoo's own orchestration/site code is MIT. Generated third-party binaries retain the licenses determined by their actual build flags and linked dependencies. Zoo does not relicense upstream projects.
