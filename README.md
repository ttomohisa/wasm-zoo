# WASM Zoo

**Current upstream software, compiled for WebAssembly.**

WASM Zoo is an unofficial distribution project for native software whose commonly available WebAssembly builds lag upstream or hide important build differences. The value is the maintained build recipe: exact source/toolchain pins, generic artifacts, a real runtime smoke test, machine-readable feature inventory, hashes, licenses and source handoff.

## What Zoo is — and is not

Zoo aims to preserve the **upstream program/API shape** where practical. It is not the place for tiny app-specific builds.

For FFmpeg that means:

```text
FFmpeg upstream
     │
     ├── WASM Zoo
     │     generic upstream ffmpeg CLI
     │     browser-full / browser-full-gpl
     │     arbitrary CLI arguments
     │     large, capability-oriented artifacts
     │
     └── specialized app builder (separate project)
           public libav* runner
           only app-required features
           small Browser Kitty artifacts
```

The old `video-compressor` and `lossless-video-cutter` profiles are intentionally not part of Zoo.

## First animal: FFmpeg 9.0.1

### `browser-full`

- upstream `fftools/ffmpeg` CLI, not a custom runner;
- does **not** use `--disable-everything`;
- retains a broad set of FFmpeg built-in software codecs, formats, parsers and filters that compile for Emscripten;
- LGPL-oriented baseline with no optional external codec libraries;
- pthreads + WebAssembly SIMD;
- arbitrary FFmpeg CLI arguments.

### `browser-full-gpl`

- everything above;
- FFmpeg GPL components enabled;
- `libx264` linked for H.264 encoding;
- GPL-2.0-or-later binary distribution.

`full` means **broad browser software build**, not “every native FFmpeg feature”. Native GPU APIs, capture devices and socket/network semantics are explicitly reported as gaps.

Both current profiles require `SharedArrayBuffer` and cross-origin isolation (`COOP: same-origin`, `COEP: require-corp`) because the upstream FFmpeg CLI needs a working thread backend. Full builds prewarm a 32-worker pthread pool and use strict pool exhaustion handling; very thread-heavy commands should still set FFmpeg codec/filter thread counts explicitly.

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

Each successful build produces:

```text
builders/ffmpeg/dist/<profile>/
├─ ffmpeg-core.js
├─ ffmpeg-core.wasm
├─ *.gz
├─ browser-ffmpeg.js
├─ manifest.json
├─ features.json
└─ ffmpeg-config.mak
```

`manifest.json` records actual byte sizes and SHA-256 values. `features.json` lists generated decoders, encoders, demuxers, muxers, parsers, filters and protocols. `ffmpeg-config.mak` is retained for low-level diffing between releases.

## Browser API

The wrapper intentionally exposes generic CLI arguments:

```js
const ffmpeg = await WasmZooFFmpeg.loadHosted({
  coreJsUrl: "/ffmpeg/ffmpeg-core.js",
  wasmUrl: "/ffmpeg/ffmpeg-core.wasm"
});

const result = await ffmpeg.exec([
  "-hide_banner", "-y",
  "-i", "/input.mp4",
  "-vf", "scale=1280:-2",
  "-c:v", "libx264",
  "-crf", "23",
  "/output.mp4"
], {
  files: [{ name: "/input.mp4", data: file }],
  outputs: ["/output.mp4"]
});
```

The GPL example requires `browser-full-gpl`.

## Real browser test

The build does not stop at successful linking. A local Node server serves the generated artifacts with COOP/COEP headers and headless Chromium processes a real H.264/AAC MP4. The GPL profile performs a real H.264 decode -> `libx264` encode while explicitly limiting decoder/filter/encoder threads so the smoke test measures codec compatibility rather than host CPU count.

## Release contract

A public FFmpeg release contains two binary ZIPs plus corresponding source/build recipe and checksums. Tag format:

```text
git tag -a ffmpeg-v0.2.6 -m "WASM Zoo FFmpeg v0.2.5"
git push origin ffmpeg-v0.2.6
```

The release workflow rebuilds both profiles and refuses to publish unless their browser smoke tests pass.

## Catalog

```text
npm run build:site
start-local.bat
```

The catalog is generated from `packages/*/package.json`. FFmpeg includes a Native → Zoo capability matrix rather than pretending a browser target is equivalent to an arbitrary native build.

Tracked next candidates:

- ImageMagick
- libvips
- Ghostscript
- libarchive

They remain `planned` until a reproducible artifact passes its own meaningful runtime test.

## Repository layout

```text
packages/                 catalog metadata
builders/ffmpeg/          generic full FFmpeg build pipeline
scripts/                  catalog/upstream tooling
site/                     static catalog UI
docs/                     manifest contract
.github/workflows/        verify, build, release, upstream tracking, Pages
```

## License

WASM Zoo's own orchestration/site code is MIT. Generated third-party binaries retain the licenses determined by their actual build flags and linked dependencies. Zoo does not relicense upstream projects.
