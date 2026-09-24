# Zstandard browser builder

WASM Zoo builds Zstandard from the exact reviewed upstream tag/commit in `versions.env`. The package exposes two independently released browser profiles:

- `browser-core`: bounded one-shot libzstd compression/decompression API in a dedicated Worker;
- `browser-full`: the original upstream `zstd` CLI running on staged Emscripten MEMFS files.

Both profiles are single-threaded and do not require SharedArrayBuffer. The real browser smoke tests verify standard Zstandard frame output, exact roundtrip and malformed-frame rejection. `browser-full` additionally requires **bidirectional native zstd interoperability** in CI before a candidate or release can pass.

## Upstream automation

Stable GitHub Releases detected by the watcher are tested only in an isolated candidate workspace. The candidate substitutes the exact release tag/commit, rewrites exact-version smoke assertions for that workspace, builds **both** profiles, and requires the normal Chromium operation gates plus native interoperability for `browser-full`.

A successful candidate may create a **review-only promotion PR** that updates the reviewed source pin, builder patch version, package/release metadata and Playground pending-release identity. Automation never merges, creates a package tag, creates a GitHub Release or publishes npm.

The existing public npm distribution is deliberately independent from a package promotion. Its `npm.source` metadata keeps the exact immutable GitHub Release that produced the published tarball until a later npm-specific reviewed change updates that source/version. This prevents a new package pin from pretending an unpublished npm version already exists.

libvips remains adapter-gated; Zstandard joining the automatic set does not change that policy.

## Local build

Linux/macOS:

```sh
./builders/zstd/build.sh browser-core
./builders/zstd/build.sh browser-full
```

Windows PowerShell / cmd:

```text
builders\zstd\build.bat browser-core
builders\zstd\build.bat browser-full
```

Set `ZSTD_WASM_BROWSER` to Chrome/Chromium when automatic detection is unavailable. Native interop is mandatory on CI for `browser-full`; local browser-only runs may omit the native executable.

The exact current pins are always authoritative in `builders/zstd/versions.env`, and package/release metadata must agree with those pins.
