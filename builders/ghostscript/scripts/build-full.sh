#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}"
: "${GHOSTSCRIPT_VERSION:?}"
: "${GHOSTSCRIPT_REF:?}"
: "${GHOSTSCRIPT_COMMIT:?}"
: "${GHOSTSCRIPT_SOURCE_SHA256:?}"
: "${PROFILE:=browser-full}"
PROFILE_DIR="/workspace/profiles/$PROFILE"
# shellcheck disable=SC1090
source "$PROFILE_DIR/profile.env"
[[ "$PROFILE_ID" == "$PROFILE" ]] || { echo "Profile mismatch" >&2; exit 1; }

rm -rf /out
mkdir -p /out
cd /src/ghostscript

BUILD_TRIPLET="$(./config.guess)"
HOST_TRIPLET="$(emcc -dumpmachine)"
OPT_FLAGS="-Os -g0 -flto -ffunction-sections -fdata-sections"
CONFIGURE_LINK_FLAGS="$OPT_FLAGS"
FINAL_LINK_FLAGS="$OPT_FLAGS -sDEFAULT_TO_CXX=1 -sFILESYSTEM=1 -sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sMODULARIZE=1 -sEXPORT_NAME=createGhostscriptCore -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=2147483648 -sENVIRONMENT=web,worker -sINCOMING_MODULE_JS_API=wasmBinary,print,printErr"

# Keep the first Zoo profile close to a practical browser Ghostscript CLI: PDF
# and PostScript interpretation plus common file-output devices. Desktop-only
# integrations are explicitly removed instead of leaking host libraries into the
# cross build.
set +e
emconfigure ./configure \
  --host="$HOST_TRIPLET" \
  --build="$BUILD_TRIPLET" \
  --disable-contrib \
  --disable-cups \
  --disable-dbus \
  --disable-fontconfig \
  --disable-gtk \
  --without-libpaper \
  --without-libidn \
  --without-pdftoraster \
  --without-ijs \
  --without-x \
  --with-drivers="$GHOSTSCRIPT_DRIVER_GROUPS" \
  CFLAGS="$OPT_FLAGS" \
  CXXFLAGS="$OPT_FLAGS" \
  LDFLAGS="$CONFIGURE_LINK_FLAGS"
configure_status=$?
set -e
if [[ $configure_status -ne 0 ]]; then
  echo "[ERROR] Ghostscript configure failed" >&2
  if [[ -s config.log ]]; then
    echo "[ERROR] compiler/linker diagnostics from config.log:" >&2
    grep -n -B 8 -A 18 -E "(C compiler cannot create executables|conftest\.c|emcc: error|clang: error|wasm-ld: error|error:)" config.log | tail -n 320 >&2 || true
    echo "[ERROR] tail of config.log:" >&2
    tail -n 180 config.log >&2 || true
  fi
  exit "$configure_status"
fi

# Ghostscript links the final gs target with CC (emcc), even though bundled
# components contribute C++ objects. Emscripten does not pull in the C++
# runtime for emcc links by default, so verify our final-link policy before the
# long compile. This catches missing operator new/delete and std::__2 symbols
# immediately instead of after hundreds of seconds of compilation.
cat > /tmp/wasm-zoo-cxx-link.cpp <<'CPP_PREFLIGHT'
#include <string>
int main() { std::string s = "ghostscript"; return s.size() == 11 ? 0 : 1; }
CPP_PREFLIGHT
em++ $OPT_FLAGS -c /tmp/wasm-zoo-cxx-link.cpp -o /tmp/wasm-zoo-cxx-link.o
emcc $OPT_FLAGS -sDEFAULT_TO_CXX=1 /tmp/wasm-zoo-cxx-link.o -o /tmp/wasm-zoo-cxx-link.js
[[ -s /tmp/wasm-zoo-cxx-link.wasm ]] || { echo "[ERROR] Emscripten C++ runtime final-link preflight failed" >&2; exit 1; }
rm -f /tmp/wasm-zoo-cxx-link.cpp /tmp/wasm-zoo-cxx-link.o /tmp/wasm-zoo-cxx-link.js /tmp/wasm-zoo-cxx-link.wasm

# Autoconf must probe the Emscripten compiler with conservative linker flags.
# Browser-only JS glue settings (MODULARIZE, EXPORT_NAME, Module APIs, memory
# policy, etc.) are final-link concerns and can make configure's tiny conftest
# executable fail before Ghostscript itself is compiled. Inject them only after
# configure has completed. Ghostscript keeps auxiliary/native linker flags in
# LDFLAGSAUX, separate from the target LDFLAGS used for gs.
python3 - "$FINAL_LINK_FLAGS" <<'PY_SET_LDFLAGS'
from pathlib import Path
import sys
p = Path("Makefile")
text = p.read_text()
flags = sys.argv[1]
lines = text.splitlines()
replaced = False
for i, line in enumerate(lines):
    if line.startswith("LDFLAGS=") or line.startswith("LDFLAGS ="):
        lines[i] = f"LDFLAGS={flags}"
        replaced = True
        break
if not replaced:
    raise SystemExit("[ERROR] generated Ghostscript Makefile has no LDFLAGS assignment")
p.write_text("\n".join(lines) + "\n")
PY_SET_LDFLAGS

# Record the configured compiler before starting the long compile. The exact
# Makefile spelling varies across Ghostscript releases, while emconfigure/emmake
# already enforce the Emscripten toolchain.
grep -E "^(CC|CCAUX|CFLAGS|LDFLAGS)[[:space:]]*=" Makefile | head -n 24 || true

emmake make -j"$(nproc)"

launcher=""
for candidate in ./bin/gs ./bin/gs.js; do
  if [[ -s "$candidate" ]]; then launcher="$candidate"; break; fi
