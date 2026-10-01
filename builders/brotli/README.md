# Brotli builder

Builds the upstream Google Brotli `v1.2.0` `brotli` CLI for browser WebAssembly.

The reviewed build remains **patch zero**: the builder checks out the exact upstream tag/commit and builds the upstream CMake `brotli` executable target without forking or patching Brotli source code.

## Profile

`browser-full` is single-threaded, uses Emscripten MEMFS, runs each invocation in a fresh Web Worker and requires neither SharedArrayBuffer nor cross-origin isolation.

## Windows

```text
builders\\brotli\\build.bat browser-full
```

## Linux/macOS

```text
./builders/brotli/build.sh browser-full
```

The real Chromium smoke test verifies `brotli --version`, quality-11 compression, integrity-test mode and decompression back to byte-identical input.

The reviewed package release is `brotli-v0.1.0`. A human creates the package tag; the tag-triggered release workflow rebuilds from the exact pins, reruns the browser smoke, publishes binary/corresponding-source/checksum/provenance/SBOM assets, then refreshes Pages. npm distribution and automatic upstream promotion remain separate review stages.
