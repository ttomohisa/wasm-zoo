# npm distribution

WASM Zoo v0.12.0 introduced npm distribution with `@wasm-zoo/jq`. The v0.13 rollout generalizes that canary infrastructure so additional Zoo packages can be distributed from the same reviewed GitHub Release assets. The second package is `@wasm-zoo/libarchive`; the third rollout target is `@wasm-zoo/imagemagick`.

## Distribution contract

An npm package is not a second native/WebAssembly build. `scripts/prepare-npm-package.mjs` reads each package's `npm` metadata, starts from the immutable binary ZIP declared by the selected Zoo profile, preserves its core JavaScript/Wasm, manifests, provenance, SBOM, BUILDINFO and license notices, then overlays only the current reviewed distribution wrapper files:

- the package browser wrapper (`browser-*.js`);
- `wasm-zoo.mjs` Consumer API v1;
- generated bundler-aware `index.mjs`.

Historical GitHub Release assets are never rewritten. npm-only wrapper/package corrections use an independent npm distribution version while retaining the exact upstream version, Zoo builder version and immutable Release identity in package metadata.

## Current rollout

| npm package | npm version | upstream | Zoo builder | source Release | state |
| --- | ---: | ---: | ---: | --- | --- |
| `@wasm-zoo/jq` | `0.9.1` | jq 1.8.2 | `0.9.0` | `jq-v0.9.0` | public canary |
| `@wasm-zoo/libarchive` | `0.3.1` | libarchive 3.8.9 | `0.3.1` | `libarchive-v0.3.1` | published |
| `@wasm-zoo/imagemagick` | `0.4.3` | ImageMagick 7.1.2-31 | `0.4.3` | `imagemagick-v0.4.3` | rollout canary |

jq and libarchive have completed their Registry + Vite/Chromium gates. ImageMagick now exercises the same generic single-core path before the remaining packages are added.

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

## Bundler asset handling

The npm entry uses static `new URL(..., import.meta.url)` expressions for every core JavaScript/Wasm pair so modern bundlers can emit hashed production assets.

- jq and ImageMagick each forward one emitted `coreJsUrl` / `wasmUrl` pair into Consumer API v1.
- libarchive exports a per-tool asset map and forwards it as `toolAssets`, allowing each CLI Worker to use the actual emitted `*-core.js` and `*-core.wasm` URL instead of assuming unhashed filenames.

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
```

or the convenience scripts:

```text
npm run npm:smoke:jq
npm run npm:smoke:libarchive
npm run npm:smoke:imagemagick
```

`scripts/smoke-npm-package.mjs` installs the exact public npm distribution into a clean app, uses pinned Vite and Playwright versions, performs a production build, checks the emitted Wasm asset count, serves `dist/` with an in-process Node HTTP server, executes the package in Chromium, closes browser/server resources, and emits an explicit cleanup marker.

The jq fixture performs a real JSON transformation. The libarchive fixture creates a TAR in the browser, extracts it with `bsdtar`, and verifies the returned file bytes. The ImageMagick fixture creates a PPM image in the browser, resizes it with the real `magick` CLI, writes PNG, then validates its PNG signature and 2×2 IHDR dimensions.

`.github/workflows/npm-package-smoke.yml` is manually selectable between jq, libarchive and ImageMagick. Pull-request and scheduled live-registry runs stay on the stable published jq package; a new rollout package is run manually immediately after its first registry bootstrap before it is promoted from `canary` to `published`.

## Publishing workflow

`.github/workflows/publish-npm.yml` has three manual modes during the multi-package rollout:

- `pack` — generate, validate and upload the `.tgz`; no registry write;
- `bootstrap` — direct-publish a **brand-new package name only** using the temporary `NPM_BOOTSTRAP_TOKEN` secret;
- `stage` — use npm Trusted Publisher OIDC and `npm stage publish` for an existing package version, followed by maintainer review and 2FA approval.

npm staged publishing cannot create a brand-new package. Therefore each new `@wasm-zoo/*` package requires one bootstrap direct publish before its package-level Trusted Publisher can be configured. The workflow guards bootstrap by checking that the package name does not already exist; once it exists, bootstrap fails and all future releases use staged publishing.

### Temporary rollout bootstrap token

For the remaining brand-new package names, use one short-lived granular token scoped to `@wasm-zoo` with package read/write permission and bypass-2FA enabled only for this bootstrap window. Store it as the repository secret:

```text
NPM_BOOTSTRAP_TOKEN
```

The token is used only by the explicit `bootstrap` step. `pack` never reads it and `stage` uses OIDC instead.

After a package's first publish:

1. configure its npm Trusted Publisher for GitHub `ttomohisa/wasm-zoo`, workflow `publish-npm.yml`;
2. allow staged publishing rather than direct publishing;
3. set package publishing access to require 2FA and disallow traditional tokens;
4. run the package's public Registry/Vite/Chromium smoke;
5. continue future versions through `stage` only.

After all six package names have been bootstrapped, revoke the rollout token, remove `NPM_BOOTSTRAP_TOKEN`, and remove the bootstrap mode from the workflow.

## Promotion interaction

npm distribution versions are independent from Zoo builder versions. A package-only wrapper correction can patch-bump npm without changing the native/Wasm build. A future reviewed upstream promotion still patch-bumps the npm distribution version independently so an npm version is never accidentally reused.

## Rollout order

The intended order is:

1. jq — completed canary;
2. libarchive — completed generic multi-tool CLI rollout;
3. ImageMagick — current single-core CLI rollout;
4. Ghostscript;
5. libvips — library API case;
6. FFmpeg — multi-profile / pthread / SharedArrayBuffer case.

Cross-browser expansion follows after all six have a stable npm install path.
