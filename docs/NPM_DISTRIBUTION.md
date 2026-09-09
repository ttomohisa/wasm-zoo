# npm distribution

WASM Zoo v0.12.0 introduced npm distribution with `@wasm-zoo/jq`. WASM Zoo v0.13.0 completes the rollout across all six Zoo packages while keeping npm artifacts derived from the same reviewed immutable GitHub Release assets.

## Distribution contract

An npm package is not a second native/WebAssembly build. `scripts/prepare-npm-package.mjs` reads each package's `npm` metadata, starts from the immutable binary ZIP declared by the selected Zoo profile, preserves its core JavaScript/Wasm, manifests, provenance, SBOM, BUILDINFO and license notices, then overlays only the current reviewed distribution wrapper files:

- the package browser wrapper (`browser-*.js`);
- `wasm-zoo.mjs` Consumer API v1;
- generated bundler-aware `index.mjs`.

Historical GitHub Release assets are never rewritten. npm-only wrapper/package corrections use an independent npm distribution version while retaining the exact upstream version, Zoo builder version and immutable Release identity in package metadata.

## Published packages

| npm package | npm version | upstream | Zoo builder | source Release | state |
| --- | ---: | ---: | ---: | --- | --- |
| `@wasm-zoo/jq` | `0.9.1` | jq 1.8.2 | `0.9.0` | `jq-v0.9.0` | published |
| `@wasm-zoo/libarchive` | `0.3.1` | libarchive 3.8.9 | `0.3.1` | `libarchive-v0.3.1` | published |
| `@wasm-zoo/imagemagick` | `0.4.3` | ImageMagick 7.1.2-31 | `0.4.3` | `imagemagick-v0.4.3` | published |
| `@wasm-zoo/ghostscript` | `0.7.1` | Ghostscript 10.07.1 | `0.7.1` | `ghostscript-v0.7.1` | published |
| `@wasm-zoo/libvips` | `0.5.2` | libvips 8.18.6 | `0.5.2` | `libvips-v0.5.2` / `browser-core` | published |
| `@wasm-zoo/ffmpeg` | `0.2.7` | FFmpeg 9.0.1 | `0.2.7` | `ffmpeg-v0.2.7` / `browser-full` | published |

All six npm packages have completed their public Registry + Vite/Chromium gates. FFmpeg is intentionally pinned to the LGPL `browser-full` profile; the GPL/libx264 profile is not bundled into this package.

## Consumer usage

### jq

```bash
npm install @wasm-zoo/jq
```

```js
import { load } from "@wasm-zoo/jq";

const jq = await load();
try {
  const result = await jq.exec(["-M", "-c", ".", "/input.json"], {
    files: [{ name: "/input.json", data: new TextEncoder().encode('{"hello":"world"}') }]
  });
  console.log(result.stdout);
} finally {
  jq.dispose();
}
```

### libarchive

```bash
npm install @wasm-zoo/libarchive
```

```js
import { load } from "@wasm-zoo/libarchive";

const archive = await load({ tool: "bsdtar" });
try {
  const result = await archive.exec(["-xf", "/input.tar", "-C", "/out"], {
    files: [{ name: "/input.tar", data: tarBytes }],
    dirs: ["/out"],
    collectDirs: ["/out"]
  });
  console.log(result.files);
} finally {
  archive.dispose();
}
```

`libarchive` exposes the four published upstream CLI entry points through `load({ tool })`: `bsdtar`, `bsdcpio`, `bsdcat`, and `bsdunzip`.

### ImageMagick

```bash
npm install @wasm-zoo/imagemagick
```

```js
import { load } from "@wasm-zoo/imagemagick";

const magick = await load();
try {
  const result = await magick.exec(["/input.png", "-resize", "640x640>", "/out/output.jpg"], {
    files: [{ name: "/input.png", data: inputBytes }],
    dirs: ["/out"],
    outputs: ["/out/output.jpg"]
  });
  console.log(result.files[0]);
} finally {
  magick.dispose();
}
```

