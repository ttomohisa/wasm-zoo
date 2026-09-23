# Zstandard v0.15 — release-preparation phase (review-only)

This is a **review-only canary**, not an existing published seventh package.

- Official upstream: Meta/facebook Zstandard **v1.5.7**, exact commit `f8745da6ff1ad1e7bab384bd1f9d742439278e99`.
- Toolchain: Emscripten **6.0.7**, exact compiler commit.
- Build: two independent experimental profiles from the exact upstream source: `browser-core` (narrow in-memory C API) and `browser-full` (original `programs/*.c` CLI on Emscripten MEMFS). Both single-threaded without SharedArrayBuffer.
- Browser test: actual compression, canonical frame magic `28 b5 2f fd`, exact roundtrip, verified `ZSTD_versionNumber()`, and invalid-frame rejection. No instantiate-only pass is accepted.
- CLI `browser-full` is subject to native/browser interoperability tests. Native pthreads, optional external gzip/xz/lz4 codecs and legacy-frame decode are excluded; dictionaries are linked but not yet release-validated. No native filesystem or shell pipe semantics.
- The JS API buffers staged input and requested outputs, with a total 64 MiB limit for each; it is not a streaming JS API.
- npm distribution, an immutable GitHub Release, and Playground are future reviewed phases.
- Source license: upstream BSD license option. The GPL alternative is **not** selected.

The existing six published packages, 18-cell public cross-browser matrix, package versions and reviewed pins remain unchanged. The Zstandard upstream tracker starts with `candidateMode: none` until this candidate has a proven browser build and the candidate pipeline has been separately reviewed.

Run on Linux/macOS: `./builders/zstd/build.sh browser-core` or `./builders/zstd/build.sh browser-full`.
Run on Windows: `./builders/zstd/build.bat browser-core` or `./builders/zstd/build.bat browser-full`.
Set `ZSTD_WASM_BROWSER` to your Chrome/Chromium executable if not auto-detected.

The experimental CLI CI job also requires an installed native `zstd` executable for bidirectional frame tests. Local builds can omit it; the browser will still run CLI roundtrip and invalid-input tests. Detailed test gates: [Zstandard CLI Lab](../../docs/ZSTD_CLI_LAB.md).

After both profiles pass, a **separate** review-only PR can add corresponding-source bundles, a Playground and formal release tooling. A later npm/cross-browser rollout remains independent. Humans retain control of merges, tags, releases and npm publication.

## Phase 3: release-ready assets and Playground

The proposed manually created release tag is **zstd-v0.3.0**. It does not exist merely because this PR merges. The PR CI builds both profiles, assembles and verifies two ZIP files, fetches exact official source, bundles the Zoo build recipes, and verifies SHA-256, SLSA provenance and CycloneDX SBOM. The CI bundle is review-only, not public.

The site/zstd-playground/ page is publicly disabled until Pages downloads and checksums an actual reviewed GitHub Release. Local previews are explicitly restricted to localhost. See docs/ZSTD_RELEASE.md for commands.
