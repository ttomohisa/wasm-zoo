# WASM Zoo v0.17.0 — project release review

This project release records the reviewed **QPDF package/npm rollout and 24-cell Registry-backed browser evidence** already merged into the project. It does **not** change any package's reviewed upstream pin, Zoo builder version, npm version or immutable package GitHub Release, and it does not authorize automatic publication.

## Included in v0.17.0

- QPDF 12.4.1 is the eighth available Zoo package, built from the official `qpdf-12.4.1.tar.gz` source release with exact upstream commit `c37f83ae468abb6cc741f43b2f6fdeb66e550ffb`, Emscripten 6.0.8, zlib 1.3.2 and libjpeg 9f identities pinned and carried through the reviewed `qpdf-v0.1.0` Release.
- The immutable QPDF Release keeps checksum-covered binary/source assets, in-toto/SLSA provenance, CycloneDX SBOM and QPDF/zlib/libjpeg notices. The QPDF Playground is staged only from that published, checksum-verified Release.
- The separately reviewed Phase 4A npm tarball passed real Vite operations in Chromium, Firefox and WebKit before the maintainer manually created the package name. Public `@wasm-zoo/qpdf@0.1.0` reports Registry `dist.shasum` `83b2a89ec339d58ab0dcaf3c118385c3396955f1`, matching that exact reviewed tarball.
- QPDF is now `npm.status: published`. Future QPDF npm-only versions use the existing Trusted Publisher / staged-review flow; the initial local human publication is not represented as an npm Registry-generated provenance attestation.
- The production Cross-browser Compatibility Lab is now **8 npm packages × Chromium/Firefox/WebKit = 24 exact-version real browser-operation cells**. The reviewed-main run [36094338167](https://github.com/ttomohisa/wasm-zoo/actions/runs/36094338167) completed all 24 operation cells successfully, and Pages run [36094660101](https://github.com/ttomohisa/wasm-zoo/actions/runs/36094660101) published a `verified` snapshot with 24 passes sourced from main commit `f1ff7730e3843b9e32e05f91343da322b139f4ad`.
- QPDF stable-release discovery now participates in the same review-only automatic candidate model as the other packages. Candidate success may prepare a promotion PR, but package promotion, npm publication and project/package tags remain human-controlled.
- libvips remains automatic but **fail-closed** around its adapter contract: the wasm-vips adapter, Emscripten source and compatibility inputs must resolve to immutable commits before candidate testing can advance.
- The reviewed-pin boundary is unchanged: automation may create a review-only promotion PR, but it **never automatically merges, tags, creates a GitHub Release or publishes npm**.

## Review checklist (PowerShell 7)

Run this **only after** manually reviewing and merging the v0.17.0 finalization PR. Do not create the project tag from a PR branch.

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

# Re-run deterministic repository/release contracts from reviewed main.
npm run catalog
npm run check
npm run metadata:check
npm run promotion:rehearse
git diff --check
git status --short

# Confirm QPDF Registry identity and the newest reviewed-main evidence.
npm view @wasm-zoo/qpdf@0.1.0 name version dist.shasum --json --registry=https://registry.npmjs.org/
gh run list --workflow verify.yml --branch main --limit 3
gh run list --workflow cross-browser-compat.yml --branch main --limit 3
gh run list --workflow npm-qpdf-canary.yml --branch main --limit 3
gh run list --workflow build-qpdf.yml --branch main --limit 3
gh run list --workflow pages.yml --branch main --limit 5
```

The generated catalog must remain clean after `npm run catalog`. The QPDF Registry `dist.shasum` must remain `83b2a89ec339d58ab0dcaf3c118385c3396955f1`. The latest eligible main-branch Lab must provide all 24 exact-version results; if a newer run is pending or failed, do not reuse older green evidence. The Pages publisher must continue to fail closed rather than presenting stale compatibility results.

## Optional project tag

The project tag is a **human action after all post-merge gates are reviewed**:

```powershell
git ls-remote --tags origin refs/tags/v0.17.0

# Only if absent, and ONLY from the verified reviewed main commit:
git tag -a v0.17.0 -m "WASM Zoo v0.17.0 — QPDF release, npm and 24-cell Lab"
git push origin v0.17.0
```

Optionally create a matching GitHub **project** release manually after reviewing `CHANGELOG.md`. Do not recreate `qpdf-v0.1.0`, do not republish `@wasm-zoo/qpdf@0.1.0`, and do not change a reviewed package pin merely because the project version changed.
