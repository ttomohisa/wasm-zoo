# Zstandard v0.15 Phase 3: manual release checklist

Zstandard 1.5.7 was published as GitHub Release `zstd-v0.3.0` after the Phase 3 manual-tag workflow succeeded. Exact official source commit: f8745da6ff1ad1e7bab384bd1f9d742439278e99. Emscripten 6.0.7 commit: 4483d70a78098ed5d860dff2dc21f3025b2da2ee.

## Review-only CI

The Build experimental Zstandard browser WASM workflow builds browser-core and browser-full. Both run real Chromium tests. The CLI additionally requires native zstd to decode the browser-produced .zst frame and the browser CLI to decode a native-produced frame. Only after both jobs pass does a dependent packaging job download the builds, verify actual JS/WASM hashes against their manifests and SLSA provenance, fetch exact corresponding official source and ZIP each profile. It produces a temporary experimental-zstd-release-bundle CI artifact containing:
- zstd-browser-core-1.5.7-zoo-0.3.0.zip
- zstd-browser-full-1.5.7-zoo-0.3.0.zip
- zstd-sources-1.5.7-zoo-0.3.0.tar.gz (official source plus exact Zoo builder, runtime and scripts)
- Separate provenance-browser-core.json / provenance-browser-full.json
- Separate sbom-browser-core.cdx.json / sbom-browser-full.cdx.json
- BUILDINFO for both profiles
- SHA256SUMS.txt

The archive verifier checks filenames, ZIP contents and checksums. Neither this CI workflow nor this PR creates tags, merges, releases or publishes to npm. The reviewed BSD upstream license option applies; no native filesystem, pthreads, optional external gzip/xz/lz4 codecs, legacy-frame decoding or streaming JavaScript API is claimed.

## Windows PowerShell 7: local review after you merge

    cd C:\Users\broth\Desktop\workspace\wasm-zoo
    git fetch origin main --tags
    git switch main
    git pull --ff-only origin main
    git log -1 --oneline
    node builders/zstd/scripts/check-repository.mjs
    npm run check
    gh run list --workflow build-zstd.yml --branch main --limit 3

To rerun both profiles with Docker Desktop and Chrome locally:

    .\builders\zstd\build.bat browser-core
    .\builders\zstd\build.bat browser-full
    node builders/zstd/scripts/verify-build-inputs.mjs

Native frame testing is mandatory on CI (ZSTD_NATIVE_INTEROP=required). To prepare release archives locally, use bash on Linux with git, tar, zip, unzip, gzip and sha256sum, or inspect the verified PR bundle.

## Human-gated tagging and release

ONLY after reviewing and merging the Phase 3 PR AND checking successful main CI plus the review-only release-bundle artifact, the human may push the reviewed annotated tag:

    git switch main
    git pull --ff-only origin main
    git tag -a zstd-v0.3.0 -m "WASM Zoo Zstandard 1.5.7 browser release"
    git push origin zstd-v0.3.0
    gh run list --workflow release-zstd.yml --limit 3

The tag-triggered release-zstd.yml independently rechecks the exact tag and main ancestry, rebuilds both profiles, re-runs Chromium and bidirectional native interoperability gates, validates the corresponding source archive plus checksums, and creates the GitHub Release only after these checks pass. It then dispatches Pages.

Pages downloads ONLY an actually published GitHub Release; it verifies SHA256SUMS across every published release file and checks binary JS/WASM hashes and exact pinned version in both manifests. The public Playground remains disabled if release assets have not been published. A separate metadata promotion PR can then mark Zstandard available and expose its catalog link; npm rollout remains an independent future phase. libvips remains adapter-gated.

## Promotion after release

The release workflow completed successfully on the reviewed main commit and published both profile ZIPs, exact corresponding source, SHA-256 checksums, provenance and SBOM assets. This follow-up promotion changes only catalog/public metadata from `experimental` to `available`, enables the published-release Playground links, and records immutable release asset names. It does not publish npm or enable automatic upstream candidate promotion.
