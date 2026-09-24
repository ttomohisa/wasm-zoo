#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}" "${EMSDK_VERSION:?}" "${EMSCRIPTEN_COMMIT:?}" "${QPDF_VERSION:?}" "${QPDF_REF:?}" "${QPDF_COMMIT:?}" "${QPDF_SOURCE_URL:?}" "${QPDF_SOURCE_SHA256:?}"
: "${PROFILE:=browser-full}"
: "${ZLIB_VERSION:?}" "${ZLIB_SOURCE_URL:?}" "${ZLIB_SOURCE_SHA512:?}" "${LIBJPEG_VERSION:?}" "${LIBJPEG_SOURCE_URL:?}" "${LIBJPEG_SOURCE_SHA512:?}"
PROFILE_DIR="/workspace/profiles/$PROFILE"
# shellcheck disable=SC1090
source "$PROFILE_DIR/profile.env"
[[ "$PROFILE_ID" == "$PROFILE" ]] || { echo "[ERROR] profile mismatch" >&2; exit 1; }
rm -rf /out /src/qpdf/build-wasm && mkdir -p /out

embuilder build zlib libjpeg
SYSROOT="$(em-config CACHE)/sysroot"
LIBDIR="$SYSROOT/lib/wasm32-emscripten"
[[ -s "$LIBDIR/libz.a" ]] || { echo "[ERROR] Emscripten zlib port missing" >&2; exit 1; }
[[ -s "$LIBDIR/libjpeg.a" ]] || { echo "[ERROR] Emscripten libjpeg port missing" >&2; exit 1; }

COMMON_FLAGS="-O2 -fwasm-exceptions"
LINK_FLAGS="-O2 -fwasm-exceptions -sDYNAMIC_EXECUTION=0 -sMODULARIZE=1 -sEXPORT_NAME=createQpdfCore -sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=536870912 -sSTACK_SIZE=2097152 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 -sINCOMING_MODULE_JS_API=wasmBinary,locateFile,print,printErr,thisProgram -sEXPORTED_RUNTIME_METHODS=FS,callMain"
emcmake cmake -S /src/qpdf -B /src/qpdf/build-wasm \
  -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON -DBUILD_DOC=OFF -DINSTALL_EXAMPLES=OFF \
  -DINSTALL_PKGCONFIG=OFF -DINSTALL_CMAKE_PACKAGE=OFF -DUSE_IMPLICIT_CRYPTO=OFF -DREQUIRE_CRYPTO_NATIVE=ON \
  -DPKG_CONFIG_EXECUTABLE=/usr/bin/false -DZLIB_H_PATH="$SYSROOT/include" -DZLIB_LIB_PATH="$LIBDIR/libz.a" \
  -DLIBJPEG_H_PATH="$SYSROOT/include" -DLIBJPEG_LIB_PATH="$LIBDIR/libjpeg.a" \
  -DCMAKE_C_FLAGS="$COMMON_FLAGS" -DCMAKE_CXX_FLAGS="$COMMON_FLAGS" -DCMAKE_EXE_LINKER_FLAGS="$LINK_FLAGS"
cmake --build /src/qpdf/build-wasm --target qpdf -j"$(nproc)"

launcher="/src/qpdf/build-wasm/qpdf/qpdf.js"; wasm="/src/qpdf/build-wasm/qpdf/qpdf.wasm"
[[ -s "$launcher" ]] || { echo "[ERROR] qpdf.js not produced" >&2; find /src/qpdf/build-wasm/qpdf -maxdepth 1 -type f -printf '%f\n' >&2 || true; exit 1; }
[[ -s "$wasm" ]] || { echo "[ERROR] qpdf.wasm not produced" >&2; exit 1; }
cp "$launcher" /out/qpdf-core.js; cp "$wasm" /out/qpdf-core.wasm
gzip -9 -n -c /out/qpdf-core.js > /out/qpdf-core.js.gz
gzip -9 -n -c /out/qpdf-core.wasm > /out/qpdf-core.wasm.gz
cmake -LA -N /src/qpdf/build-wasm > /out/qpdf-config.txt