The npm distribution keeps the reviewed browser-full PNG/JPEG-focused feature set and does not add delegates that are absent from the immutable ImageMagick Release.

### Ghostscript

```bash
npm install @wasm-zoo/ghostscript
```

```js
import { load } from "@wasm-zoo/ghostscript";

const gs = await load();
try {
  const result = await gs.exec([
    "-dSAFER", "-dBATCH", "-dNOPAUSE",
    "-sDEVICE=pdfwrite", "-sOutputFile=/out/output.pdf", "/input.ps"
  ], {
    files: [{ name: "/input.ps", data: postScriptBytes }],
    dirs: ["/out"],
    outputs: ["/out/output.pdf"]
  });
  console.log(result.files[0]);
} finally {
  gs.dispose();
}
```

Ghostscript's WebAssembly binary is AGPL-3.0-or-later. The npm package preserves `LICENSE-Ghostscript.txt` and the complete reviewed `THIRD-PARTY-LICENSES/` directory from the immutable Release; consumers should review those notices before redistribution.

### libvips

```bash
npm install @wasm-zoo/libvips
```

```js
import { load } from "@wasm-zoo/libvips";

const runtime = await load();
try {
  const vips = runtime.api;
  const image = vips.Image.newFromBuffer(inputBytes);
  const resized = image.resize(0.5);
  const jpeg = resized.writeToBuffer(".jpg[Q=80]");
  resized.delete();
  image.delete();
  console.log(jpeg);
} finally {
  runtime.dispose();
}
```

The npm tarball bundles only the reviewed `browser-core` profile (JPEG/PNG/WebP). `load({ profile: "browser-full" })` is rejected by the npm entry rather than silently using browser-core assets under a browser-full label. libvips uses pthreads, so hosting must provide `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (or equivalent cross-origin isolation) so `SharedArrayBuffer` is available.

### FFmpeg

```bash
npm install @wasm-zoo/ffmpeg
```

```js
import { load } from "@wasm-zoo/ffmpeg";

