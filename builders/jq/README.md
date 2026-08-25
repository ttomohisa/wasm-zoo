# jq builder

Builds the upstream `jq` CLI 1.8.2 for browser WebAssembly.

## Profiles

`browser-full` preserves the normal jq CLI/filter language with builtin Oniguruma 6.9.10 regular expressions. It is single-threaded, runs each invocation in a fresh outer Worker, uses Emscripten MEMFS and requires neither SharedArrayBuffer nor cross-origin isolation.

## Windows

```text
build-jq.bat browser-full
```

## Linux/macOS

```text
./builders/jq/build.sh browser-full
```

The real Chromium smoke test verifies `jq --version`, an actual select/map JSON transformation, and an Oniguruma-backed `test()` regex. The package intentionally preserves CLI arguments rather than replacing jq with a reduced JavaScript query API.
