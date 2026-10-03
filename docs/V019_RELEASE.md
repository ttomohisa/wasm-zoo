# WASM Zoo v0.19.0 — project release review

This project release records the reviewed **Brotli & 27-cell Registry Lab** work already merged into WASM Zoo since v0.18.0. The finalization PR itself is project-only: it changes the project version and release documentation, but it does **not** mutate any current package pin, Zoo builder version, immutable package GitHub Release, npm package version or Registry identity, and it does not authorize automatic publication.

## Included in v0.19.0

- Google Brotli 1.2.0 is the ninth available Zoo package. The reviewed build uses exact upstream tag `v1.2.0` / commit `028fb5a23661f123017c060daa546b55cf4bde29`, the upstream CMake `brotli` CLI target and zero Brotli source patches.
- `brotli-v0.1.0` is the immutable reviewed package Release, with checksum-covered binary/source/build metadata, provenance, CycloneDX SBOM and license material plus a published-only Playground and local preview stager.
- Stable Brotli releases use exact-tag/commit automatic candidates. Candidate success may prepare only a **review-only** promotion PR; human review remains required before merge, package tag, GitHub Release or npm publication.
- The exact immutable Release-derived `@wasm-zoo/brotli@0.1.0` canary tarball passed real Vite Chromium, Firefox and WebKit quality-11 compression, integrity testing and byte-identical decompression before the human first Registry publication.
- The reviewed Brotli Registry identity is `dist.shasum 6d66df90e8d472e5f2e24e1c1c1ec547ea6923a7`. The initial local human publish explicitly did not claim npm Registry-generated provenance; the package still includes the immutable Release-derived reviewed `provenance.json` and CycloneDX SBOM.
- With Brotli marked `npm.status: published`, manifest-driven Lab membership expands automatically from 8 packages / 24 cells to **9 packages / 27 browser-operation cells** without a package-name enrollment edit.
- ImageMagick advanced to 7.1.2-32 / Zoo builder 0.4.4 and `@wasm-zoo/imagemagick@0.4.4`, preserving its independently reviewed npm source identity and exact Registry SHA-1.
- libvips advanced to 8.18.7 / Zoo builder 0.5.3 and `@wasm-zoo/libvips@0.5.3`. Automatic candidate resolution remains fail-closed until the complete immutable adapter/Emscripten/compatibility input set is resolved.
- QPDF advanced to 12.4.2 / Zoo builder 0.1.1 and `@wasm-zoo/qpdf@0.1.1`, keeping package promotion and npm publication as separately reviewed steps.
- Candidate/promotion Issue reporting was hardened so the reporting job has the required Issue write permission and shell heredocs do not accidentally interpret Markdown backticks.
- The threaded Lab aggregate now consumes the exact resolver-selected threaded matrix, so prepublication npm PR deferrals do not become false missing-threaded-artifact failures.
- The reviewed-pin boundary is unchanged: automation may prepare review artifacts and promotion PRs, but it **never automatically merges, tags, creates a GitHub Release or publishes npm**.

## Reviewed pre-finalization evidence

The v0.19.0 finalization branch was created from reviewed main commit:

`6b524fb74bdc96893a98e43b4e07986a70821c95`

At that commit:

