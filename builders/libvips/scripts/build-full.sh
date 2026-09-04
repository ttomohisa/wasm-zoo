#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}"
: "${EMSDK_VERSION:?}"
: "${EMSCRIPTEN_COMMIT:?}"
: "${LIBVIPS_REF:?}"
: "${LIBVIPS_COMMIT:?}"
: "${WASM_VIPS_REPOSITORY:?}"
: "${WASM_VIPS_COMMIT:?}"
: "${WASM_VIPS_VERSION:?}"
: "${WASM_VIPS_LIBVIPS_PATCH_REPOSITORY:?}"
: "${WASM_VIPS_LIBVIPS_PATCH_COMMIT:?}"
: "${PROFILE:?}"
# shellcheck disable=SC1090
source "/builder-profiles/$PROFILE/profile.env"
[[ "$PROFILE_ID" == "$PROFILE" ]] || { echo "Profile mismatch" >&2; exit 1; }

LIBVIPS_VERSION="${LIBVIPS_REF#v}"
rm -rf /out /src/wasm-vips /tmp/libvips-patch
mkdir -p /out /src

# Reconstruct the libvips Emscripten patch from immutable commits. This avoids
# depending on kleisauke/wasm-vips-<version> moving after a Zoo release.
git init -q /tmp/libvips-patch
git -C /tmp/libvips-patch remote add upstream https://github.com/libvips/libvips.git
git -C /tmp/libvips-patch remote add fork "$WASM_VIPS_LIBVIPS_PATCH_REPOSITORY"
git -C /tmp/libvips-patch fetch -q --depth 1 upstream "$LIBVIPS_REF":refs/remotes/upstream/base
git -C /tmp/libvips-patch fetch -q --depth 1 fork "$WASM_VIPS_LIBVIPS_PATCH_COMMIT":refs/remotes/fork/patched
actual_vips="$(git -C /tmp/libvips-patch rev-parse refs/remotes/upstream/base)"
[[ "$actual_vips" == "$LIBVIPS_COMMIT" ]] || { echo "libvips commit mismatch: expected $LIBVIPS_COMMIT got $actual_vips" >&2; exit 1; }
git -C /tmp/libvips-patch diff --binary refs/remotes/upstream/base refs/remotes/fork/patched > /opt/libvips-wasm.patch
[[ -s /opt/libvips-wasm.patch ]] || { echo "libvips compatibility patch was empty" >&2; exit 1; }
git -C /tmp/libvips-patch show refs/remotes/upstream/base:LICENSE > /opt/LICENSE-libvips.txt
[[ -s /opt/LICENSE-libvips.txt ]] || { echo "libvips LICENSE could not be extracted from pinned upstream commit" >&2; exit 1; }

# Fetch the browser adapter at an immutable commit.
git init -q /src/wasm-vips
git -C /src/wasm-vips remote add origin "$WASM_VIPS_REPOSITORY"
git -C /src/wasm-vips fetch -q --depth 1 origin "$WASM_VIPS_COMMIT"
git -C /src/wasm-vips checkout -q --detach FETCH_HEAD
actual_adapter="$(git -C /src/wasm-vips rev-parse HEAD)"
[[ "$actual_adapter" == "$WASM_VIPS_COMMIT" ]] || { echo "wasm-vips commit mismatch" >&2; exit 1; }
grep -q "version: '$WASM_VIPS_VERSION'" /src/wasm-vips/meson.build || { echo "wasm-vips version mismatch" >&2; exit 1; }
grep -q "VERSION_VIPS=$LIBVIPS_VERSION" /src/wasm-vips/build.sh || { echo "Pinned wasm-vips recipe does not target libvips $LIBVIPS_VERSION" >&2; exit 1; }

# Replace the recipe's moving GitHub compare branch with our locally
# reconstructed immutable patch.
python3 - <<'PY'
from pathlib import Path
p = Path('/src/wasm-vips/build.sh')
s = p.read_text()
old = 'curl -Ls https://github.com/libvips/libvips/compare/v$VERSION_VIPS...kleisauke:wasm-vips-$VERSION_VIPS.patch | patch -p1'
new = 'patch -p1 < /opt/libvips-wasm.patch'
if old not in s:
    raise SystemExit('Expected wasm-vips libvips patch command was not found')
