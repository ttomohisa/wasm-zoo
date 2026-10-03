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

The reviewed package release is `brotli-v0.1.0`. Stable Google Brotli releases now use the shared review-only automatic candidate path: the watcher resolves the exact release tag/commit, the isolated `browser-full` build reruns the real Chromium round trip, and only a successful candidate may open a promotion PR. A human still merges the PR and creates the package tag; the tag-triggered release workflow rebuilds from the reviewed pins and publishes the immutable release assets. npm distribution remains a separate future review.