- Verify catalog run [#215](https://github.com/ttomohisa/wasm-zoo/actions/runs/37145588821) succeeded.
- Verify reported **9 package definitions**, **9 available package Playground stagers**, the npm distribution contract for all 9 public packages and the supply-chain metadata contract for 9 packages / 12 profiles.
- The shared automatic-promotion contract and synthetic rehearsal passed for all **9 automatic packages**. libvips used fail-closed immutable adapter resolution.
- Cross-browser Compatibility Lab run [#144](https://github.com/ttomohisa/wasm-zoo/actions/runs/37145588851) completed **29/29 workflow jobs** successfully: resolver + 27 exact-version browser-operation cells + threaded aggregate.
- Brotli passed Chromium, Firefox and WebKit as a live Registry-backed package in that Lab. The Chromium cell independently verified Registry SHA-1 `6d66df90e8d472e5f2e24e1c1c1ec547ea6923a7` before install and executed upstream Brotli CLI quality-11 compression, integrity test and decompression through Vite.
- The immutable Brotli npm regression workflow run [#4](https://github.com/ttomohisa/wasm-zoo/actions/runs/37145588849) succeeded on reviewed main.
- Brotli build run [#11](https://github.com/ttomohisa/wasm-zoo/actions/runs/37145588858) succeeded on reviewed main.
- Pages run [#195](https://github.com/ttomohisa/wasm-zoo/actions/runs/37145910791) succeeded after the reviewed main gates and published the current compatibility / Release Health snapshot.

These are pre-finalization observations only. After this PR is merged, the v0.19.0 tag decision must use the **newest reviewed-main** Verify/Lab/Pages evidence rather than reusing these older green results.

## Package identity freeze

The v0.19.0 finalization PR must not modify any `packages/<slug>/package.json`, builder `versions.env`, package Release tag, npm version or Registry identity. It records the already-reviewed current package set:

| Package | Upstream | Zoo builder | Package tag | npm |
| --- | --- | --- | --- | --- |
| FFmpeg | 9.0.2 | 0.2.8 | `ffmpeg-v0.2.8` | `@wasm-zoo/ffmpeg@0.2.8` |
| libarchive | 3.8.9 | 0.3.1 | `libarchive-v0.3.1` | `@wasm-zoo/libarchive@0.3.1` |
| ImageMagick | 7.1.2-32 | 0.4.4 | `imagemagick-v0.4.4` | `@wasm-zoo/imagemagick@0.4.4` |
| libvips | 8.18.7 | 0.5.3 | `libvips-v0.5.3` | `@wasm-zoo/libvips@0.5.3` |
| Ghostscript | 10.08.0 | 0.7.2 | `ghostscript-v0.7.2` | `@wasm-zoo/ghostscript@0.7.2` |
| jq | 1.8.2 | 0.9.0 | `jq-v0.9.0` | `@wasm-zoo/jq@0.9.1` |
| Zstandard | 1.5.7 | 0.3.0 | `zstd-v0.3.0` | `@wasm-zoo/zstd@0.3.0` |
| QPDF | 12.4.2 | 0.1.1 | `qpdf-v0.1.1` | `@wasm-zoo/qpdf@0.1.1` |
| Brotli | 1.2.0 | 0.1.0 | `brotli-v0.1.0` | `@wasm-zoo/brotli@0.1.0` |

## Review checklist (PowerShell 7)

Run this **only after** manually reviewing and merging the v0.19.0 finalization PR. Do not create the project tag from the PR branch.

```powershell
cd C:\Users\broth\Desktop\workspace\wasm-zoo
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git status --short

# Confirm the reviewed project version is consistent everywhere.
Get-Content VERSION
node -p "require('./package.json').version"
node -p "require('./site/catalog.json').project.version"

# Re-run deterministic project/release contracts from reviewed main.
npm run catalog
npm run check
npm run metadata:check
npm run promotion:rehearse
git diff --check
git status --short

# Confirm the newest reviewed-main evidence; do not reuse an older passing Lab.
gh run list --workflow verify.yml --branch main --limit 3
gh run list --workflow cross-browser-compat.yml --branch main --limit 3
gh run list --workflow pages.yml --branch main --limit 5
gh run list --workflow build-brotli.yml --branch main --limit 3
gh run list --workflow npm-brotli-canary.yml --branch main --limit 3
gh run list --workflow npm-qpdf-canary.yml --branch main --limit 3
gh run list --workflow npm-zstd-canary.yml --branch main --limit 3
```

Expected project version output is `0.19.0` in all three locations. `npm run catalog` must leave the working tree clean. The newest eligible main-branch Lab must contain the complete current **27-cell** exact-version browser evidence. At v0.19.0 finalization, the workflow topology used **29 successful jobs** including resolver and threaded aggregate. If a newer main run is pending or failed, do not reuse an older green snapshot.

## Project tag

The project tag remains a **human action after all post-merge gates are reviewed**:

```powershell
git ls-remote --tags origin refs/tags/v0.19.0

# Only if absent, and ONLY from the verified reviewed main commit:
git tag -a v0.19.0 -m "WASM Zoo v0.19.0 — Brotli & 27-cell Registry Lab"
git push origin v0.19.0
git ls-remote --tags origin refs/tags/v0.19.0
```

Do not create or move any package tag as part of this project release.

## Suggested GitHub Release

Create the GitHub **project** Release manually only after the tag above points at the reviewed finalization merge commit.

Title:

`WASM Zoo v0.19.0 — Brotli & 27-cell Registry Lab`

Suggested release notes:

### Ninth package: Brotli

- Add Google Brotli 1.2.0 as the ninth reviewed Zoo package using exact upstream tag/commit and the upstream CMake CLI target with zero Brotli source patches.
- Publish immutable package Release `brotli-v0.1.0` with checksum-covered binary/source/build metadata, provenance, SBOM and license material.
- Publish `@wasm-zoo/brotli@0.1.0` only after the exact Release-derived tarball passes real Chromium, Firefox and WebKit operations.
- Bind the live Registry package to reviewed `dist.shasum` `6d66df90e8d472e5f2e24e1c1c1ec547ea6923a7`.

### 27-cell Registry Lab

- Manifest-driven enrollment now covers nine public npm distributions.
- The production target is 27 real package/browser operations across Chromium, Firefox and WebKit.
- FFmpeg and libvips remain the two threaded distributions; the other seven packages are single-threaded.
- At v0.19.0 finalization, a complete run contained 29 workflow jobs: resolver + 27 operation cells + threaded aggregate. Later CI batching may reduce runner jobs without reducing the 27-cell evidence contract.

### Reviewed package updates since v0.18.0

- ImageMagick: 7.1.2-32 / builder 0.4.4 / npm 0.4.4.
- libvips: 8.18.7 / builder 0.5.3 / npm 0.5.3.
- QPDF: 12.4.2 / builder 0.1.1 / npm 0.1.1.
- Each npm identity remains tied to its separately reviewed immutable source Release and Registry SHA-1.

### Review-only automation

- All nine packages have automatic candidate contracts.
- Candidate success may prepare only a review-only promotion PR.
- libvips resolves its complete adapter/Emscripten/compatibility input set to immutable commits and fails closed otherwise.
- Candidate Issue reporting and threaded aggregate handling were hardened without weakening the human review boundary.

### Safety boundary

This finalization changes only project-level version/release documentation. It does not republish or retag any package. The maintainer still performs every merge, project/package tag, reviewed GitHub Release and npm publication action.
