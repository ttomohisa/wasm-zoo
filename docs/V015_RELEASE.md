# WASM Zoo v0.15.0 — project release review

This project release records **work already published and verified**. It does **not** change a package's reviewed upstream pin, builder version, npm version or immutable GitHub Release asset, and it does not authorize automated publication.

## Included in v0.15.0

- Official Zstandard **1.5.7** with both `browser-core` (bounded original libzstd one-shot C API) and `browser-full` (original upstream `zstd` CLI with isolated Worker/MEMFS, no pthreads or SharedArrayBuffer) profiles.
- Manually released **`zstd-v0.3.0`**, retaining its exact reviewed source/toolchain pins, binary/source archives, SHA256SUMS, standalone provenance and CycloneDX SBOM.
- Human-approved public npm **`@wasm-zoo/zstd@0.3.0`**, using `browser-full` only, with reviewed tarball SHA-1 **`29add1aaf6ab0c3e9a3d538166a51a3f70cefa99`**. The included in-toto/SLSA `provenance.json` is not an npm Registry-generated attestation for the initial manually published tarball.
- Registry-backed production Vite/Playwright **7 packages × Chromium/Firefox/WebKit = 21 observed browser operations**, sourced only from successful fresh reviewed-`main` CI. The first complete 21-cell main-branch run was [35892116956](https://github.com/ttomohisa/wasm-zoo/actions/runs/35892116956), and [Pages run 35892710843](https://github.com/ttomohisa/wasm-zoo/actions/runs/35892710843) reported `verified (21 real passes)`. These are dated release evidence, not a promise about future runs.
- Existing review-only promotion behavior remains unchanged. Zstandard `candidateMode` is still `none` until a **separate** reviewed adapter/automation PR; libvips remains `adapter-gated`.

## Review checklist (PowerShell 7)

Do this **only after** reviewing and manually merging the v0.15.0 project-version PR. Do not release from a PR branch or assume that a green PR run is public main evidence.

```powershell
cd C:\Users\broth\Desktop\workspace\wasm-zoo
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git status --short

# Confirm the reviewed v0.15.0 commit is now on main.
Get-Content VERSION
node -p "require('./package.json').version"
node -p "require('./site/catalog.json').project.version"
npm run catalog
npm run check
npm run metadata:check

# Inspect the latest main runs. Confirm the seven-package matrix has 21 authentic
# operation artifacts and Pages regenerated the verified snapshot from that main run.
gh run list --workflow verify.yml --branch main --limit 3
gh run list --workflow cross-browser-compat.yml --branch main --limit 3
gh run list --workflow pages.yml --branch main --limit 5
npm view @wasm-zoo/zstd@0.3.0 dist.shasum
```

The npm `dist.shasum` must match `29add1aaf6ab0c3e9a3d538166a51a3f70cefa99`. If the latest main Lab is pending, failed or unavailable, **do not** treat the older 21/21 run as current; the Pages compatibility publisher fails closed.

The optional **project-only tag** is a human action after confirming all gates:

```powershell
# Check the project tag has not already been created.
git ls-remote --tags origin refs/tags/v0.15.0
# Only if absent, and ONLY from the verified reviewed main commit:
git tag -a v0.15.0 -m "WASM Zoo v0.15.0 — Zstandard official release, npm and 21-cell Lab"
git push origin v0.15.0
```

Optionally create the corresponding GitHub project release manually after reviewing `CHANGELOG.md`. **Do not** re-create `zstd-v0.3.0`, re-publish `@wasm-zoo/zstd@0.3.0`, enable automatic tagging or merge/publish any reviewed changes without a human.

## Next, separate review

Plan a **separate review-only** Zstandard upstream candidate adapter/promotion PR, with both real browser profiles and exact-source verification. Candidate automation may prepare a review PR after success; it must never merge, tag, release, publish or silently advance the reviewed pin. Do not change libvips `adapter-gated` status or report automation as 6/6 while that gate remains.
