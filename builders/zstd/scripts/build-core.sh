#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}" "${EMSDK_VERSION:?}" "${EMSCRIPTEN_COMMIT:?}" "${ZSTD_REF:?}" "${ZSTD_COMMIT:?}"
: "${PROFILE:=browser-core}"
source "/workspace/profiles/$PROFILE/profile.env"
[[ "$PROFILE_ID" == "browser-core" ]] || { echo "Only reviewed browser-core canary is supported" >&2; exit 1; }
mkdir -p /out
# Build only the upstream C library: the canary does NOT claim a full zstd CLI.
emmake make -C /src/zstd/lib libzstd.a -j"$(nproc)" CC=emcc AR=emar \
  ZSTD_LEGACY_SUPPORT=0 ZSTD_NO_ASM=1 ZSTD_LIB_DICTBUILDER=0 \
  CFLAGS="-O2 -DNDEBUG"
[[ -s /src/zstd/lib/libzstd.a ]] || { echo "Upstream static library was not built" >&2; exit 1; }
emcc -O2 -DNDEBUG -I/src/zstd/lib /workspace/scripts/zstd-wasm.c /src/zstd/lib/libzstd.a \
  -sMODULARIZE=1 -sEXPORT_NAME=createZstdCore -sDYNAMIC_EXECUTION=0 \
  -sENVIRONMENT=web,worker -sFILESYSTEM=0 -sUSE_PTHREADS=0 \
  -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
  '-sEXPORTED_FUNCTIONS=["_malloc","_free","_zoo_compress_bound","_zoo_compress","_zoo_decompress","_zoo_is_error","_zoo_frame_size","_zoo_version_number"]' \
  '-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]' \
  -o /out/zstd-core.js
[[ -s /out/zstd-core.js && -s /out/zstd-core.wasm ]] || exit 1
gzip -9 -n -c /out/zstd-core.js > /out/zstd-core.js.gz
gzip -9 -n -c /out/zstd-core.wasm > /out/zstd-core.wasm.gz
cp /src/zstd/LICENSE /out/LICENSE-zstd.txt
cat > /out/features.json <<'EOF'
{
  "schemaVersion": 1,
  "package": "zstd",
  "profile": "browser-core",
  "features": {"upstreamLibzstd": true, "singleFrameCompress": true, "singleFrameDecompress": true, "streaming": false, "dictionaryTraining": false, "pthreads": false, "simd": false, "network": false},
  "runtimeTested": ["upstream libzstd version", "zstd frame magic", "real compression/decompression roundtrip", "reject invalid input"],
  "notes": ["Experimental: not a published release or npm distribution", "Output is bounded to 64 MiB by the browser wrapper", "Frame content size must be known for one-shot decompression"]
}
EOF
cat > /out/manifest.json <<EOF
{
  "schemaVersion": 1,
  "package": "zstd",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {"name": "Zstandard", "version": "${ZSTD_REF#v}", "ref": "$ZSTD_REF", "commit": "$ZSTD_COMMIT"},
  "toolchain": {"name": "Emscripten", "version": "$EMSDK_VERSION", "commit": "$EMSCRIPTEN_COMMIT"},
  "runtime": {"threads": false, "threadBackend": "none", "simd": false, "sharedArrayBuffer": false, "crossOriginIsolation": false, "worker": true, "network": false, "filesystem": "none", "initialMemory": 33554432, "maximumMemory": 536870912, "memoryGrowth": true},
  "build": {"builderVersion": "$BUILDER_VERSION", "binaryLicense": "BSD-3-Clause", "externalLibraries": [], "tools": ["libzstd C API"]},
  "files": {
    "zstd-core.js": {"bytes": $(stat -c %s /out/zstd-core.js), "sha256": "$(sha256sum /out/zstd-core.js | cut -d' ' -f1)"},
    "zstd-core.wasm": {"bytes": $(stat -c %s /out/zstd-core.wasm), "sha256": "$(sha256sum /out/zstd-core.wasm | cut -d' ' -f1)"},
    "zstd-core.js.gz": {"bytes": $(stat -c %s /out/zstd-core.js.gz), "sha256": "$(sha256sum /out/zstd-core.js.gz | cut -d' ' -f1)"},
    "zstd-core.wasm.gz": {"bytes": $(stat -c %s /out/zstd-core.wasm.gz), "sha256": "$(sha256sum /out/zstd-core.wasm.gz | cut -d' ' -f1)"}
  }
}
EOF
cat > /out/BUILDINFO.txt <<EOF
WASM Zoo / Zstandard browser-core canary
Builder: $BUILDER_VERSION
Upstream: $ZSTD_REF at $ZSTD_COMMIT
Repository: $ZSTD_REPOSITORY
Toolchain: Emscripten $EMSDK_VERSION at $EMSCRIPTEN_COMMIT
License: BSD-3-Clause (upstream LICENSE)
Runtime: one-shot bounded libzstd C API, single-threaded Web Worker; no CLI, streaming, dictionaries or network access
Release: NONE - requires successful browser smoke tests and human review
EOF
echo "[OK] built experimental Zstandard $ZSTD_REF browser-core"
