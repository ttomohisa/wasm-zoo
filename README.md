# WASM Zoo

[![Verify](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml)
[![FFmpeg build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml)
[![libarchive build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libarchive.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libarchive.yml)
[![Pages](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml)
[![ImageMagick build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-imagemagick.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-imagemagick.yml)
[![libvips build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libvips.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libvips.yml)
[![Ghostscript build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ghostscript.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ghostscript.yml)
[![Upstream watcher](https://github.com/ttomohisa/wasm-zoo/actions/workflows/check-upstream.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/check-upstream.yml)

**Current upstream software, compiled for WebAssembly.**

WASM Zoo is an unofficial distribution project for native software whose WebAssembly builds benefit from current upstream pins, reproducible recipes and explicit capability reporting. Zoo publishes exact source/toolchain revisions, meaningful runtime smoke tests, machine-readable manifests, release health checks, in-toto/SLSA provenance, CycloneDX SBOMs, checksums, license notices and corresponding source.

- Catalog: https://ttomohisa.github.io/wasm-zoo/
- FFmpeg Playground: https://ttomohisa.github.io/wasm-zoo/ffmpeg-playground/
- libarchive Playground: https://ttomohisa.github.io/wasm-zoo/libarchive-playground/
- ImageMagick Playground: https://ttomohisa.github.io/wasm-zoo/imagemagick-playground/
- libvips Playground: https://ttomohisa.github.io/wasm-zoo/libvips-playground/
- Ghostscript Playground: https://ttomohisa.github.io/wasm-zoo/ghostscript-playground/

## Available packages

| Package | Upstream | Zoo builder | Browser profile | Playground |
| --- | --- | --- | --- | --- |
| FFmpeg | 9.0.1 | 0.2.7 | `browser-full`, `browser-full-gpl` | yes |
| libarchive | 3.8.9 | 0.3.1 | `browser-full` | yes |
| ImageMagick | 7.1.2-30 | 0.4.2 | `browser-full` | yes |
| libvips | 8.18.5 | 0.5.1 | `browser-core`, `browser-full` | yes |
| Ghostscript | 10.07.1 | 0.7.1 | `browser-full` | yes |

The project version is **WASM Zoo v0.8.0**. Individual package builders and release tags keep their own versions so a package does not need to be republished merely because another animal is added.

## Release health and supply-chain metadata

WASM Zoo v0.8.0 adds a distribution-level health layer instead of treating a successful compile as the whole release contract. The Pages home now checks each published package across:

- release workflow/build gate status;
- required GitHub Release assets;
- deployed Playground reachability;
- upstream freshness;
- standalone provenance and SBOM assets;
- an aggregate health state.

`site/release-health.json` is refreshed during Pages deployment and by the daily watcher. Older package releases remain valid when they predate the v0.8.0 supply-chain contract; they are shown as waiting for metadata rather than falsely marked broken.

After a builder's real browser smoke test succeeds, every profile now generates:

- `provenance.json` — an in-toto Statement using the SLSA Provenance v1 predicate, with artifact digests, reviewed build parameters, pinned Git/material dependencies, Emscripten toolchain information and best-effort Docker base-image digest resolution;
- `sbom.cdx.json` — CycloneDX 1.6 JSON describing the Zoo profile, upstream project and linked/bundled component inventory available from the pinned build inputs.

The files are included in the binary ZIP and are also exposed as `provenance-<profile>.json` and `sbom-<profile>.cdx.json` on metadata-enabled package releases. See [`docs/SUPPLY_CHAIN.md`](docs/SUPPLY_CHAIN.md).

The v0.8.0 metadata rollout uses patch-only builder releases with unchanged upstream pins: libarchive `0.3.1` (canary), FFmpeg `0.2.7`, ImageMagick `0.4.1`, libvips `0.5.1`, and Ghostscript `0.7.1`.

ImageMagick `0.4.2` is the first post-rollout upstream promotion: the isolated candidate workflow passed for ImageMagick `7.1.2-30` before the reviewed Zoo pin was updated.

Run the live release health check manually:

```text
npm run health:release
```

Validate the metadata contract without compiling the large WASM targets:

```text
npm run metadata:check
```

## Freshness dashboard and capability matrix

WASM Zoo v0.6.0 makes freshness and target differences first-class catalog data instead of burying them in package notes. The Pages home now includes:

- **Version Gap Dashboard** — latest tracked upstream, current Zoo pin, representative third-party WASM build, gap state and watcher verification date;
- **Feature Matrix** — Native vs every published browser profile using a shared state vocabulary: Included, Intentionally excluded, Browser N/A, Optional/platform-dependent and Unknown/not tested;
- **Upstream Watcher** — daily stable-release discovery with a committed `site/upstream-status.json` snapshot, one issue per newly detected release and an isolated candidate workflow where automatic testing is safe.

The watcher deliberately does **not** change reviewed pins or publish releases. For FFmpeg, libarchive and ImageMagick, a newly detected stable release can be substituted only inside the candidate workflow and must pass the existing real Chromium smoke test. libvips is marked `adapter-gated`: a new libvips release first needs reviewed wasm-vips/compatibility patch pins before a candidate build would be meaningful. Ghostscript is tracked daily but automatic candidate substitution is intentionally disabled until the watcher can also capture and verify the official source-asset SHA-256.

Run the watcher manually:

```text
npm run check:upstream
```

Refresh the Pages snapshot from the current upstream state:

```text
npm run check:upstream:write
```

The representative WASM projects are informational comparisons only and carry a `checkedAt` date in each package manifest; WASM Zoo does not treat those external projects as release dependencies.

## What a Zoo package contains

WASM Zoo aims to preserve the **upstream program/API shape** where practical. A published package should provide:

- an exact upstream release/ref and commit;
- an exact compiler/toolchain pin;
- reproducible build scripts;
- generic upstream-facing artifacts instead of a hidden feature subset;
- target/runtime limitations stated explicitly;
- a real runtime smoke test that exercises meaningful functionality;
- `manifest.json` plus package-specific build/feature inventory;
- `provenance.json` using in-toto + SLSA Provenance v1;
- `sbom.cdx.json` using CycloneDX 1.6;
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
ffmpeg-v0.2.7
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

The following optional external backends are intentionally left disabled in `browser-full` and recorded as capability gaps: xz/LZMA, Zstandard, LZ4, LZO, XML and crypto libraries.

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
git tag -a libarchive-v0.3.1 -m "WASM Zoo libarchive v0.3.1"
git push origin libarchive-v0.3.1
```

The release workflow rebuilds from the exact pin, runs the Chromium smoke test, publishes binary/source/checksum assets, then asks the Pages workflow to refresh the libarchive Playground.

`libarchive-v0.3.1` is the first production canary for the v0.8.0 supply-chain contract. It intentionally keeps the 0.3.0 Wasm feature set unchanged and adds standalone `provenance-browser-full.json` and `sbom-browser-full.cdx.json` release assets after the real Chromium smoke test passes.

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

FFmpeg and libvips use pthreads and need cross-origin isolation, so the Pages-root Service Worker supplies COOP/COEP to their page and worker clients. libarchive, ImageMagick and Ghostscript are currently single-threaded and do not depend on SharedArrayBuffer.

In the libarchive Playground, List/Extract expects an archive input, while Create TAR accepts arbitrary local files and packages them into a TAR in memory.

## Local preview

```text
start-local.bat
```

This regenerates the catalog, stages any locally built FFmpeg/libarchive/ImageMagick/libvips/Ghostscript artifacts under ignored `site/assets/`, and serves:

```text
http://localhost:4173/
http://localhost:4173/ffmpeg-playground/
http://localhost:4173/libarchive-playground/
http://localhost:4173/imagemagick-playground/
http://localhost:4173/libvips-playground/
http://localhost:4173/ghostscript-playground/
```

The catalog still works when no local Wasm build has been staged.

## Release assets

Every metadata-enabled package release includes a binary ZIP, corresponding source/build recipe, build information, standalone provenance/SBOM assets and `SHA256SUMS.txt`. Releases published before the v0.8.0 contract remain valid and gain these standalone files on their next package release.

libarchive v0.3.1 uses:

```text
libarchive-browser-full-3.8.9-zoo-0.3.1.zip
libarchive-sources-3.8.9-zoo-0.3.1.tar.gz
BUILDINFO-browser-full.txt
provenance-browser-full.json
sbom-browser-full.cdx.json
SHA256SUMS.txt
```

Its binary ZIP contains four `*-core.js` / `*-core.wasm` pairs, gzip copies, `browser-libarchive.js`, `manifest.json`, `features.json`, `libarchive-config.txt`, build information, libarchive/zlib/bzip2 license notices and toolchain attribution.

## ImageMagick 7.1.2-30

WASM Zoo v0.4.0 adds ImageMagick as the third available package.

The first browser profile publishes the upstream `magick` CLI as a single modularized WebAssembly core.

`browser-full` is deliberately conservative in v0.4.0:

- single-threaded WebAssembly with ImageMagick thread support and OpenMP disabled;
- Worker + Emscripten MEMFS;
- PNG and JPEG support via the pinned Emscripten ports;
- ImageMagick zero-configuration mode for a self-contained browser runtime;
- no SharedArrayBuffer or cross-origin isolation requirement;
- no Ghostscript/PDF, TIFF, WebP, HEIC, XML, color-management or font-stack delegates.

The browser smoke test uses a real PNG fixture, runs `magick -version`, identifies the PNG, resizes it, and writes a JPEG output.

Build on Windows:

```text
build-imagemagick.bat browser-full
```

Linux/macOS:

```text
./builders/imagemagick/build.sh browser-full
```

Release tag after the real build passes:

```text
git tag -a imagemagick-v0.4.2 -m "WASM Zoo ImageMagick v0.4.2"
git push origin imagemagick-v0.4.2
```

The release workflow rebuilds from the exact pin, runs the Chromium smoke test, publishes binary/source/checksum assets, then asks the Pages workflow to refresh the ImageMagick Playground.

## ImageMagick browser API

```js
const image = WasmZooImageMagick.loadHosted({
  baseUrl: "/assets/imagemagick/7.1.2-30/browser-full/"
});

const result = await image.exec([
  "/input/source.png",
  "-resize", "640x640>",
  "/output.jpg"
], {
  files: [{ name: "/input/source.png", data: file }],
  outputs: ["/output.jpg"],
  onLog: ({ stream, message }) => console.log(stream, message)
});
```

## libvips 8.18.5

WASM Zoo v0.5.0 adds libvips as the fourth available package. Unlike FFmpeg, libarchive and ImageMagick, libvips is published as a **library API** rather than a synthetic command-line wrapper.

Both profiles use the pinned `wasm-vips` browser adapter while keeping libvips itself at the exact upstream `v8.18.5` release. **`browser-core` is the recommended small profile** for Browser-Kitty-style work: JPEG/PNG/WebP plus the normal resize, thumbnail, colourspace, composite and convolution APIs. It removes TIFF, GIF, imagequant/quantizr and legacy PPM/Analyze/Radiance loaders. `browser-full` keeps JPEG/PNG/WebP/TIFF/GIF and imagequant. AVIF/HEIC, JPEG XL, SVG/resvg and UltraHDR remain disabled in both profiles.

libvips retains its pthread + WebAssembly SIMD execution model. Therefore both browser profiles require **SharedArrayBuffer and cross-origin isolation (COOP/COEP)**.

The Chromium smoke test performs a real PNG decode, verifies the libvips version, resizes 2×2 → 1×1 and encodes the result as both JPEG and WebP. When both profiles have been built, `builders/libvips/dist/size-comparison.md` and `.json` record the raw/gzip size difference automatically.

Build just the recommended core profile on Windows:

```text
build-libvips.bat browser-core
```

Build both profiles and print the size comparison:

```text
build-libvips.bat all
```

Linux/macOS:

```text
./builders/libvips/build.sh browser-core
./builders/libvips/build.sh all
```

Release tag after the real build passes:

```text
git tag -a libvips-v0.5.1 -m "WASM Zoo libvips v0.5.1"
git push origin libvips-v0.5.1
```

### libvips browser API

```js
const vips = await WasmZooLibvips.loadHosted({
  baseUrl: "/assets/libvips/8.18.5/browser-core/"
});

const input = vips.Image.newFromBuffer(new Uint8Array(await file.arrayBuffer()));
const resized = input.resize(640 / input.width);
const jpeg = resized.writeToBuffer(".jpg[Q=85]");
resized.delete();
input.delete();
```

The release workflow rebuilds both profiles, runs the Chromium smoke tests, publishes both binary archives plus the profile size comparison/source/checksum assets, then refreshes the libvips Playground through Pages.

## Ghostscript 10.07.1

WASM Zoo v0.7.0 adds Ghostscript as the fifth available package. The build uses the official `ghostscript-10.07.1.tar.xz` release archive, verifies its pinned SHA-256 before extraction, and records the corresponding `gs10.07.1` source branch commit for provenance. The browser artifact exposes the upstream `gs` CLI rather than a reduced custom API.

The first `browser-full` profile is deliberately single-threaded and uses an isolated Worker plus Emscripten MEMFS. It keeps PostScript/PDF interpretation, `pdfwrite`, and BMP/JPEG/PNG/PS/TIFF file-output driver groups while disabling desktop-only CUPS, D-Bus, GTK/X11, fontconfig, libpaper, libidn, pdftoraster and IJS integrations. GhostPCL and GhostXPS remain separate from this Ghostscript `gs` artifact.

The Chromium smoke test performs two real document operations: PDF → PNG through `png16m`, and PostScript → PDF through `pdfwrite`.

On Windows:

```bat
build-ghostscript.bat browser-full
```

On bash:

```bash
./builders/ghostscript/build.sh browser-full
```

Release tag:

```bash
git tag -a ghostscript-v0.7.1 -m "WASM Zoo Ghostscript v0.7.1"
git push origin ghostscript-v0.7.1
```

### Ghostscript browser API

```js
const gs = WasmZooGhostscript.loadHosted({
  baseUrl: "/assets/ghostscript/10.07.1/browser-full/"
});

try {
  const result = await gs.exec([
    "-dSAFER", "-dBATCH", "-dNOPAUSE",
    "-sDEVICE=png16m", "-r150",
    "-sOutputFile=/out/page.png", "/input.pdf"
  ], {
    files: [{ name: "/input.pdf", data: pdfBytes }],
    dirs: ["/out"],
    outputs: ["/out/page.png"]
  });
  console.log(result.files[0]);
} finally {
  gs.dispose();
}
```

Ghostscript's published binary is AGPL-3.0-or-later. The release handoff includes the exact official source archive, the Ghostscript license notice, a conservative bundled third-party license/copyright inventory, the build recipe and SHA-256 checksums. Automatic candidate builds are source-digest gated and therefore remain disabled until the watcher can verify a new release asset digest before substitution.


## Repository layout

```text
packages/                   catalog + release metadata
builders/ffmpeg/            FFmpeg build pipeline
builders/libarchive/        libarchive build pipeline
builders/imagemagick/       ImageMagick build pipeline
builders/libvips/           libvips build pipeline
builders/ghostscript/       Ghostscript build pipeline
scripts/                    catalog/upstream/local staging tooling
site/                       catalog + package Playgrounds
docs/                       manifest/package contracts
.github/workflows/          verify, build, release, upstream tracking, Pages
```

## License

WASM Zoo's orchestration/site code is MIT. Generated third-party binaries retain the licenses determined by their actual build flags and linked dependencies. Zoo does not relicense upstream projects.
