# WASM Zoo

[![Verify](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/verify.yml)
[![FFmpeg build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ffmpeg.yml)
[![libarchive build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libarchive.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libarchive.yml)
[![Pages](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/pages.yml)
[![ImageMagick build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-imagemagick.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-imagemagick.yml)
[![libvips build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libvips.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-libvips.yml)
[![Ghostscript build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ghostscript.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-ghostscript.yml)
[![jq build](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-jq.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/build-jq.yml)
[![Upstream watcher](https://github.com/ttomohisa/wasm-zoo/actions/workflows/check-upstream.yml/badge.svg)](https://github.com/ttomohisa/wasm-zoo/actions/workflows/check-upstream.yml)

**Current upstream software, compiled for WebAssembly.**

WASM Zoo is an unofficial distribution project for native software whose WebAssembly builds benefit from current upstream pins, reproducible recipes and explicit capability reporting. Zoo publishes exact source/toolchain revisions, meaningful runtime smoke tests, machine-readable manifests, release health checks, in-toto/SLSA provenance, CycloneDX SBOMs, checksums, license notices and corresponding source.

- Catalog: https://ttomohisa.github.io/wasm-zoo/
- FFmpeg Playground: https://ttomohisa.github.io/wasm-zoo/ffmpeg-playground/
- libarchive Playground: https://ttomohisa.github.io/wasm-zoo/libarchive-playground/
- ImageMagick Playground: https://ttomohisa.github.io/wasm-zoo/imagemagick-playground/
- libvips Playground: https://ttomohisa.github.io/wasm-zoo/libvips-playground/
- Ghostscript Playground: https://ttomohisa.github.io/wasm-zoo/ghostscript-playground/
- jq Playground: https://ttomohisa.github.io/wasm-zoo/jq-playground/
- Zstandard Playground: https://ttomohisa.github.io/wasm-zoo/zstd-playground/
- QPDF Playground: https://ttomohisa.github.io/wasm-zoo/qpdf-playground/



## v0.18.0: Manifest-driven Operations

WASM Zoo v0.18.0 is a project-only operations release. It keeps all eight package upstream pins, Zoo builder versions, immutable package Release tags and npm versions unchanged while making routine package operations derive more of their behavior from reviewed manifests.

Published npm enrollment and the Cross-browser Compatibility Lab package/threaded matrices are manifest-driven. Automatic candidate registration, result routing and promotion repository-checker selection are centralized without hiding package-specific build semantics. Successful candidates may still create only review-only promotion PRs; automation does not merge them.

Promotion PRs now include a generated post-merge human handoff. After a real `automation/promote-*` PR is manually merged, a comment-only workflow posts the confirmed merge SHA plus the manual package tag, GitHub Release and conditional npm follow-up. QPDF and Zstandard retain their separately reviewed npm source pins.

Release Health schema 2 adds live npm Registry alignment to the existing release/Playground/freshness/supply-chain view, including exact/latest version, source Release and `dist.shasum` state. Intentional `keepNpmPinned` drift is a separate-review warning; unexpected source drift or a recorded Registry SHA mismatch is an error.

Local preview now has stagers for all eight available package Playgrounds, including QPDF, and CI fails if a future available Playground package is omitted from the local-stager registry. The reviewed-pin model is unchanged: automation may prepare review artifacts and comments, but merge, project/package tags, reviewed GitHub Releases and npm publication remain human-controlled.

The project version is **WASM Zoo v0.18.0**. Individual package builders, npm distribution versions and immutable package release tags remain independently versioned.

See [v0.18.0 project release review](docs/V018_RELEASE.md).

## v0.17.0: QPDF release, npm and 24-cell Lab

WASM Zoo v0.17.0 records QPDF 12.4.1 as the eighth reviewed package and eighth public npm distribution, while preserving every package's independently reviewed upstream/toolchain pin, Zoo builder version and immutable package release identity.

QPDF's reviewed `qpdf-v0.1.0` Release was built from the official 12.4.1 source archive with the exact upstream commit, Emscripten 6.0.8, zlib 1.3.2 and libjpeg 9f inputs pinned and verified. The human-published `@wasm-zoo/qpdf@0.1.0` Registry package is bound to the exact prepublication three-browser tarball by `dist.shasum` `83b2a89ec339d58ab0dcaf3c118385c3396955f1`.

The Registry-backed Compatibility Lab now requires **24 exact-version browser operations**: six single-threaded packages plus FFmpeg/libvips across Chromium, Firefox and WebKit. The first reviewed-main 24-cell run passed all cells and Pages published a verified 24-pass snapshot.

All eight packages retain review-only automatic candidate contracts. libvips remains **fail-closed**: candidate testing starts only after its wasm-vips adapter and compatibility inputs resolve to immutable commits. The reviewed-pin model is unchanged: automation may prepare a PR, but it never automatically merges, tags, creates a GitHub Release or publishes npm.

## Available packages

| Package | Upstream | Zoo builder | Browser profile | Playground | npm rollout |
| --- | --- | --- | --- | --- | --- |
| FFmpeg | 9.0.2 | 0.2.8 | `browser-full`, `browser-full-gpl` | yes | `@wasm-zoo/ffmpeg@0.2.8` |
| libarchive | 3.8.9 | 0.3.1 | `browser-full` | yes | `@wasm-zoo/libarchive@0.3.1` |
| ImageMagick | 7.1.2-31 | 0.4.3 | `browser-full` | yes | `@wasm-zoo/imagemagick@0.4.3` |
| libvips | 8.18.6 | 0.5.2 | `browser-core`, `browser-full` | yes | `@wasm-zoo/libvips@0.5.2` |
| Ghostscript | 10.08.0 | 0.7.2 | `browser-full` | yes | `@wasm-zoo/ghostscript@0.7.2` |
| jq | 1.8.2 | 0.9.0 | `browser-full` | yes | `@wasm-zoo/jq@0.9.1` |
| Zstandard | 1.5.7 | 0.3.0 | `browser-core`, `browser-full` | yes | `@wasm-zoo/zstd@0.3.0` |
| QPDF | 12.4.1 | 0.1.0 | `browser-full` | yes | `@wasm-zoo/qpdf@0.1.0` |

WASM Zoo v0.17.0 was the project release that completed the QPDF rollout. Individual package builders, npm distribution versions and immutable package release tags keep their own versions, so later project-only releases do not require package republishing.

### npm distribution

WASM Zoo v0.13.0 completed npm rollout for the original six packages. Zstandard became the seventh npm distribution after a reviewed tarball passed Chromium, Firefox and WebKit prepublication tests and the maintainer manually published it. QPDF is now the eighth npm distribution, published from its independently reviewed three-browser canary tarball with the Registry SHA-1 bound to that exact artifact.

```text
npm install @wasm-zoo/jq
npm install @wasm-zoo/libarchive
npm install @wasm-zoo/imagemagick
npm install @wasm-zoo/ghostscript
npm install @wasm-zoo/libvips
npm install @wasm-zoo/ffmpeg
npm install @wasm-zoo/zstd
npm install @wasm-zoo/qpdf
```

`@wasm-zoo/qpdf@0.1.0` is public. Its initial human publication used the exact immutable `qpdf-v0.1.0` Release-derived tarball that passed Vite + Chromium/Firefox/WebKit real PDF operations; Registry `dist.shasum` `83b2a89ec339d58ab0dcaf3c118385c3396955f1` matches that reviewed tarball. Future QPDF npm versions use the normal Trusted Publisher staged-review flow.

The FFmpeg npm package intentionally pins the LGPL `browser-full` profile; the separate `browser-full-gpl` / libx264 Release profile is not bundled into the same npm tarball. FFmpeg and libvips both use pthreads, so consumers must serve them with cross-origin isolation / SharedArrayBuffer support. The Vite/Chromium smoke supplies COOP/COEP; FFmpeg's fixture performs a real raw-PCM → WAV CLI conversion while libvips continues to exercise its library API. See [`docs/NPM_DISTRIBUTION.md`](docs/NPM_DISTRIBUTION.md).

Future npm versions use Trusted Publisher OIDC with `npm stage publish`; the temporary rollout bootstrap/direct-publish path has been removed.

### Cross-browser Compatibility Lab (current target: 24 verified main-branch operations)

The browser lab executes **every available manifest with `npm.status: published`** in Chromium, Firefox and WebKit, using real package operations after a production Vite build—not an instantiate-only test. The selected `npm.profile` determines whether the package enters the ordinary or threaded matrix from its declared runtime requirements. The current v0.17 set is eight packages / 24 cells. FFmpeg and libvips also verify COOP/COEP/CORP and measured threaded-runtime capabilities before execution. A genuinely missing browser capability is labeled `unsupported` only with explicit evidence; an unexpected error is `fail`.

The [public browser compatibility dashboard](https://ttomohisa.github.io/wasm-zoo/#compatibility) reads the **latest eligible main-branch GitHub Actions run**, including unsuccessful or still-running attempts, so it never falls back to an older passing result. It displays tested package versions, browser engines, test time and a link to the source run. If the current latest run is failing, pending, stale, mismatched or missing artifacts, the site reports **not tested** rather than copying a previous passing result. Weekly checks refresh the evidence. See [Cross-browser Lab documentation](docs/CROSS_BROWSER_LAB.md) for the status policy.

WASM Zoo v0.17.0 records QPDF as the eighth public npm distribution and the Registry-backed Lab expansion from 21 to 24 cells. The final reviewed-main release evidence is Lab run #86 with 24/24 browser-operation passes and Pages run #141 publishing a verified 24-pass snapshot. This project release does not change any reviewed upstream/toolchain pin, builder version or immutable package release. The human maintainer controls PR merges and project/package release tags; CI never automatically merges, tags, releases or publishes reviewed changes. See [v0.17.0 release checklist](docs/V017_RELEASE.md).

## Release health and supply-chain metadata

WASM Zoo v0.8.0 adds a distribution-level health layer instead of treating a successful compile as the whole release contract. The Pages home now checks each published package across:

- release workflow/build gate status;
- required GitHub Release assets;
- deployed Playground reachability;
- upstream freshness;
- standalone provenance and SBOM assets;
- live npm Registry state for the reviewed package/version, including the source Release and Registry SHA-1 when available;
- an aggregate health state.

`site/release-health.json` is refreshed during Pages deployment and by the daily watcher. Its npm section distinguishes four operational states: aligned/current, Registry update pending, intentionally pinned for a separate npm review, and broken identity (for example a recorded `dist.shasum` mismatch). QPDF and Zstandard may therefore show an intentional npm pin after a future package promotion without being mislabeled as a broken GitHub Release. Older package releases remain valid when they predate the v0.8.0 supply-chain contract; they are shown as waiting for metadata rather than falsely marked broken.

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

The watcher deliberately does **not** change `main`, merge pull requests, create release tags or publish releases. For FFmpeg, libarchive, ImageMagick, libvips, Ghostscript, jq, Zstandard and QPDF, a newly detected stable release is substituted only inside the isolated candidate workflow and must pass the package's real browser smoke test. When an `auto` candidate succeeds, WASM Zoo prepares the reviewed pin/package/release metadata update on a bot branch, opens a **review-only promotion PR**, and explicitly dispatches `Verify catalog` plus the package build workflow on that branch. A human still reviews and merges the PR. The PR already contains a generated post-merge operator checklist, and after merge a comment-only workflow refreshes that handoff with the exact merge SHA and package/npm-specific manual commands.

Zstandard uses `auto`: both browser profiles must pass exact-tag/commit candidate builds, and `browser-full` must also pass bidirectional native-zstd frame interoperability before a review-only promotion PR can be created. Its existing npm distribution remains independently pinned until a later npm review. libvips now also uses `auto`, but fails closed before dispatch: the watcher requires an exact wasm-vips commit that already targets the detected libvips release, derives its Emscripten version, and freezes both libvips/Emscripten compatibility branch heads to immutable commits before building `browser-core` and `browser-full`. Ghostscript uses `auto`: the watcher resolves the exact official source archive and its GitHub-published SHA-256 digest plus the matching GhostPDL source commit before dispatching a candidate build. See `docs/AUTOMATED_PROMOTIONS.md` for the exact flow, permissions and fallback procedure.

Run the watcher manually:

```text
npm run check:upstream
```

Refresh the Pages snapshot from the current upstream state:

```text
npm run check:upstream:write
```

The representative WASM projects are informational comparisons only and carry a `checkedAt` date in each package manifest; WASM Zoo does not treat those external projects as release dependencies.

## Adding a package

New animals follow the staged [Package onboarding contract](docs/PACKAGE_ONBOARDING.md). The contract lets a package begin as `experimental` with a real builder and browser smoke, then requires release/Playground wiring before `available`, and finally requires reviewed npm metadata plus a real package-specific npm smoke operation before npm may be marked `published`.

WASM Zoo v0.18.0 makes published npm enrollment manifest-driven: the generic npm workflow accepts a manifest-validated slug, and the Cross-browser Lab / public snapshot derive membership and threaded classification from `npm.status`, `npm.profile` and that profile's runtime requirements. A ninth published package therefore joins the three-browser evidence set without another package-name edit to those workflows.

The same v0.18 cleanup also centralizes candidate registration/result/checker routing. `upstream-candidate.yml` now validates a requested automatic package through the reviewed manifest/config before running its explicit package-specific build job, then resolves its result and repository-checker path through a shared helper rather than repeating eight package-name case mappings. Package-specific jobs remain explicit where their source, profile or smoke requirements differ.

v0.18 also generates the post-merge human handoff from reviewed package metadata. Promotion PRs show the expected tag/release/npm steps before merge; after a real `automation/promote-*` merge, a comment-only workflow posts the confirmed checklist to the PR and watcher issue. It can recommend `publish-npm.yml` pack/stage commands for packages whose npm version advances, or explicitly keep QPDF/Zstandard npm identities pinned, but it never performs the tag, Release, npm stage/approval or issue close itself.

The same operations pass extends Release Health with live npm distribution alignment. The dashboard records the reviewed npm version, source Release, current Registry version, live Registry SHA-1, whether a separately reviewed npm update is pending, and whether a pin is intentional. A Registry SHA mismatch or unreviewed source-release drift is an error; a deliberate `keepNpmPinned` mismatch is surfaced as a separate-review warning instead of a false release failure.

`npm run onboarding:check` discovers package manifests and builder checkers rather than relying on a package allowlist. The local-preview registration check likewise derives every available Playground package from manifests, so a future animal cannot ship a Playground while being silently omitted from `npm run stage:playground`. Package-specific source/toolchain invariants, local copy rules and real-operation fixtures remain explicit and reviewed.

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

## FFmpeg 9.0.2

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
ffmpeg-v0.2.8
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

This regenerates the catalog, stages any locally built FFmpeg/libarchive/ImageMagick/libvips/Ghostscript/jq/Zstandard/QPDF artifacts under ignored `site/assets/`, and serves:

```text
http://localhost:4173/
http://localhost:4173/ffmpeg-playground/
http://localhost:4173/libarchive-playground/
http://localhost:4173/imagemagick-playground/
http://localhost:4173/libvips-playground/
http://localhost:4173/ghostscript-playground/
http://localhost:4173/jq-playground/
http://localhost:4173/zstd-playground/
http://localhost:4173/qpdf-playground/
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

## ImageMagick 7.1.2-31

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
git tag -a imagemagick-v0.4.3 -m "WASM Zoo ImageMagick v0.4.3"
git push origin imagemagick-v0.4.3
```

The release workflow rebuilds from the exact pin, runs the Chromium smoke test, publishes binary/source/checksum assets, then asks the Pages workflow to refresh the ImageMagick Playground.

## ImageMagick browser API

```js
const image = WasmZooImageMagick.loadHosted({
  baseUrl: "/assets/imagemagick/7.1.2-31/browser-full/"
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

## libvips 8.18.6

WASM Zoo v0.5.0 introduced libvips as the fourth available package. Unlike FFmpeg, libarchive and ImageMagick, libvips is published as a **library API** rather than a synthetic command-line wrapper.

Both profiles use the pinned `wasm-vips` browser adapter while keeping libvips itself at the exact upstream `v8.18.6` release. The 0.5.2 promotion also moves the reviewed toolchain to Emscripten 6.0.8 and pins the matching libvips/Emscripten compatibility-patch heads. **`browser-core` is the recommended small profile** for Browser-Kitty-style work: JPEG/PNG/WebP plus the normal resize, thumbnail, colourspace, composite and convolution APIs. It removes TIFF, GIF, imagequant/quantizr and legacy PPM/Analyze/Radiance loaders. `browser-full` keeps JPEG/PNG/WebP/TIFF/GIF and imagequant. AVIF/HEIC, JPEG XL, SVG/resvg and UltraHDR remain disabled in both profiles.

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
git tag -a libvips-v0.5.2 -m "WASM Zoo libvips v0.5.2"
git push origin libvips-v0.5.2
```

### libvips browser API

```js
const vips = await WasmZooLibvips.loadHosted({
  baseUrl: "/assets/libvips/8.18.6/browser-core/"
});

const input = vips.Image.newFromBuffer(new Uint8Array(await file.arrayBuffer()));
const resized = input.resize(640 / input.width);
const jpeg = resized.writeToBuffer(".jpg[Q=85]");
resized.delete();
input.delete();
```

The release workflow rebuilds both profiles, runs the Chromium smoke tests, publishes both binary archives plus the profile size comparison/source/checksum assets, then refreshes the libvips Playground through Pages.

## jq 1.8.2

WASM Zoo adds jq as the sixth available package. `browser-full` builds the exact upstream `jq-1.8.2` commit with its exact Oniguruma 6.9.10 submodule using Emscripten 6.0.7. The normal jq CLI is preserved, while a thin Worker/MEMFS wrapper stages files and captures stdout/stderr. No SharedArrayBuffer or cross-origin isolation is required.

The representative `jq-web` 0.6.2 package currently pins jq 1.7.1 and documents Emscripten 3.1.31 as its known-working compiler; WASM Zoo instead tracks current jq 1.8.2 with exact source/toolchain pins, real Chromium smoke tests, provenance and SBOM metadata.

Build on Windows:

```text
build-jq.bat browser-full
```

Release tag after the real browser build passes:

```text
git tag -a jq-v0.9.0 -m "WASM Zoo jq v0.9.0"
git push origin jq-v0.9.0
```

The smoke test verifies `jq --version`, a real `select`/`map` JSON transformation and an Oniguruma-backed `test()` regular expression.

### jq browser API

```js
const jq = WasmZooJq.loadHosted({
  baseUrl: "/assets/jq/1.8.2/browser-full/"
});
const input = new TextEncoder().encode(JSON.stringify({ users: [{name: "A", active: true}] }));
const result = await jq.exec([
  "-c", ".users | map(select(.active)) | map(.name)", "/input.json"
], { files: [{ name: "/input.json", data: input }] });
console.log(result.stdout);
jq.dispose();
```

## Ghostscript 10.08.0

WASM Zoo v0.7.0 adds Ghostscript as the fifth available package. The build uses the official `ghostscript-10.08.0.tar.xz` release archive, verifies its pinned SHA-256 before extraction, and records the corresponding `gs10.08.0` source branch commit for provenance. The browser artifact exposes the upstream `gs` CLI rather than a reduced custom API.

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
git tag -a ghostscript-v0.7.2 -m "WASM Zoo Ghostscript v0.7.2"
git push origin ghostscript-v0.7.2
```

### Ghostscript browser API

```js
const gs = WasmZooGhostscript.loadHosted({
  baseUrl: "/assets/ghostscript/10.08.0/browser-full/"
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

Ghostscript's published binary is AGPL-3.0-or-later. The release handoff includes the exact official source archive, the Ghostscript license notice, a conservative bundled third-party license/copyright inventory, the build recipe and SHA-256 checksums. Automatic candidate builds are source-digest gated: the watcher resolves the exact official release archive, verifies its GitHub-published SHA-256 digest, and resolves the matching GhostPDL source commit before candidate substitution.


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
