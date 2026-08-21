# WASM Zoo · libarchive

Reproducible browser build of upstream libarchive command-line tools.

Pinned release: **libarchive 3.8.9**  
Toolchain: **Emscripten 6.0.6**  
Zoo builder: **0.3.1**

`browser-full` publishes four upstream CLIs:

- `bsdtar`
- `bsdcpio`
- `bsdcat`
- `bsdunzip`

The browser-full profile enables zlib and bzip2 through Emscripten's toolchain-pinned ports. xz/LZMA, Zstandard, LZ4, LZO, XML and crypto backends are deliberately reported as gaps instead of being silently assumed.

Windows:

```text
build-libarchive.bat browser-full
```

Linux/macOS:

```text
./builders/libarchive/build.sh browser-full
```

A successful build must pass a real Chromium test that lists and extracts a ZIP/Deflate fixture and exercises all four shipped CLI cores.

## v0.3.1 metadata canary

Builder 0.3.1 keeps the exact libarchive 3.8.9 WebAssembly feature set from 0.3.0. Its purpose is to exercise the WASM Zoo v0.8.0 release contract in production: after the Chromium smoke test passes, the release must publish standalone `provenance-browser-full.json` (in-toto/SLSA Provenance v1) and `sbom-browser-full.cdx.json` (CycloneDX 1.6), both covered by `SHA256SUMS.txt`.
