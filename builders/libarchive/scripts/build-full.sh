#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}"
: "${LIBARCHIVE_REF:?}"
: "${LIBARCHIVE_COMMIT:?}"
: "${PROFILE:=browser-full}"
PROFILE_DIR="/workspace/profiles/$PROFILE"
# shellcheck disable=SC1090
source "$PROFILE_DIR/profile.env"
[[ "$PROFILE_ID" == "$PROFILE" ]] || { echo "Profile mismatch" >&2; exit 1; }

rm -rf /build/libarchive /out
mkdir -p /build/libarchive /out

# Use only Emscripten ports that are tied to the exact emsdk pin. This keeps the
# first libarchive profile reproducible while covering the two most common
# compression backends without host libraries leaking into the cross build.
embuilder build zlib bzip2

COMMON_FLAGS="-O3 -sUSE_ZLIB=1 -sUSE_BZIP2=1"
LINK_FLAGS="$COMMON_FLAGS -sMODULARIZE=1 -sEXPORT_NAME=createLibarchiveCore -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=2147483648 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker -sINCOMING_MODULE_JS_API=wasmBinary,locateFile,print,printErr -sEXPORTED_RUNTIME_METHODS=FS,callMain"

emcmake cmake -S /src/libarchive -B /build/libarchive -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DENABLE_TEST=OFF \
  -DENABLE_INSTALL=OFF \
  -DENABLE_WERROR=OFF \
  -DENABLE_OPENSSL=OFF \
  -DENABLE_MBEDTLS=OFF \
  -DENABLE_NETTLE=OFF \
  -DENABLE_LIBB2=OFF \
  -DENABLE_LIBGCC=OFF \
  -DENABLE_LZ4=OFF \
  -DENABLE_LZO=OFF \
  -DENABLE_LZMA=OFF \
  -DENABLE_ZSTD=OFF \
  -DENABLE_ZLIB=ON \
  -DENABLE_BZip2=ON \
  -DENABLE_LIBXML2=OFF \
  -DENABLE_WIN32_XMLLITE=OFF \
  -DENABLE_EXPAT=OFF \
  -DENABLE_PCREPOSIX=OFF \
  -DENABLE_PCRE2POSIX=OFF \
  -DPOSIX_REGEX_LIB=LIBC \
  -DENABLE_ACL=OFF \
  -DENABLE_XATTR=OFF \
  -DENABLE_ICONV=OFF \
  -DENABLE_CNG=OFF \
  -DENABLE_TAR=ON \
  -DENABLE_CPIO=ON \
  -DENABLE_CAT=ON \
  -DENABLE_UNZIP=ON \
  -DCMAKE_C_FLAGS="$COMMON_FLAGS" \
  -DCMAKE_EXE_LINKER_FLAGS="$LINK_FLAGS"

cmake --build /build/libarchive --parallel "$(nproc)" --target bsdtar bsdcpio bsdcat bsdunzip

copy_tool() {
  local tool="$1" src=""
  for candidate in "/build/libarchive/bin/${tool}.js" "/build/libarchive/bin/${tool}"; do
    if [[ -s "$candidate" ]]; then src="$candidate"; break; fi
  done
  [[ -n "$src" ]] || { echo "[ERROR] $tool JavaScript launcher was not produced" >&2; find /build/libarchive/bin -maxdepth 1 -type f -printf '%f\n' >&2 || true; exit 1; }
  local wasm
  if [[ "$src" == *.js ]]; then wasm="${src%.js}.wasm"; else wasm="${src}.wasm"; fi
  [[ -s "$wasm" ]] || { echo "[ERROR] $tool Wasm binary was not produced next to $src" >&2; exit 1; }
  cp "$src" "/out/${tool}-core.js"
  cp "$wasm" "/out/${tool}-core.wasm"
  gzip -9 -n -c "/out/${tool}-core.js" > "/out/${tool}-core.js.gz"
  gzip -9 -n -c "/out/${tool}-core.wasm" > "/out/${tool}-core.wasm.gz"
}
for tool in bsdtar bsdcpio bsdcat bsdunzip; do copy_tool "$tool"; done

