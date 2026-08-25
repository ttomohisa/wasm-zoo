#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}" "${EMSDK_VERSION:?}" "${EMSCRIPTEN_COMMIT:?}" "${JQ_REF:?}" "${JQ_COMMIT:?}" "${ONIGURUMA_VERSION:?}" "${ONIGURUMA_COMMIT:?}"
: "${PROFILE:=browser-full}"
PROFILE_DIR="/workspace/profiles/$PROFILE"
# shellcheck disable=SC1090
source "$PROFILE_DIR/profile.env"
[[ "$PROFILE_ID" == "$PROFILE" ]] || { echo "Profile mismatch" >&2; exit 1; }

rm -rf /out
mkdir -p /out
cd /src/jq

# jq derives its release version from git while autoreconf/make generate build
# metadata. autoreconf itself dirties a git checkout before scripts/version is
# evaluated, which would turn an exact jq-1.8.2 source into 1.8.2-dirty. The
# reviewed ref/commit have already been verified in fetch-jq.sh, so temporarily
# make scripts/version return that reviewed release version for generated build
# metadata only. The corresponding-source bundle remains the unmodified exact
# upstream commit.
expected_version="${JQ_REF#jq-}"
version_script_backup="$(mktemp)"
cp scripts/version "$version_script_backup"
restore_version_script() {
  if [[ -f "$version_script_backup" ]]; then
    cp "$version_script_backup" scripts/version
    chmod +x scripts/version
    rm -f "$version_script_backup"
  fi
}
trap restore_version_script EXIT
cat > scripts/version <<EOF_VERSION
#!/bin/sh
printf '%s\n' '$expected_version'
EOF_VERSION
chmod +x scripts/version

autoreconf -fi

COMPILE_FLAGS="-O2"
EMCC_FLAGS="-O2 -sDYNAMIC_EXECUTION=0 -sMODULARIZE=1 -sEXPORT_NAME=createJqCore -sUSE_PTHREADS=0 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=536870912 -sSTACK_SIZE=1048576 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker -sINCOMING_MODULE_JS_API=wasmBinary,locateFile,print,printErr -sEXPORTED_RUNTIME_METHODS=FS,callMain"
export CFLAGS="$COMPILE_FLAGS"
export CXXFLAGS="$COMPILE_FLAGS"
export LDFLAGS=""

if ! emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-maintainer-mode \
  --disable-silent-rules \
  --disable-shared \
  --enable-static \
  --enable-all-static \
  --disable-docs \
  --with-oniguruma=builtin; then
  echo "[ERROR] jq configure failed. config.log tail follows:" >&2
  tail -n 200 config.log >&2 || true
  exit 1
fi

# Fail closed if the intended builtin regex engine is not selected.
grep -Eq '(^|[[:space:]])--with-oniguruma=builtin([[:space:]]|$)' <(./config.status --config) || {
  echo "[ERROR] jq configure did not retain --with-oniguruma=builtin" >&2
  ./config.status --config >&2 || true
  exit 1
}

# The generated configure/Makefile metadata must now be the reviewed release
# version exactly; accepting a -dirty/HEAD suffix would make the published CLI
# version disagree with the pinned package metadata.
configured_version="$(sed -n 's/^PACKAGE_VERSION = //p' Makefile | head -n 1)"
[[ "$configured_version" == "$expected_version" ]] || {
  echo "[ERROR] jq configured version mismatch: expected $expected_version got ${configured_version:-<empty>}" >&2
  exit 1
}

# Build the normal top-level target rather than requesting `jq` directly.
# jq's Automake dependency on the builtin Oniguruma libtool archive does not
# itself recurse into vendor/oniguruma when a leaf target is requested. The
# top-level `all` target performs the required subdirectory build first.
EMCC_CFLAGS="$EMCC_FLAGS" emmake make -j"$(nproc)" V=1 LDFLAGS=-all-static

grep -Fq "#define JQ_VERSION \"$expected_version\"" src/version.h || {
  echo "[ERROR] jq generated version.h is not the reviewed release $expected_version" >&2
  cat src/version.h >&2 || true
  exit 1
}

# Restore the pristine upstream version helper before copying licenses/build
# metadata. The WebAssembly output has already been linked with the fixed
# reviewed release version.
restore_version_script
trap - EXIT

