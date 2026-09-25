# Cross-browser Compatibility Lab (v0.14 baseline through v0.18 manifest-driven operations)

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

To request Playwright system dependencies on a supported Linux runner, set `WASM_ZOO_PLAYWRIGHT_WITH_DEPS=1`. `--browser` defaults to `chromium`, preserving the existing published npm smoke command for **all six packages**. The threaded FFmpeg/libvips test targets and their capability policy are described in Phase 3 below.

The separate `.github/workflows/cross-browser-compat.yml` runs the current published package/browser jobs independently on relevant PRs, weekly, and via manual dispatch. Package membership is resolved from reviewed manifests at runtime rather than copied into a YAML allowlist. Each job uploads its own JSON result artifact even if the package operation fails, provided the runner was able to write it. The existing `npm-package-smoke.yml` stays in place as an independent Chromium baseline.

## Phase 3: threaded FFmpeg and libvips

Run the existing **real-operation** npm fixtures in Chromium, Firefox, and WebKit for `@wasm-zoo/ffmpeg@0.2.8` (LGPL `browser-full`) and `@wasm-zoo/libvips@0.5.2` (`browser-core`, using its actual Embind API, **not** a made-up CLI). The FFmpeg fixture converts raw PCM to a RIFF/WAVE file; the libvips fixture resizes an image and checks JPEG/WebP output. These 6 tests are separate from the 12 single-threaded cases, for 18 total browser cells. Package versions and reviewed upstream pins are unchanged.

Each threaded test verifies three **actual served HTTP response headers** (`COOP: same-origin`, `COEP: require-corp`, `CORP: same-origin`) plus a browser capability probe injected before the application module: secure context, `crossOriginIsolated`, `SharedArrayBuffer`, Web Worker, WebAssembly and a constructible shared WebAssembly memory. Do not assume the server headers imply a browser supports threads.

The JSON `status` is assigned according to observed evidence:
- `pass` requires every preflight capability **and** the package's verified real operation.
- `unsupported` requires correct harness headers, a complete browser probe and an explicitly absent required capability. The browser version, measured flags and precise reason are recorded. A package operation exception, npm/Vite failure, missing probe or bad header is always `fail`, never `unsupported`.
- `fail` rejects the CI cell. Chromium is a mandatory tested baseline for each threaded package: `--on-unsupported record` is forbidden for Chromium. Firefox/WebKit have an explicit `--on-unsupported record` policy so genuinely missing capabilities are visible as `unsupported` instead of falsely claiming a package regression.

The separate `threaded-report` job downloads the complete manifest-derived threaded result set, rechecks reported browser capabilities and npm versions, rejects missing/incorrect results and *all* unsupported Chromium results, and publishes an aggregate JSON artifact and GitHub Actions step-summary table. An **unsupported** Firefox/WebKit cell remains visibly unsupported, not a pass claim. A failed or missing cell fails CI. The original 12-cell single-threaded job and existing published Chromium smoke remain in place.

Examples:

```sh
node scripts/smoke-npm-package.mjs --slug ffmpeg --browser chromium --result-json compat-results/ffmpeg-chromium.json
node scripts/smoke-npm-package.mjs --slug libvips --browser firefox --on-unsupported record --result-json compat-results/libvips-firefox.json
node --test scripts/test-threaded-browser-capabilities.mjs
node scripts/report-threaded-compatibility.mjs compat-results
```

## Phase 4: observed public compatibility matrix (project v0.14.0)

After human approval merges a reviewed Lab PR, the Lab also runs on relevant **main** pushes (as well as PRs, weekly schedules and manual dispatch). The Pages workflow regenerates the public dashboard after each completed main-branch Lab run. A PR-only CI pass is **not** silently promoted to a published live result.

`scripts/publish-browser-compatibility.mjs` uses the read-only GitHub Actions token to select the **latest main-branch Lab run**, including failed or in-progress runs. It never falls back to an older green run after a newer run fails or starts. The historical v0.14 rollout required 18 artifacts for the original six packages and v0.15 required 21 after Zstandard. The current v0.17 QPDF rollout requires a completed, successful main run with **24 authentic individual JSON artifacts**, matching all eight reviewed npm package versions/profiles, complete real-operation results and correct threaded preflight before anything is displayed as verified. Results must be no older than 14 days. If any required artifact is missing, altered, stale or version-mismatched, the generated site file is **unavailable with all 24 cells marked not-tested**, not a partial or fabricated PASS table. The client also refuses to display verified results older than 14 days without a fresh deployment.

Starting with the v0.18 operations work, the expected package set and expected result count are derived from every available manifest with `npm.status: published`. The selected `npm.profile` decides whether the package enters the single-threaded or threaded matrix. The current v0.17 release therefore remains 8 packages / 24 cells, while a ninth published package automatically expands the required public evidence to 27 cells without editing an allowlist.

The generated `site/browser-compatibility.json` is produced by Pages, not checked in as a permanent snapshot. Each verified file includes source run ID/URL/SHA and tested npm/browser versions with per-cell status. When GitHub APIs or artifacts are unavailable, the Pages build can still proceed with an explicit unavailable snapshot. Reviewers can use the Actions workflow summary and uploaded source artifacts to investigate.

