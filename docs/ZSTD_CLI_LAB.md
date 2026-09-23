# Zstandard v0.15 Phase 2: upstream CLI browser lab

The original `browser-core` profile remains unchanged. New experimental
`browser-full` compiles the real upstream Zstandard v1.5.7 CLI source files
(`programs/*.c`, including `zstdcli.c`) against exact-reviewed upstream
`libzstd.a`. This is not a reimplementation of Zstandard in JavaScript.

The browser runtime loads `wasm-zoo-cli.mjs`, stages explicit inputs in
Emscripten MEMFS, calls the upstream CLI from a fresh Worker, collects output
files and captures stdout/stderr. It has no native OS filesystem, terminal
or shell pipe integration. The adapter bounds total staged input and total
requested output to 64 MiB and terminates a Worker on timeout.

The CLI build explicitly disables native pthreads, assembly, legacy-frame
decoding, and optional native gzip, xz and lz4 codec libraries. It uses the
upstream dictionary-enabled library, but dictionary behavior is not claimed
as a tested browser feature in this phase.

## Actual CI release gates

`build-zstd.yml` runs `browser-core` and `browser-full` as separate
jobs. The CLI job **requires an installed native zstd executable**; it
will fail rather than silently skipping the two-way interoperability
check. The browser smoke:
- verifies the actual upstream CLI reports 1.5.7;
- compresses a real staged input into a standard-magic `.zst` frame;
- decompresses the frame and checks every input byte;
- requires the upstream CLI to reject malformed input;
- decodes a frame produced by the native zstd executable;
- sends a frame produced by the **browser upstream CLI** to the local
  smoke harness, which verifies native zstd can decode every byte.

The resulting artifacts include both profiles' manifests, build metadata,
in-toto/SLSA provenance and CycloneDX SBOMs. They are **CI-only**
artifacts: no tag, GitHub Release or npm publication is allowed by this PR.

## Commands

Linux:
```sh
./builders/zstd/build.sh browser-core
./builders/zstd/build.sh browser-full
```

Windows PowerShell:
```powershell
./builders/zstd/build.bat browser-core
./builders/zstd/build.bat browser-full
```

The optional local native interop test is performed when `zstd` is on
`PATH`. CI sets `ZSTD_NATIVE_INTEROP=required`, so it must actually
perform both directions rather than treating missing native tooling as a
passing test.

Next reviewed phases: downloadable immutable release + corresponding
source archive, Playground, and then independent npm/cross-browser
verification. All merge, tag, release and publish decisions remain human
controlled; the upstream candidate tracker remains `none` for Zstandard,
and libvips remains adapter-gated.
