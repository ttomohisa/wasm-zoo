#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}" "${EMSDK_VERSION:?}" "${EMSCRIPTEN_COMMIT:?}" "${BROTLI_VERSION:?}" "${BROTLI_REF:?}" "${BROTLI_COMMIT:?}"
: "${PROFILE:=browser-full}"
PROFILE_DIR="/workspace/profiles/$PROFILE"
# shellcheck disable=SC1090
source "$PROFILE_DIR/profile.env"
[[ "$PROFILE_ID" == "$PROFILE" ]] || { echo "Profile mismatch" >&2; exit 1; }

rm -rf /out /src/brotli-build
mkdir -p /out /src/brotli-build

EMCC_FLAGS="-O2 -sDYNAMIC_EXECUTION=0 -sMODULARIZE=1 -sEXPORT_NAME=createBrotliCore -sUSE_PTHREADS=0 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=536870912 -sSTACK_SIZE=1048576 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker -sINCOMING_MODULE_JS_API=wasmBinary,locateFile,print,printErr -sEXPORTED_RUNTIME_METHODS=FS,callMain"

# Build the official upstream CMake executable target. No Brotli source is
# copied, patched or replaced by Zoo code before configuration.
emcmake cmake -S /src/brotli -B /src/brotli-build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DBROTLI_BUILD_TOOLS=ON \
  -DBROTLI_DISABLE_TESTS=ON \
  -DCMAKE_EXECUTABLE_SUFFIX=.js \
  -DCMAKE_EXE_LINKER_FLAGS:STRING="$EMCC_FLAGS"
cmake --build /src/brotli-build --target brotli -j"$(nproc)" --verbose

launcher="$(find /src/brotli-build -type f -name 'brotli.js' -print -quit)"
[[ -n "$launcher" && -s "$launcher" ]] || { echo "[ERROR] upstream Brotli CMake target did not produce brotli.js" >&2; find /src/brotli-build -maxdepth 3 -type f -printf '%p\n' >&2 || true; exit 1; }
wasm="${launcher%.js}.wasm"
[[ -s "$wasm" ]] || { echo "[ERROR] Brotli Wasm binary was not produced next to $launcher" >&2; exit 1; }

cp "$launcher" /out/brotli-core.js
cp "$wasm" /out/brotli-core.wasm
gzip -9 -n -c /out/brotli-core.js > /out/brotli-core.js.gz
gzip -9 -n -c /out/brotli-core.wasm > /out/brotli-core.wasm.gz
cmake -LA -N /src/brotli-build > /out/brotli-config.txt

cat > /out/features.json <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "brotli",
  "profile": "$PROFILE",
  "tools": ["brotli"],
  "features": {
    "upstreamCli": true,
    "compress": true,
    "decompress": true,
    "integrityTest": true,
    "qualityOption": true,
    "largeWindowCliOption": true,
    "concatenatedDecode": true,
    "pthreads": false,
    "simd": false,
    "network": false
  },
  "filesystem": "Emscripten MEMFS",
  "runtimeTested": ["brotli --version", "quality-11 compression", "integrity test", "decompression round trip"],
  "notes": [
    "The official upstream CMake brotli executable target is compiled directly; there is no Brotli source patch step.",
    "Each invocation runs in a fresh outer Worker and requires neither pthreads nor SharedArrayBuffer.",
    "Browser input/output files are explicitly staged in MEMFS; host filesystem metadata semantics are not exposed."
  ]
}
EOF_JSON

file_json() {
  local name="$1" bytes sha
  bytes="$(stat -c %s "/out/$name")"
  sha="$(sha256sum "/out/$name" | awk '{print $1}')"
  printf '    "%s": {"bytes": %s, "sha256": "%s"}' "$name" "$bytes" "$sha"
}
{
cat <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "brotli",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {"name": "Brotli", "version": "$BROTLI_VERSION", "ref": "$BROTLI_REF", "commit": "$BROTLI_COMMIT"},
  "toolchain": {"name": "Emscripten", "version": "$EMSDK_VERSION", "commit": "$EMSCRIPTEN_COMMIT"},
  "runtime": {
    "threads": false,
    "threadBackend": "none",
    "simd": false,
    "sharedArrayBuffer": false,
    "crossOriginIsolation": false,
    "worker": true,
    "network": false,
    "filesystem": "MEMFS",
    "initialMemory": 16777216,
    "maximumMemory": 536870912,
    "memoryGrowth": true,
    "stackSize": 1048576
  },
  "build": {
    "builderVersion": "$BUILDER_VERSION",
    "binaryLicense": "$PROFILE_BINARY_LICENSE",
    "externalLibraries": [],
    "tools": ["brotli"],
    "sourcePatchCount": 0,
    "upstreamBuildTarget": "brotli"
  },
  "files": {
EOF_JSON
first=1
for name in brotli-core.js brotli-core.wasm brotli-core.js.gz brotli-core.wasm.gz; do
  [[ $first -eq 1 ]] || printf ',\n'
  file_json "$name"
  first=0
done
printf '\n  }\n}\n'
} > /out/manifest.json

cat > /out/BUILDINFO.txt <<EOF_TXT
WASM Zoo / Brotli experimental feasibility
===========================================
Zoo build version: $BUILDER_VERSION
Profile: $PROFILE
Profile label: $PROFILE_DISPLAY_NAME
Binary license: $PROFILE_BINARY_LICENSE

Brotli version: $BROTLI_VERSION
Brotli ref: $BROTLI_REF
Brotli commit: $BROTLI_COMMIT
Brotli repository: $BROTLI_REPOSITORY
Source patches: 0
Upstream build system: CMake
Upstream executable target: brotli

Emscripten version: $EMSDK_VERSION
Emscripten commit: $EMSCRIPTEN_COMMIT

Browser target:
- official upstream brotli CLI
- single-threaded WebAssembly in a fresh outer Worker per invocation
- Emscripten MEMFS; no SharedArrayBuffer or cross-origin isolation required
- stdout/stderr captured by the thin Zoo runtime wrapper
- no host filesystem or Zoo-provided network access
EOF_TXT

cp /src/brotli/LICENSE /out/LICENSE-Brotli.txt
printf '[OK] Brotli %s built from upstream CMake brotli target with patch count 0\n' "$PROFILE"