const ffmpeg = await load();
try {
  const result = await ffmpeg.exec([
    "-i", "/input.mp4",
    "-c", "copy",
    "/output.mp4"
  ], {
    files: [{ name: "/input.mp4", data: inputBytes }],
    outputs: ["/output.mp4"]
  });
  console.log(result.files[0]);
} finally {
  ffmpeg.dispose();
}
```

`@wasm-zoo/ffmpeg` intentionally bundles only the LGPL `browser-full` profile. The repository's `browser-full-gpl` / libx264 build remains a separate immutable Release profile and is not silently mixed into the npm tarball. `load({ profile: "browser-full-gpl" })` is rejected. FFmpeg uses pthreads and therefore requires cross-origin isolation / `SharedArrayBuffer`, just like libvips.

## Bundler asset handling

The npm entry uses static `new URL(..., import.meta.url)` expressions for every core JavaScript/Wasm pair so modern bundlers can emit hashed production assets.

- jq, ImageMagick, Ghostscript, libvips and FFmpeg each forward one emitted `coreJsUrl` / `wasmUrl` pair into Consumer API v1. libvips maps the emitted JavaScript asset to its native `jsUrl` loader option.
- libarchive exports a per-tool asset map and forwards it as `toolAssets`, allowing each CLI Worker to use the actual emitted `*-core.js` and `*-core.wasm` URL instead of assuming unhashed filenames.
- Ghostscript also exercises recursive immutable-Release directory copying so the complete `THIRD-PARTY-LICENSES/` tree is retained in the npm tarball.

This is the same class of issue caught by the initial jq Vite production smoke, so the multi-tool libarchive wrapper is designed to avoid repeating that failure mode.

For manual/self-hosted deployments, import `<package>/self-hosted` and use the normal Consumer API v1 `baseUrl` contract.

## Package validation

```text
npm run npm:check
```

The contract test synthesizes the immutable-Release input shape for every npm-enabled package, generates a real package, runs `npm pack`, installs the resulting `.tgz` into a clean temporary project, and verifies:

- package name/version and immutable Release identity;
- current reviewed wrapper overlay;
- Consumer API v1 entrypoints;
- statically referenced bundler assets;
- runtime/Wasm/metadata/license files under `node_modules`;
- publishing workflow safety guards.

## Live registry validation

The generic live smoke is:

```text
npm run npm:smoke -- --slug jq
npm run npm:smoke -- --slug libarchive
npm run npm:smoke -- --slug imagemagick
npm run npm:smoke -- --slug ghostscript
npm run npm:smoke -- --slug libvips
npm run npm:smoke -- --slug ffmpeg
```

or the convenience scripts:

```text
npm run npm:smoke:jq
npm run npm:smoke:libarchive
npm run npm:smoke:imagemagick
npm run npm:smoke:ghostscript
npm run npm:smoke:libvips
npm run npm:smoke:ffmpeg
```

`scripts/smoke-npm-package.mjs` installs the exact public npm distribution into a clean app, uses pinned Vite and Playwright versions, performs a production build, checks the emitted Wasm asset count, serves `dist/` with an in-process Node HTTP server, executes the package in Chromium, closes browser/server resources, and emits an explicit cleanup marker.

The jq fixture performs a real JSON transformation. The libarchive fixture creates a TAR in the browser, extracts it with `bsdtar`, and verifies the returned file bytes. The ImageMagick fixture creates a PPM image in the browser, resizes it with the real `magick` CLI, writes PNG, then validates its PNG signature and 2×2 IHDR dimensions. The Ghostscript fixture generates PostScript in-browser, converts it to PDF with the real `pdfwrite` device, and validates `%PDF-` / `%%EOF` framing. The libvips fixture runs under COOP/COEP, decodes a real PNG through `runtime.api`, resizes 2×2 to 1×1, then validates JPEG and WebP output signatures. The FFmpeg fixture runs under COOP/COEP, feeds raw signed 16-bit PCM into the real `ffmpeg` CLI, writes a WAV through `pcm_s16le`, and validates RIFF/WAVE framing.

`.github/workflows/npm-package-smoke.yml` is manually selectable between jq, libarchive, ImageMagick, Ghostscript, libvips and FFmpeg. Pull-request and scheduled live-registry runs stay on the stable published jq package, while any package can be selected manually for a package-specific Registry regression.

## Publishing workflow

After v0.13.0, `.github/workflows/publish-npm.yml` has two manual modes:

- `pack` — generate, validate and upload the `.tgz`; no Registry write;
- `stage` — use npm Trusted Publisher OIDC and `npm stage publish` for an existing package version, followed by maintainer review and 2FA approval.

All six `@wasm-zoo/*` package names already exist on npm and have package-level Trusted Publishers configured. The temporary rollout bootstrap mode, direct `npm publish` path and rollout-only repository secret dependency have been removed. Future updates therefore use no long-lived npm publish credential in GitHub Actions.

The reviewed flow is:

1. prepare the npm package from the immutable Zoo Release asset;
2. run `pack` and inspect the generated artifact when desired;
3. run `stage`, authenticated by GitHub Actions OIDC;
4. review and approve the staged version with maintainer 2FA;
5. run the public Registry/Vite/Chromium smoke for the published version.

## Promotion interaction

npm distribution versions are independent from Zoo builder versions. A package-only wrapper correction can patch-bump npm without changing the native/Wasm build. A future reviewed upstream promotion still patch-bumps the npm distribution version independently so an npm version is never accidentally reused.

## Rollout completion

The v0.13.0 npm rollout completed in this order:

1. jq — published;
2. libarchive — published;
3. ImageMagick — published;
4. Ghostscript — published;
5. libvips — published;
6. FFmpeg — published.

Cross-browser compatibility work follows in v0.14.0 now that all six packages have a stable npm install path.
