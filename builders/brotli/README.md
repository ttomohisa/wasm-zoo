# Brotli experimental builder

Builds the upstream Google Brotli `v1.2.0` `brotli` CLI for browser WebAssembly as a feasibility package.

The key constraint is **patch zero**: the builder checks out the reviewed upstream tag/commit and builds the upstream CMake `brotli` executable target. It does not fork or patch Brotli source code.

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

This package is intentionally `experimental`: no package Release, npm package, Playground or automatic promotion is claimed until the feasibility build is proven in CI.