cat > /out/features.json <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "qpdf",
  "profile": "$PROFILE",
  "tools": ["qpdf"],
  "features": {"upstreamCli": true, "pdfCheck": true, "linearization": true, "nativeCrypto": true, "encryption": true, "decryption": true, "wasmExceptions": true, "pthreads": false, "simd": false, "network": false},
  "filesystem": "Emscripten MEMFS",
  "runtimeTested": ["qpdf --version", "one-page PDF fixture check", "linearize", "AES-256 encrypt/decrypt"],
  "notes": ["Built from the official QPDF release archive after SHA-256 verification.", "QPDF itself is unpatched; browser adaptation is supplied through Emscripten flags and the thin Zoo runtime.", "QPDF native crypto is used without OpenSSL or GnuTLS.", "The initial canary is single-threaded and requires no SharedArrayBuffer."]
}
EOF_JSON

file_json(){ local name="$1" bytes sha; bytes="$(stat -c %s "/out/$name")"; sha="$(sha256sum "/out/$name"|awk '{print $1}')"; printf '    "%s": {"bytes": %s, "sha256": "%s"}' "$name" "$bytes" "$sha"; }
{
cat <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "qpdf",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {"name": "QPDF", "version": "$QPDF_VERSION", "ref": "$QPDF_REF", "commit": "$QPDF_COMMIT", "sourceUrl": "$QPDF_SOURCE_URL", "sourceSha256": "$QPDF_SOURCE_SHA256"},
  "toolchain": {"name": "Emscripten", "version": "$EMSDK_VERSION", "commit": "$EMSCRIPTEN_COMMIT"},
  "runtime": {"threads": false, "threadBackend": "none", "simd": false, "sharedArrayBuffer": false, "crossOriginIsolation": false, "worker": true, "network": false, "filesystem": "MEMFS", "initialMemory": 33554432, "maximumMemory": 536870912, "memoryGrowth": true, "stackSize": 2097152, "wasmExceptions": true},
  "build": {"builderVersion": "$BUILDER_VERSION", "binaryLicense": "$PROFILE_BINARY_LICENSE", "cryptoProvider": "native", "externalLibraries": ["zlib $ZLIB_VERSION (Emscripten 6.0.8 port)", "libjpeg $LIBJPEG_VERSION (Emscripten 6.0.8 port)"], "tools": ["qpdf"]},
  "files": {
EOF_JSON
first=1
for name in qpdf-core.js qpdf-core.wasm qpdf-core.js.gz qpdf-core.wasm.gz; do [[ $first -eq 1 ]] || printf ',\n'; file_json "$name"; first=0; done
printf '\n  }\n}\n'
} > /out/manifest.json

cat > /out/BUILDINFO.txt <<EOF_TXT
WASM Zoo / QPDF
===============
Zoo build version: $BUILDER_VERSION
Profile: $PROFILE
Profile label: $PROFILE_DISPLAY_NAME
Binary license: $PROFILE_BINARY_LICENSE

QPDF version: $QPDF_VERSION
QPDF ref: $QPDF_REF
QPDF commit: $QPDF_COMMIT
QPDF repository: $QPDF_REPOSITORY
Official source: $QPDF_SOURCE_URL
Official source SHA-256: $QPDF_SOURCE_SHA256

Emscripten version: $EMSDK_VERSION
Emscripten commit: $EMSCRIPTEN_COMMIT

Browser target:
- original upstream qpdf CLI
- QPDF built-in native crypto; no OpenSSL/GnuTLS
- Emscripten zlib $ZLIB_VERSION + libjpeg $LIBJPEG_VERSION ports
- wasm-native exceptions
- single-threaded outer Worker + MEMFS
- no SharedArrayBuffer, native host filesystem or Zoo-provided network access
EOF_TXT
cp /src/qpdf/LICENSE.txt /out/LICENSE-QPDF.txt
cp /src/qpdf/NOTICE.md /out/NOTICE-QPDF.md
/workspace/scripts/stage-third-party-licenses.sh /out
printf '[OK] QPDF %s %s built from official source\n' "$QPDF_VERSION" "$PROFILE"