{
  echo "# WASM Zoo libarchive CMake configuration"
  echo "# libarchive $LIBARCHIVE_REF / builder $BUILDER_VERSION"
  grep -E '^(BUILD_SHARED_LIBS|ENABLE_(TAR|CPIO|CAT|UNZIP|ZLIB|BZip2|LZ4|LZO|LZMA|ZSTD|OPENSSL|MBEDTLS|NETTLE|LIBGCC|LIBXML2|EXPAT|WIN32_XMLLITE|ACL|XATTR|ICONV)):.*=' /build/libarchive/CMakeCache.txt | sort
  grep -E '^POSIX_REGEX_LIB:' /build/libarchive/CMakeCache.txt || true
} > /out/libarchive-config.txt

cat > /out/features.json <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "libarchive",
  "profile": "$PROFILE",
  "tools": ["bsdtar", "bsdcpio", "bsdcat", "bsdunzip"],
  "compressionBackends": {
    "zlib": "enabled via Emscripten port",
    "bzip2": "enabled via Emscripten port",
    "lzma_xz": false,
    "zstd": false,
    "lz4": false,
    "lzo": false
  },
  "cryptoBackends": [],
  "xmlBackends": [],
  "filesystem": "Emscripten MEMFS",
  "runtimeTested": ["ZIP/Deflate list", "ZIP/Deflate extraction"],
  "notes": [
    "Upstream bsdtar/bsdcpio enable libarchive formats compiled into the static executable.",
    "External xz/LZMA, Zstandard, LZ4, LZO, XML and crypto backends are intentionally not linked in v0.3.0."
  ]
}
EOF_JSON

file_json() {
  local name="$1"
  local bytes sha
  bytes="$(stat -c %s "/out/$name")"
  sha="$(sha256sum "/out/$name" | awk '{print $1}')"
  printf '    "%s": {"bytes": %s, "sha256": "%s"}' "$name" "$bytes" "$sha"
}
{
  cat <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "libarchive",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {
    "name": "libarchive",
    "version": "${LIBARCHIVE_REF#v}",
    "ref": "$LIBARCHIVE_REF",
    "commit": "$LIBARCHIVE_COMMIT"
  },
  "toolchain": {
    "name": "Emscripten",
    "version": "$EMSDK_VERSION",
    "commit": "$EMSCRIPTEN_COMMIT"
  },
  "runtime": {
    "threads": false,
    "simd": false,
    "sharedArrayBuffer": false,
    "worker": true,
    "network": false,
    "filesystem": "MEMFS",
    "initialMemory": 67108864,
    "maximumMemory": 2147483648,
    "memoryGrowth": true
  },
  "build": {
    "binaryLicense": "$PROFILE_BINARY_LICENSE",
    "externalLibraries": ["zlib 1.3.2 (Emscripten port)", "bzip2 1.0.6 (Emscripten port)"],
    "tools": ["bsdtar", "bsdcpio", "bsdcat", "bsdunzip"]
  },
  "files": {
EOF_JSON
  first=1
  for tool in bsdtar bsdcpio bsdcat bsdunzip; do
    for suffix in core.js core.wasm core.js.gz core.wasm.gz; do
      name="${tool}-${suffix}"
      [[ $first -eq 1 ]] || printf ',\n'
      file_json "$name"
      first=0
    done
  done
  printf '\n  }\n}\n'
} > /out/manifest.json

cat > /out/BUILDINFO.txt <<EOF_TXT
WASM Zoo / libarchive
=====================
Zoo build version: $BUILDER_VERSION
Profile: $PROFILE
Profile label: $PROFILE_DISPLAY_NAME
Binary license: $PROFILE_BINARY_LICENSE

libarchive ref: $LIBARCHIVE_REF
libarchive commit: $LIBARCHIVE_COMMIT
libarchive repository: $LIBARCHIVE_REPOSITORY

Emscripten version: $EMSDK_VERSION
Emscripten commit: $EMSCRIPTEN_COMMIT

Browser target:
- upstream bsdtar, bsdcpio, bsdcat and bsdunzip CLIs
- single-threaded WebAssembly
- Emscripten MEMFS
- zlib 1.3.2 and bzip2 1.0.6 from the pinned Emscripten 6.0.6 toolchain
- no SharedArrayBuffer requirement
- no native filesystem, process spawning or networking semantics
- xz/LZMA, zstd, lz4, lzo, XML and crypto backends intentionally disabled in v0.3.0
EOF_TXT

cp /src/libarchive/COPYING /out/LICENSE-libarchive.txt
printf '[OK] libarchive %s built: bsdtar / bsdcpio / bsdcat / bsdunzip\n' "$PROFILE"