[[ -s vendor/oniguruma/src/.libs/libonig.la ]] || {
  echo "[ERROR] builtin Oniguruma archive was not produced" >&2
  find vendor/oniguruma -maxdepth 4 -type f -name 'libonig*' -print >&2 || true
  exit 1
}

launcher=""
for candidate in /src/jq/jq.js /src/jq/jq; do
  if [[ -s "$candidate" ]]; then launcher="$candidate"; break; fi
done
[[ -n "$launcher" ]] || { echo "[ERROR] jq JavaScript launcher was not produced" >&2; find /src/jq -maxdepth 1 -type f -printf '%f\n' >&2 || true; exit 1; }
if [[ "$launcher" == *.js ]]; then wasm="${launcher%.js}.wasm"; else wasm="${launcher}.wasm"; fi
[[ -s "$wasm" ]] || { echo "[ERROR] jq Wasm binary was not produced next to $launcher" >&2; exit 1; }

cp "$launcher" /out/jq-core.js
cp "$wasm" /out/jq-core.wasm
gzip -9 -n -c /out/jq-core.js > /out/jq-core.js.gz
gzip -9 -n -c /out/jq-core.wasm > /out/jq-core.wasm.gz
./config.status --config > /out/jq-config.txt

cat > /out/features.json <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "jq",
  "profile": "$PROFILE",
  "tools": ["jq"],
  "features": {
    "filterLanguage": true,
    "onigurumaRegex": true,
    "rawOutput": true,
    "compactOutput": true,
    "slurp": true,
    "nullInput": true,
    "modulePathsViaMemfs": true,
    "pthreads": false,
    "simd": false,
    "network": false
  },
  "filesystem": "Emscripten MEMFS",
  "runtimeTested": ["jq --version", "select/map JSON transformation", "Oniguruma-backed test() regex"],
  "notes": [
    "The upstream jq CLI is preserved instead of wrapping a reduced custom query API.",
    "Oniguruma is built from jq's exact pinned 6.9.10 submodule commit.",
    "Each invocation runs in a fresh outer Worker and requires neither pthreads nor SharedArrayBuffer.",
    "Browser input files and jq modules/data files must be staged into MEMFS; host shell pipes and filesystem semantics are not available."
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
  "package": "jq",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {"name": "jq", "version": "${JQ_REF#jq-}", "ref": "$JQ_REF", "commit": "$JQ_COMMIT"},
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
    "initialMemory": 33554432,
    "maximumMemory": 536870912,
    "memoryGrowth": true,
    "stackSize": 1048576
  },
  "build": {
    "binaryLicense": "$PROFILE_BINARY_LICENSE",
    "externalLibraries": ["Oniguruma $ONIGURUMA_VERSION ($ONIGURUMA_COMMIT)"],
    "tools": ["jq"]
  },
  "files": {
EOF_JSON
first=1
for name in jq-core.js jq-core.wasm jq-core.js.gz jq-core.wasm.gz; do
  [[ $first -eq 1 ]] || printf ',\n'
  file_json "$name"
  first=0
done
printf '\n  }\n}\n'
} > /out/manifest.json

cat > /out/BUILDINFO.txt <<EOF_TXT
WASM Zoo / jq
==============
Zoo build version: $BUILDER_VERSION
Profile: $PROFILE
Profile label: $PROFILE_DISPLAY_NAME
Binary license: $PROFILE_BINARY_LICENSE

jq ref: $JQ_REF
jq commit: $JQ_COMMIT
jq repository: $JQ_REPOSITORY
Oniguruma version: $ONIGURUMA_VERSION
Oniguruma commit: $ONIGURUMA_COMMIT
Oniguruma repository: $ONIGURUMA_REPOSITORY

Emscripten version: $EMSDK_VERSION
Emscripten commit: $EMSCRIPTEN_COMMIT

Browser target:
- upstream jq CLI
- builtin Oniguruma regular expressions
- single-threaded WebAssembly in a fresh outer Worker per invocation
- Emscripten MEMFS; no SharedArrayBuffer or cross-origin isolation required
- stdout/stderr captured by the thin Zoo runtime wrapper
- no host filesystem, native shell pipes/TTY semantics or Zoo-provided network access
EOF_TXT

cp /src/jq/COPYING /out/LICENSE-jq.txt
cp /src/jq/vendor/oniguruma/COPYING /out/LICENSE-oniguruma.txt
printf '[OK] jq %s built: upstream CLI + builtin Oniguruma\n' "$PROFILE"