Validate snapshot classification rules with:

```sh
node --test scripts/test-browser-compatibility-snapshot.mjs
npm run check
npm run metadata:check
```

The original v0.14.0, v0.15.0 and v0.17.0 rollouts are released. v0.17.0 added the separately human-published QPDF npm distribution and established the 24-cell reviewed-main baseline. Only the human maintainer merges and creates project/package release tags after reviewing updated main-branch Lab and Pages evidence. No candidate automation, CI job or Pages deployment auto-merges, tags, publishes or changes reviewed pins. Cross-browser results apply to each package's listed npm profile, not necessarily every release ZIP profile; FFmpeg's GPL variant and libvips's full profile are not included in the npm test matrix.

## Phase 5: v0.15.0 — Zstandard published Registry / 21-cell expansion

The separately reviewed Phase 4B promotion adds the manually published `@wasm-zoo/zstd@0.3.0` original upstream `browser-full` CLI to the existing **single-threaded** matrix, alongside jq, libarchive, ImageMagick and Ghostscript. Its real Vite operations test standard `.zst` frame magic, compressibility, byte-identical decompression and invalid-frame rejection in Chromium, Firefox and WebKit. A live Registry `dist.shasum` comparison to the initial human-published artifact (`29add1aaf6ab0c3e9a3d538166a51a3f70cefa99`) runs **before** these operations. This does not imply coverage for the separately published Zstandard `browser-core` library.

The full matrix becomes **5 single-threaded packages × 3 browsers + 2 threaded packages × 3 browsers = 21 real browser-operation cells**. PR-only results are gates, not public evidence. Pages publishes all 21 as verified only after the latest eligible, successful, fresh **reviewed main** workflow provides all exact-version results; old 18-cell results and synthetic fixtures must not be represented as fresh 21-cell success. Missing or failed evidence produces an unavailable snapshot. The existing strict threaded support classifications are unchanged.

Use the same runner for the live Registry check:

```sh
node scripts/smoke-npm-package.mjs --slug zstd --browser chromium --result-json compat-results/zstd-chromium.json
node scripts/smoke-npm-package.mjs --slug zstd --browser firefox --result-json compat-results/zstd-firefox.json
node scripts/smoke-npm-package.mjs --slug zstd --browser webkit --result-json compat-results/zstd-webkit.json
```

## Phase 6: v0.17 — QPDF published Registry / 24-cell expansion

The reviewed QPDF Phase 4A canary produced one immutable Release-derived `@wasm-zoo/qpdf@0.1.0` tarball and ran it through real Vite operations in Chromium, Firefox and WebKit. The maintainer then published that exact tarball manually. npm Registry `dist.shasum` `83b2a89ec339d58ab0dcaf3c118385c3396955f1` matches the reviewed artifact.

QPDF joins the single-threaded matrix alongside jq, libarchive, ImageMagick, Ghostscript and Zstandard. Its live Registry test verifies the recorded SHA-1 before installation, then performs structural `--check`, linearization, AES-256 encryption, decryption and final structural validation through the upstream QPDF CLI.

The full matrix is now **6 single-threaded packages × 3 browsers + 2 threaded packages × 3 browsers = 24 real browser-operation cells**. A public verified snapshot requires all 24 exact-version results from the latest eligible successful reviewed-`main` run. Older 21-cell evidence cannot satisfy the current contract.

```sh
node scripts/smoke-npm-package.mjs --slug qpdf --browser chromium --result-json compat-results/qpdf-chromium.json
node scripts/smoke-npm-package.mjs --slug qpdf --browser firefox --result-json compat-results/qpdf-firefox.json
node scripts/smoke-npm-package.mjs --slug qpdf --browser webkit --result-json compat-results/qpdf-webkit.json
```

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
* `unsupported`: Phase 3 only, for a confirmed absent threaded-runtime capability with correct harness headers and a complete probe. It is not a synonym for an unexplained browser failure. `not-tested` in the aggregate means the expected result artifact was missing and fails CI.

A passing run includes `browserVersion`, the operation's `detail`, `phase: "complete"`, and a null `reason`. Threaded records additionally include `runtimeCapabilities` and `responseHeaders` for independent validation; these are null for the single-threaded fixtures. `testedAt` is recorded at completion. The CI matrix is the source of live results; do not publish example JSON or assume green status for browsers that have not completed an actual run.

## Rollout boundaries

1. Keep all single-threaded package/browser results grounded in real CI runs. A failed browser test is not automatically `unsupported`.
2. Require review of the measured Phase 3 threaded-platform statuses (not merely green workflow labels). Revisit browsers recorded unsupported when their relevant platform capabilities change.
3. Publish a versioned catalog compatibility matrix / Pages presentation only after the per-browser results have been reviewed. Do not edit reviewed upstream pins or package builder/npm versions for lab-only changes.

The reviewed-pin model is unchanged: automation may prepare review-only promotion PRs but must never merge, tag, release, or publish on its own. QPDF brings the current automatic-candidate set to 8/8; libvips remains fail-closed by resolving its adapter and compatibility inputs to immutable commits before candidate testing rather than using the former adapter-gated manual mode.