done
[[ -n "$launcher" ]] || { echo "[ERROR] Ghostscript JavaScript launcher was not produced" >&2; find ./bin -maxdepth 1 -type f -printf '%f\n' >&2 || true; exit 1; }
if [[ "$launcher" == *.js ]]; then wasm="${launcher%.js}.wasm"; else wasm="${launcher}.wasm"; fi
[[ -s "$wasm" ]] || { echo "[ERROR] Ghostscript Wasm binary was not produced next to $launcher" >&2; exit 1; }

cp "$launcher" /out/gs-core.js
cp "$wasm" /out/gs-core.wasm
gzip -9 -n -c /out/gs-core.js > /out/gs-core.js.gz
gzip -9 -n -c /out/gs-core.wasm > /out/gs-core.wasm.gz

{
  echo "# WASM Zoo Ghostscript configure summary"
  echo "# Ghostscript ${GHOSTSCRIPT_VERSION} / builder ${BUILDER_VERSION}"
  echo "# host=${HOST_TRIPLET} build=${BUILD_TRIPLET}"
  echo "# driver groups=${GHOSTSCRIPT_DRIVER_GROUPS}"
  grep -E '^(CC|CFLAGS|LDFLAGS|DEVICE_DEVS|DEVICE_DEVS[0-9]+|FEATURE_DEVS|GS_LIB_DEFAULT)[[:space:]]*=' Makefile | head -n 160 || true
} > /out/ghostscript-config.txt

cat > /out/features.json <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "ghostscript",
  "profile": "$PROFILE",
  "cli": "gs",
  "languages": {
    "postscript": true,
    "pdf": true,
    "pcl": false,
    "xps": false
  },
  "selectedDriverGroups": ["BMP", "JPEG", "PNG", "PS", "TIFF"],
  "devicesExpected": ["png16m", "jpeg", "pdfwrite"],
  "runtime": {
    "threads": false,
    "sharedArrayBuffer": false,
    "filesystem": "Emscripten MEMFS",
    "network": false
  },
  "runtimeTested": [
    "gs --version",
    "PDF input -> png16m output",
    "PostScript input -> pdfwrite output"
  ],
  "notes": [
    "Ghostscript is the PostScript/PDF interpreter from the GhostPDL source tree; GhostPCL and GhostXPS frontends are not built in this profile.",
    "CUPS, D-Bus, GTK, X11, fontconfig, libpaper, libidn, pdftoraster and IJS integrations are intentionally disabled for the browser target.",
    "Each CLI invocation runs in an isolated outer Worker with its own MEMFS instance."
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
  "package": "ghostscript",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {
    "name": "Ghostscript",
    "version": "$GHOSTSCRIPT_VERSION",
    "ref": "$GHOSTSCRIPT_REF",
    "commit": "$GHOSTSCRIPT_COMMIT",
    "releaseSourceSha256": "$GHOSTSCRIPT_SOURCE_SHA256"
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
    "initialMemory": 134217728,
    "maximumMemory": 2147483648,
    "memoryGrowth": true
  },
  "build": {
    "binaryLicense": "$PROFILE_BINARY_LICENSE",
    "arbitraryCli": true,
    "driverGroups": ["BMP", "JPEG", "PNG", "PS", "TIFF"]
  },
  "files": {
EOF_JSON
  file_json gs-core.js
  printf ',\n'
  file_json gs-core.wasm
  printf ',\n'
  file_json gs-core.js.gz
  printf ',\n'
  file_json gs-core.wasm.gz
  printf '\n  }\n}\n'
} > /out/manifest.json

cat > /out/BUILDINFO.txt <<EOF_TXT
WASM Zoo / Ghostscript
======================
Zoo build version: $BUILDER_VERSION
Profile: $PROFILE
Profile label: $PROFILE_DISPLAY_NAME
Binary license: $PROFILE_BINARY_LICENSE

Ghostscript version: $GHOSTSCRIPT_VERSION
Ghostscript source ref: $GHOSTSCRIPT_REF
Ghostscript source commit: $GHOSTSCRIPT_COMMIT
Ghostscript release source SHA-256: $GHOSTSCRIPT_SOURCE_SHA256
Ghostscript repository: $GHOSTSCRIPT_REPOSITORY

Emscripten version: $EMSDK_VERSION
Emscripten commit: $EMSCRIPTEN_COMMIT

Browser target:
- upstream gs command-line entry point
- PostScript and PDF interpretation
- BMP/JPEG/PNG/PS/TIFF output driver groups
- single-threaded WebAssembly in an outer Worker
- Emscripten MEMFS; no native filesystem/process integration
- no CUPS, D-Bus, GTK, X11, fontconfig, libpaper, libidn, pdftoraster or IJS integration
- GhostPCL/GhostXPS are not included in this Ghostscript package
EOF_TXT

cp /src/ghostscript/LICENSE /out/LICENSE-Ghostscript.txt
mkdir -p /out/THIRD-PARTY-LICENSES
: > /out/THIRD-PARTY-LICENSES/INDEX.txt
while IFS= read -r -d '' notice; do
  rel="${notice#/src/ghostscript/}"
  safe="$(printf '%s' "$rel" | tr '/ ' '__')"
  printf '%s\n' "$rel" >> /out/THIRD-PARTY-LICENSES/INDEX.txt
  cp "$notice" "/out/THIRD-PARTY-LICENSES/$safe"
done < <(find /src/ghostscript -maxdepth 5 -type f \( -iname 'LICENSE*' -o -iname 'COPYING*' -o -iname 'COPYRIGHT*' -o -iname 'NOTICE*' \) -print0 | sort -z)
printf '[OK] Ghostscript %s %s built\n' "$GHOSTSCRIPT_VERSION" "$PROFILE"
