# Experimental Zstandard builder — first v0.15 candidate

This is a **review-only canary**, not an existing published seventh package.

- Official upstream: Meta/facebook Zstandard **v1.5.7**, exact commit `f8745da6ff1ad1e7bab384bd1f9d742439278e99`.
- Toolchain: Emscripten **6.0.7**, exact compiler commit.
- Build: upstream `lib/libzstd.a` with a narrow C-API bridge; single-threaded `browser-core` with no SharedArrayBuffer requirement.
- Browser test: actual compression, canonical frame magic `28 b5 2f fd`, exact roundtrip, verified `ZSTD_versionNumber()`, and invalid-frame rejection. No instantiate-only pass is accepted.
- Scope excludes the full `zstd` CLI, streaming/unknown-size frames, dictionaries, npm distribution and Playground until later validated phases. Output has a hard 64 MiB bound.
- Source license: upstream BSD license option. The GPL alternative is **not** selected.

The existing six published packages, 18-cell public cross-browser matrix, package versions and reviewed pins remain unchanged. The Zstandard upstream tracker starts with `candidateMode: none` until this candidate has a proven browser build and the candidate pipeline has been separately reviewed.

Run on Linux/macOS: `./builders/zstd/build.sh browser-core`.
Run on Windows: `./builders/zstd/build.bat browser-core`.
Set `ZSTD_WASM_BROWSER` to your Chrome/Chromium executable if not auto-detected.

If CI passes, the **next** review-only PR can promote this experimental target to a release-ready package by adding corresponding-source bundling, a Playground, complete release tooling, and then a separate npm/cross-browser rollout. Humans retain control of merges, tags, releases and npm publication.
