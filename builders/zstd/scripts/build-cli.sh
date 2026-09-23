#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}" "${EMSDK_VERSION:?}" "${EMSCRIPTEN_COMMIT:?}" "${ZSTD_REF:?}" "${ZSTD_COMMIT:?}"
[[ "${PROFILE:-}" == browser-full ]] || { echo "Only browser-full is supported by this CLI build script" >&2; exit 1; }
source /workspace/profiles/browser-full/profile.env
mkdir -p /out
# Use the exact reviewed upstream libzstd (dictionary support included).
# As in upstream programs/Makefile, build every top-level programs/*.c.
# Other-format codecs, native pthreads, legacy frames and assembly are excluded;
# this is the original upstream CLI code, not a replacement compression engine.
emmake make -C /src/zstd/lib libzstd.a -j"$(nproc)" CC=emcc AR=emar \
  ZSTD_LEGACY_SUPPORT=0 ZSTD_NO_ASM=1 CFLAGS="-O2 -DNDEBUG"
[[ -s /src/zstd/lib/libzstd.a ]] || { echo "Upstream libzstd.a missing" >&2; exit 1; }
mapfile -d '' sources < <(find /src/zstd/programs -maxdepth 1 -type f -name '*.c' -print0 | sort -z)
[[ "${#sources[@]}" -gt 5 ]] || { echo "Missing original upstream CLI sources" >&2; exit 1; }
printf '%s\n' "${sources[@]}" | grep -q '/programs/zstdcli.c$'
emcc -O2 -DNDEBUG -DXXH_NAMESPACE=ZSTD_ -DDEBUGLEVEL=0 -DZSTD_LEGACY_SUPPORT=0 -DZSTD_NO_ASM=1 \
  -I/src/zstd/lib -I/src/zstd/lib/common \
  "${sources[@]}" /src/zstd/lib/libzstd.a -lm \
  -sMODULARIZE=1 -sEXPORT_NAME=createZstdCli \
  -sDYNAMIC_EXECUTION=0 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 \
  -sENVIRONMENT=web,worker -sFORCE_FILESYSTEM=1 -sUSE_PTHREADS=0 \
  -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
  -sSTACK_SIZE=1048576 \
  '-sINCOMING_MODULE_JS_API=["wasmBinary","locateFile","print","printErr","noInitialRun"]' \
  '-sEXPORTED_RUNTIME_METHODS=["FS","callMain"]' \
  -o /out/zstd-cli.js
[[ -s /out/zstd-cli.js && -s /out/zstd-cli.wasm ]] || { echo "Upstream CLI output missing" >&2; exit 1; }
gzip -9 -n -c /out/zstd-cli.js > /out/zstd-cli.js.gz
gzip -9 -n -c /out/zstd-cli.wasm > /out/zstd-cli.wasm.gz
cp /src/zstd/LICENSE /out/LICENSE-zstd.txt
cat > /out/features.json <<'EOF'
{
  "schemaVersion": 1,
  "package": "zstd",
  "profile": "browser-full",
  "tools": ["upstream zstd CLI"],
  "features": {
    "upstreamZstdCli": true, "zstdFrameCompression": true,
    "zstdFrameDecompression": true, "dictionaryCli": true,
    "memfs": true, "otherCodecs": false, "legacyFrames": false,
    "pthreads": false, "simd": false, "network": false
  },
  "runtimeTested": [
    "zstd --version displays 1.5.7", "CLI compress with a staged MEMFS input",
    "CLI decompress produces byte-identical output", "CLI decodes a native-zstd frame",
    "native zstd decodes a browser-produced CLI frame", "invalid input fails nonzero"
  ],
  "notes": [
    "Experimental and not yet released to GitHub or npm",
    "Single-threaded upstream programs/*.c CLI with the reviewed libzstd.a",
    "Other-format gzip/xz/lz4 support and legacy-frame decoding are omitted",
    "All files reside in isolated per-execution Emscripten MEMFS",
    "The browser adapter enforces 64 MiB staged input and collected output limits"
  ]
}
EOF
cat > /out/manifest.json <<EOF
{
  "schemaVersion": 1,
  "package": "zstd",
  "profile": "browser-full",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {"name": "Zstandard", "version": "${ZSTD_REF#v}", "ref": "$ZSTD_REF", "commit": "$ZSTD_COMMIT"},
  "toolchain": {"name": "Emscripten", "version": "$EMSDK_VERSION", "commit": "$EMSCRIPTEN_COMMIT"},
  "runtime": {
    "threads": false, "threadBackend": "none", "simd": false,
    "sharedArrayBuffer": false, "crossOriginIsolation": false, "worker": true,
    "network": false, "filesystem": "MEMFS", "initialMemory": 67108864,
    "maximumMemory": 536870912, "memoryGrowth": true, "stackSize": 1048576
  },
  "build": {"builderVersion": "$BUILDER_VERSION", "binaryLicense": "BSD-3-Clause", "externalLibraries": [], "tools": ["upstream zstd CLI"]},
  "files": {
    "zstd-cli.js": {"bytes": $(stat -c %s /out/zstd-cli.js), "sha256": "$(sha256sum /out/zstd-cli.js | cut -d' ' -f1)"},
    "zstd-cli.wasm": {"bytes": $(stat -c %s /out/zstd-cli.wasm), "sha256": "$(sha256sum /out/zstd-cli.wasm | cut -d' ' -f1)"},
    "zstd-cli.js.gz": {"bytes": $(stat -c %s /out/zstd-cli.js.gz), "sha256": "$(sha256sum /out/zstd-cli.js.gz | cut -d' ' -f1)"},
    "zstd-cli.wasm.gz": {"bytes": $(stat -c %s /out/zstd-cli.wasm.gz), "sha256": "$(sha256sum /out/zstd-cli.wasm.gz | cut -d' ' -f1)"}
  }
}
EOF
cat > /out/BUILDINFO.txt <<EOF
WASM Zoo / Zstandard experimental upstream CLI
Builder: $BUILDER_VERSION
Upstream: $ZSTD_REF at $ZSTD_COMMIT
Repository: $ZSTD_REPOSITORY
Toolchain: Emscripten $EMSDK_VERSION at $EMSCRIPTEN_COMMIT
License: BSD-3-Clause (upstream LICENSE)
Source: original upstream programs/*.c + exact pinned libzstd.a
Runtime: single-threaded fresh Worker, MEMFS-only CLI
Excluded: native host I/O, threads, external codecs (gz/xz/lz4), legacy frame decode
Release: NONE - pending further review and release infrastructure
EOF
echo "[OK] built exact-upstream experimental Zstandard $ZSTD_REF CLI"
