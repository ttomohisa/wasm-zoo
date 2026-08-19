# WASM Zoo

[![Verify](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml)
[![FFmpeg build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml)
[![libarchive build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libarchive.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libarchive.yml)
[![Pages](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml)

**Current upstream software, compiled for WebAssembly.**

WASM Zoo is an unofficial distribution project for native software whose WebAssembly builds benefit from current upstream pins, reproducible recipes and explicit capability reporting. Zoo publishes exact source/toolchain revisions, meaningful runtime smoke tests, machine-readable manifests, checksums, license notices and corresponding source.

- Catalog: https://ttomohisa.github.io/wasm-zoo/
- FFmpeg Playground: https://ttomohisa.github.io/wasm-zoo/playground/
- libarchive Playground: https://ttomohisa.github.io/wasm-zoo/libarchive-playground/

## Available packages

| Package | Upstream | Zoo builder | Browser profile | Playground |
| --- | --- | --- | --- | --- |
| FFmpeg | 9.0.1 | 0.2.6 | `browser-full`, `browser-full-gpl` | yes |
| libarchive | 3.8.9 | 0.3.0 | `browser-full` | yes |

The project version is **WASM Zoo v0.3.0**. Individual package builders and release tags keep their own versions so a package does not need to be republished merely because another animal is added.

## What a Zoo package contains

WASM Zoo aims to preserve the **upstream program/API shape** where practical. A published package should provide:

- an exact upstream release/ref and commit;
- an exact compiler/toolchain pin;
- reproducible build scripts;
- generic upstream-facing artifacts instead of a hidden feature subset;
- target/runtime limitations stated explicitly;
- a real runtime smoke test that exercises meaningful functionality;
- `manifest.json` plus package-specific build/feature inventory;
- immutable release assets, SHA-256 checksums and corresponding source.

`full` means a broad, useful build for the declared WebAssembly target. It never means every feature available on every native operating system.

## FFmpeg 9.0.1

FFmpeg remains the first Zoo package. It publishes the upstream `fftools/ffmpeg` CLI in two browser variants:

| Profile | Extra library | Threads | Binary license |
| --- | --- | --- | --- |
| `browser-full` | — | pthreads | LGPL-2.1-or-later |
| `browser-full-gpl` | libx264 | pthreads | GPL-2.0-or-later |

Both use WebAssembly SIMD, require SharedArrayBuffer/cross-origin isolation, expose arbitrary CLI arguments and publish a generated codec/format/filter inventory. The GPL smoke test performs a real H.264 decode → libx264 encode.

Build on Windows:

```text
build-ffmpeg.bat browser-full
build-ffmpeg.bat browser-full-gpl
```

Release tag:

```text
ffmpeg-v0.2.6
```

## libarchive 3.8.9

WASM Zoo v0.3.0 adds upstream libarchive command-line tools as the second available package:

```text
bsdtar
bsdcpio
bsdcat
bsdunzip
```

`browser-full` is deliberately single-threaded. It runs inside a Worker with Emscripten MEMFS and therefore **does not require SharedArrayBuffer or COOP/COEP**.

The first profile enables:

- zlib 1.3.2 through the pinned Emscripten 6.0.6 toolchain;
- bzip2 1.0.6 through the pinned Emscripten 6.0.6 toolchain;
- upstream archive formats that are compiled into the four static CLI executables.

The following optional external backends are intentionally left disabled in v0.3.0 and recorded as capability gaps: xz/LZMA, Zstandard, LZ4, LZO, XML and crypto libraries.

The browser smoke test uses a real ZIP/Deflate fixture, verifies `bsdtar -tf`, extracts the archive with `bsdtar -xf`, checks extracted bytes, exercises `bsdunzip -l`, and instantiates `bsdcpio`/`bsdcat`.

Build on Windows:

```text
build-libarchive.bat browser-full
```

Linux/macOS:

```text
./builders/libarchive/build.sh browser-full
```

Release tag after the real build passes:

```text
git tag -a libarchive-v0.3.0 -m "WASM Zoo libarchive v0.3.0"
git push origin libarchive-v0.3.0
```

The release workflow rebuilds from the exact pin, runs the Chromium smoke test, publishes binary/source/checksum assets, then asks the Pages workflow to refresh the libarchive Playground.

## libarchive browser API

The thin wrapper keeps the CLI surface generic:

```js
const archive = WasmZooLibarchive.loadHosted({
  baseUrl: "/assets/libarchive/3.8.9/browser-full/"
});

const result = await archive.exec("bsdtar", [
  "-xf", "/input/archive.zip",
  "-C", "/out"
], {
  files: [{ name: "/input/archive.zip", data: file }],
  dirs: ["/out"],
  collectDirs: ["/out"],
  onLog: ({ stream, message }) => console.log(stream, message)
});
```

Each command gets an in-memory filesystem. Files returned from `collectDirs` can then be downloaded or processed by the calling application.

## Playgrounds and Pages

Pages stages immutable binary cores from the matching GitHub Release rather than rebuilding them specifically for the demo. Thin JavaScript integration wrappers are taken from `main`, allowing Playground integration fixes without silently changing the published Wasm binary.

FFmpeg's pthread build needs cross-origin isolation, so the Pages-root Service Worker supplies COOP/COEP to its page and worker clients. libarchive's v0.3.0 profile is single-threaded and does not depend on that mechanism.

In the libarchive Playground, List/Extract expects an archive input, while Create TAR accepts arbitrary local files and packages them into a TAR in memory.

## Local preview

```text
start-local.bat
```

This regenerates the catalog, stages any locally built FFmpeg/libarchive artifacts under ignored `site/assets/`, and serves:

```text
http://localhost:4173/
http://localhost:4173/playground/
http://localhost:4173/libarchive-playground/
```

The catalog still works when no local Wasm build has been staged.

## Release assets

Every package release includes a binary ZIP, corresponding source/build recipe, build information and `SHA256SUMS.txt`.

libarchive v0.3.0 uses:

```text
libarchive-browser-full-3.8.9-zoo-0.3.0.zip
libarchive-sources-3.8.9-zoo-0.3.0.tar.gz
BUILDINFO-browser-full.txt
SHA256SUMS.txt
```

Its binary ZIP contains four `*-core.js` / `*-core.wasm` pairs, gzip copies, `browser-libarchive.js`, `manifest.json`, `features.json`, `libarchive-config.txt`, build information, libarchive/zlib/bzip2 license notices and toolchain attribution.

## Tracked next candidates

- ImageMagick
- libvips
- Ghostscript

They remain `planned` until a reproducible artifact passes a meaningful runtime test.

## Repository layout

```text
packages/                   catalog + release metadata
builders/ffmpeg/            FFmpeg build pipeline
builders/libarchive/        libarchive build pipeline
scripts/                    catalog/upstream/local staging tooling
site/                       catalog + package Playgrounds
docs/                       manifest/package contracts
.github/workflows/          verify, build, release, upstream tracking, Pages
```

## License

WASM Zoo's orchestration/site code is MIT. Generated third-party binaries retain the licenses determined by their actual build flags and linked dependencies. Zoo does not relicense upstream projects.