p.write_text(s.replace(old, new))
PY

# browser-core keeps JPEG/PNG/WebP but removes format/delegate code that is not
# useful for the small Browser-Kitty-oriented distribution. We patch only the
# pinned adapter recipe and fail if its expected structure changes.
if [[ "$PROFILE_TRIM_RASTER" == "true" ]]; then
  export WASM_ZOO_BROWSER_CORE=true
  export WASM_ZOO_CORE_MESON_ARGS='-Dcgif=disabled -Dimagequant=disabled -Dquantizr=disabled -Dtiff=disabled -Dnsgif=false -Dppm=false -Danalyze=false -Dradiance=false'
  python3 - <<'PY'
from pathlib import Path
p = Path('/src/wasm-vips/build.sh')
s = p.read_text()

def replace_once(old, new):
    global s
    if old not in s:
        raise SystemExit(f'Expected browser-core recipe marker was not found: {old}')
    s = s.replace(old, new, 1)

for marker in [
    '[ -f "$TARGET/lib/pkgconfig/imagequant.pc" ] || (',
    '[ -f "$TARGET/lib/pkgconfig/cgif.pc" ] || (',
    '[ -f "$TARGET/lib/pkgconfig/libtiff-4.pc" ] || (',
]:
    replace_once(marker, '[ "${WASM_ZOO_BROWSER_CORE:-false}" = "true" ] || ' + marker)
needle = '-Drsvg=disabled ${DISABLE_UHDR:+-Duhdr=disabled} ' + chr(92)
replace_once(needle, needle + '\n    $WASM_ZOO_CORE_MESON_ARGS ' + chr(92))
p.write_text(s)
PY
else
  export WASM_ZOO_BROWSER_CORE=false
  export WASM_ZOO_CORE_MESON_ARGS=''
fi

cd /src/wasm-vips
# Both profiles retain libvips' pthread/SIMD execution model. The full profile
# keeps TIFF/GIF/imagequant while core deliberately trims those extras.
./build.sh --disable-uhdr --disable-jxl --disable-avif --disable-svg --disable-modules -e web

if [[ "$PROFILE_TRIM_RASTER" == "true" ]]; then
  python3 - <<'PY'
import json
from pathlib import Path
p = Path('build/target/versions.json')
data = json.loads(p.read_text())
for key in ('cgif', 'imagequant', 'quantizr', 'tiff'):
    data.pop(key, None)
p.write_text(json.dumps(data, indent=2) + '\n')
PY
fi

for file in lib/vips.js lib/vips.wasm lib/vips.d.ts build/target/versions.json; do
  [[ -s "$file" ]] || { echo "Missing wasm-vips output: $file" >&2; exit 1; }
done

grep -q '"vips": "8.18.6"' build/target/versions.json || { echo "Built versions.json does not contain libvips 8.18.6" >&2; exit 1; }
grep -q '"emscripten": "6.0.8"' build/target/versions.json || { echo "Built versions.json does not contain Emscripten 6.0.8" >&2; exit 1; }

cp lib/vips.js /out/vips.js
cp lib/vips.wasm /out/vips.wasm
cp lib/vips.d.ts /out/vips.d.ts
cp build/target/versions.json /out/versions.json
cp /runtime/browser-libvips.js /out/browser-libvips.js
cp /fixture/smoke-input.png /out/smoke-input.png
cp LICENSE /out/LICENSE-wasm-vips.txt
cp THIRD-PARTY-NOTICES.md /out/THIRD-PARTY-NOTICES-wasm-vips.md
cp /opt/LICENSE-libvips.txt /out/LICENSE-libvips.txt

gzip -9 -n -c /out/vips.js > /out/vips.js.gz
gzip -9 -n -c /out/vips.wasm > /out/vips.wasm.gz

