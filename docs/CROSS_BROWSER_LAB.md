# Cross-browser Compatibility Lab (v0.14 rollout)

This lab tests **published npm packages**, not just WebAssembly instantiation. A clean temporary application installs the exact reviewed public npm version, creates a production Vite bundle, verifies its emitted Wasm assets, serves the bundle with an in-process HTTP server, and runs a real package operation in a Playwright browser.

## Phase 1: jq canary

The first rollout covers `@wasm-zoo/jq@0.9.1` (`browser-full`) in Chromium, Firefox, and WebKit. All three browsers use **the same** jq fixture already maintained in `scripts/smoke-npm-package.mjs` (JSON `select/map` transformation with a verified `[1,3]` result). Do not copy the fixture into a separate compatibility script.

Run locally (install Playwright's browser/system dependencies first as required by your OS):

```sh
node scripts/smoke-npm-package.mjs --slug jq --browser chromium --result-json compat-results/jq-chromium.json
node scripts/smoke-npm-package.mjs --slug jq --browser firefox --result-json compat-results/jq-firefox.json
node scripts/smoke-npm-package.mjs --slug jq --browser webkit --result-json compat-results/jq-webkit.json
```

## Phase 2: published single-threaded packages

The matrix also runs these existing production smoke fixtures without copying or weakening their assertions:

| Package | Exact public npm version | Real operation |
| --- | --- | --- |
| libarchive | `@wasm-zoo/libarchive@0.3.1` | `bsdtar` extracts a TAR archive and validates file contents |
| ImageMagick | `@wasm-zoo/imagemagick@0.4.3` | Resize PPM to 2×2 PNG; validate PNG signature and dimensions |
| Ghostscript | `@wasm-zoo/ghostscript@0.7.2` | Convert PostScript to PDF; validate PDF framing and output size |

Together with jq, this is a four-package × three-browser matrix (12 independent browser-operation results). These are *test targets*, not predeclared success claims: consult actual CI run results and uploaded JSON artifacts to establish compatibility.

Example for one of the new targets:

```sh
node scripts/smoke-npm-package.mjs --slug libarchive --browser firefox --result-json compat-results/libarchive-firefox.json
node scripts/smoke-npm-package.mjs --slug imagemagick --browser webkit --result-json compat-results/imagemagick-webkit.json
node scripts/smoke-npm-package.mjs --slug ghostscript --browser chromium --result-json compat-results/ghostscript-chromium.json
```

To request Playwright system dependencies on a supported Linux runner, set `WASM_ZOO_PLAYWRIGHT_WITH_DEPS=1`. `--browser` defaults to `chromium`, preserving the existing published npm smoke command for **all six packages**. Threaded FFmpeg and libvips remain Chromium-only until their separate cross-browser rollouts are reviewed.

The separate `.github/workflows/cross-browser-compat.yml` runs 12 package/browser jobs independently on relevant PRs, weekly, and via manual dispatch (at most four simultaneously). Each job uploads its own JSON result artifact even if the package operation fails, provided the runner was able to write it. The existing `npm-package-smoke.yml` stays in place.

## Per-browser JSON contract (schemaVersion 1)

One result file is produced for each browser invocation. Example **shape**, not a claim of a successful live test:

```json
{
  "schemaVersion": 1,
  "package": "jq",
  "npmPackage": "@wasm-zoo/jq",
  "npmVersion": "0.9.1",
  "profile": "browser-full",
  "browser": "firefox",
  "browserVersion": null,
  "status": "fail",
  "testedAt": "2026-01-01T00:00:00.000Z",
  "phase": "browser-operation",
  "detail": null,
  "reason": "example error, if a test fails",
  "runtimeRequirements": {
    "sharedArrayBuffer": false,
    "crossOriginIsolated": false
  }
}
```

* `pass`: published npm package built and executed the expected real operation.
* `fail`: the run did not complete successfully. `phase` and `reason` distinguish npm install, bundle build, browser installation/launch, HTTP server, and real operation errors. An infrastructure failure is **not** automatically a package regression.
* `unsupported` and `not-tested`: reserved for later rollout and aggregation. Do not guess `unsupported` just because a single browser test failed.

A passing run includes `browserVersion`, the operation's `detail`, `phase: "complete"`, and a null `reason`. `testedAt` is recorded at completion. The CI matrix is the source of live results; do not publish example JSON or assume green status for browsers that have not completed an actual run.

## Rollout boundaries

1. Keep all single-threaded package/browser results grounded in real CI runs. A failed browser test is not automatically `unsupported`.
2. Separately test threaded FFmpeg and libvips profiles with explicit SharedArrayBuffer, COOP/COEP, and cross-origin isolation checks. Distinguish environment `unsupported` from package `fail` using evidenced capability checks.
3. Publish an aggregated machine-readable catalog compatibility matrix / Pages presentation only after the per-browser result contract has been proven. Do not edit reviewed upstream pins or package builder/npm versions for lab-only changes.

The reviewed-pin model is unchanged: automation may prepare review-only promotion PRs but must never merge, tag, release, or publish on its own. libvips remains adapter-gated (5/6 automatic, not 6/6).
