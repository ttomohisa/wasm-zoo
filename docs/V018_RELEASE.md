# WASM Zoo v0.18.0 — project release review

This project release records the reviewed **Manifest-driven Operations** work already merged into WASM Zoo. It does **not** change any package's reviewed upstream pin, Zoo builder version, npm version, immutable package GitHub Release or Registry identity, and it does not authorize automatic publication.

## Included in v0.18.0

- Published npm operational membership is manifest-driven. The generic npm workflow accepts a manifest-validated slug, and the Cross-browser Compatibility Lab derives its package membership and threaded classification from reviewed package metadata rather than an eight-package enrollment list.
- Candidate orchestration centralizes automatic-package registration validation, selected-job result routing and promotion repository-checker resolution while retaining explicit package-specific candidate build jobs where source/profile/smoke semantics differ.
- Successful automatic candidates still create **review-only** promotion PRs. The promotion PR now embeds a generated post-merge human handoff, and a merged `automation/promote-*` PR receives a confirmed comment with the reviewed merge SHA and exact manual follow-up commands.
- The human handoff never performs merge, package tag, GitHub Release or npm publication. QPDF and Zstandard retain their `keepNpmPinned` behavior so package promotion cannot silently move their separately reviewed npm source identity.
- Release Health schema 2 adds live npm Registry alignment to the existing Release/Playground/freshness/supply-chain checks. It records the reviewed npm version, source Release, Registry exact/latest version, live `dist.shasum`, follow-up state and intentional pin state.
- Release Health treats a deliberate `keepNpmPinned` mismatch as a visible separate-review warning rather than a broken package Release; unreviewed source drift or a recorded Registry SHA mismatch remains an error.
- Local Playground staging now covers all eight available packages, including QPDF. `npm run check` derives every available Playground package from manifests and fails if any one lacks a registered local stager.
- The reviewed-pin boundary remains unchanged: automation may create review-only PRs and explanatory comments, but it **never automatically merges, tags, creates a GitHub Release or publishes npm**.

## Reviewed pre-finalization evidence

The v0.18.0 finalization branch was created from reviewed main commit:

`955a825771617b6ec3a3ca541ca788e64013e0e6`

At that commit:

- Verify catalog run [#168](https://github.com/ttomohisa/wasm-zoo/actions/runs/36158642031) succeeded.
- The local-preview contract reported **8 available package stagers registered**.
- The shared automatic-promotion rehearsal passed for all **8 automatic packages**, including libvips fail-closed immutable adapter resolution.
- Cross-browser Compatibility Lab run [#99](https://github.com/ttomohisa/wasm-zoo/actions/runs/36158641993) completed **26/26 workflow jobs** successfully: resolver + 24 exact-version browser-operation cells + threaded aggregate.
- QPDF passed Chromium, Firefox and WebKit in that Lab.
- Pages run [#152](https://github.com/ttomohisa/wasm-zoo/actions/runs/36159156884) succeeded after the Lab and published the current main-branch compatibility / Release Health snapshot.
- Release Health schema 2 reported all 8 reviewed npm distributions aligned with no npm follow-up, intentional-pin or Registry identity errors at that time.

These are pre-finalization observations only. After the finalization PR is merged, the release decision must use the **newest reviewed-main** Verify/Lab/Pages runs rather than reusing these older green results.

## Package identity freeze

v0.18.0 is a project-only release. The finalization PR must not mutate any `packages/<slug>/package.json`, builder `versions.env`, package release tag, npm package version or npm Registry identity.

The current package set remains independently versioned:

| Package | Upstream | Zoo builder | Package tag | npm |
| --- | --- | --- | --- | --- |
| FFmpeg | 9.0.2 | 0.2.8 | `ffmpeg-v0.2.8` | `@wasm-zoo/ffmpeg@0.2.8` |
| libarchive | 3.8.9 | 0.3.1 | `libarchive-v0.3.1` | `@wasm-zoo/libarchive@0.3.1` |
| ImageMagick | 7.1.2-31 | 0.4.3 | `imagemagick-v0.4.3` | `@wasm-zoo/imagemagick@0.4.3` |
| libvips | 8.18.6 | 0.5.2 | `libvips-v0.5.2` | `@wasm-zoo/libvips@0.5.2` |
| Ghostscript | 10.08.0 | 0.7.2 | `ghostscript-v0.7.2` | `@wasm-zoo/ghostscript@0.7.2` |
| jq | 1.8.2 | 0.9.0 | `jq-v0.9.0` | `@wasm-zoo/jq@0.9.1` |
| Zstandard | 1.5.7 | 0.3.0 | `zstd-v0.3.0` | `@wasm-zoo/zstd@0.3.0` |
| QPDF | 12.4.1 | 0.1.0 | `qpdf-v0.1.0` | `@wasm-zoo/qpdf@0.1.0` |

## Review checklist (PowerShell 7)

Run this **only after** manually reviewing and merging the v0.18.0 finalization PR. Do not create the project tag from a PR branch.

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
gh run list --workflow npm-qpdf-canary.yml --branch main --limit 3
gh run list --workflow npm-zstd-canary.yml --branch main --limit 3
```

Expected project version output is `0.18.0` in all three locations. `npm run catalog` must leave the working tree clean. The newest eligible main-branch Lab must contain the full current 24-cell exact-version browser evidence; if a newer run is pending or failed, do not reuse an older green snapshot.

## Project tag

The project tag remains a **human action after all post-merge gates are reviewed**:

```powershell
git ls-remote --tags origin refs/tags/v0.18.0

# Only if absent, and ONLY from the verified reviewed main commit:
git tag -a v0.18.0 -m "WASM Zoo v0.18.0 — Manifest-driven Operations"
git push origin v0.18.0
git ls-remote --tags origin refs/tags/v0.18.0
```

Do not create or move any package tag as part of this project release.

## Suggested GitHub Release

Create the GitHub **project** Release manually only after the tag above points at the reviewed finalization merge commit.

Title:

`WASM Zoo v0.18.0 — Manifest-driven Operations`

Suggested release notes:

### Manifest-driven operations

- npm workflow enrollment and the browser compatibility matrices now derive published package membership from reviewed manifests.
- Candidate registration/result/checker routing is centralized while package-specific candidate build semantics remain explicit.
- The current production browser target remains 24 real package/browser operations across eight public npm distributions.

### Reviewed promotion handoff

- Automatic candidate success may create a review-only promotion PR.
- Promotion PRs now include a generated human handoff.
- After a real promotion merge, a comment-only workflow posts the confirmed merge SHA and the exact manual tag/Release/npm follow-up.
- Automation still never merges, tags, creates reviewed Releases or publishes npm.

### npm-aware Release Health

- Release Health schema 2 checks reviewed npm versions against the live Registry.
- It records source Release identity, exact/latest Registry versions and live `dist.shasum`.
- Intentional QPDF/Zstandard npm pins are surfaced as separate-review state rather than false package-release failures.
- Unexpected source drift or recorded Registry SHA mismatch is treated as an error.

### Local preview parity

- All eight available package Playgrounds now have local stagers.
- QPDF local staging rejects stale builds whose upstream version/commit or builder version differs from reviewed pins.
- CI prevents future available Playground packages from being omitted from local staging.

### Safety boundary

This project release changes only project-level version/release documentation. Existing package pins, builder versions, immutable package Releases and npm versions remain unchanged. The maintainer still performs every merge, project/package tag, reviewed GitHub Release and npm publication action.