cat > /out/features.json <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "libvips",
  "profile": "$PROFILE",
  "api": "wasm-vips Embind browser API",
  "formats": {
    "jpeg": true,
    "png": true,
    "webp": true,
    "tiff": $PROFILE_TIFF,
    "gif": $PROFILE_GIF,
    "heif_avif": false,
    "jpeg_xl": false,
    "svg_resvg": false,
    "ultrahdr": false,
    "imagequant": $PROFILE_IMAGEQUANT,
    "quantizr": false
  },
  "features": {
    "resize": true,
    "thumbnail": true,
    "colourspace": true,
    "convolution": true,
    "composite": true,
    "pthreads": true,
    "simd": true,
    "memoryGrowth": true
  },
  "runtimeTested": ["libvips version", "PNG decode", "2x2 -> 1x1 resize", "JPEG encode", "WebP encode"],
  "notes": [
    "The JavaScript binding is built from the exact pinned wasm-vips adapter commit; libvips itself is the exact upstream v8.18.6 release.",
    "AVIF/HEIC, JPEG XL, SVG/resvg and UltraHDR are disabled in both profiles to reduce build and download surface.",
    "browser-core additionally disables TIFF, GIF, imagequant/quantizr, PPM, Analyze and Radiance support while keeping JPEG, PNG and WebP.",
    "SharedArrayBuffer and cross-origin isolation are required because libvips retains its pthread execution model."
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
  "package": "libvips",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {
    "name": "libvips",
    "version": "$LIBVIPS_VERSION",
    "ref": "$LIBVIPS_REF",
    "commit": "$LIBVIPS_COMMIT"
  },
  "adapter": {
    "name": "wasm-vips",
    "version": "$WASM_VIPS_VERSION",
    "commit": "$WASM_VIPS_COMMIT",
    "libvipsPatchCommit": "$WASM_VIPS_LIBVIPS_PATCH_COMMIT"
  },
  "toolchain": {
    "name": "Emscripten",
    "version": "$EMSDK_VERSION",
    "commit": "$EMSCRIPTEN_COMMIT"
  },
  "runtime": {
    "threads": true,
    "threadBackend": "pthreads",
    "simd": true,
    "sharedArrayBuffer": true,
    "crossOriginIsolation": true,
    "network": false,
    "filesystem": "MEMFS",
    "initialMemory": 268435456,
    "memoryGrowth": true,
    "pthreadPoolMinimum": 6
  },
  "build": {
    "binaryLicense": "$PROFILE_BINARY_LICENSE",
    "bindingLicense": "MIT",
    "disabledDelegates": $PROFILE_DISABLED_DELEGATES_JSON,
    "primaryApi": "vips.js Embind API"
  },
  "files": {
EOF_JSON
  first=1
  for name in vips.js vips.wasm vips.d.ts vips.js.gz vips.wasm.gz versions.json; do
    [[ $first -eq 1 ]] || printf ',\n'
    file_json "$name"
    first=0
  done
  printf '\n  }\n}\n'
} > /out/manifest.json

cat > /out/BUILDINFO.txt <<EOF_TXT
WASM Zoo / libvips
==================
Zoo build version: $BUILDER_VERSION
Profile: $PROFILE
Profile label: $PROFILE_DISPLAY_NAME
Binary license: $PROFILE_BINARY_LICENSE

libvips ref: $LIBVIPS_REF
libvips commit: $LIBVIPS_COMMIT

wasm-vips adapter version: $WASM_VIPS_VERSION
wasm-vips adapter commit: $WASM_VIPS_COMMIT
libvips compatibility patch commit: $WASM_VIPS_LIBVIPS_PATCH_COMMIT

Emscripten version: $EMSDK_VERSION
Emscripten commit: $EMSCRIPTEN_COMMIT

Browser target:
- library API via pinned wasm-vips Embind adapter
- pthreads + WebAssembly SIMD
- SharedArrayBuffer and cross-origin isolation required
- Emscripten MEMFS and memory growth
- raster formats: $PROFILE_FORMAT_SUMMARY
- AVIF/HEIC, JPEG XL, SVG/resvg and UltraHDR disabled in the current profiles
- browser-core additionally removes TIFF, GIF, imagequant/quantizr, PPM, Analyze and Radiance support
EOF_TXT

echo "[OK] libvips $LIBVIPS_VERSION built: browser API"
