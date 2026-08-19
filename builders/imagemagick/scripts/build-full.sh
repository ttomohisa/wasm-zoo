#!/usr/bin/env bash
set -euo pipefail
: "${BUILDER_VERSION:?}"
: "${IMAGEMAGICK_REF:?}"
: "${IMAGEMAGICK_COMMIT:?}"
: "${PROFILE:=browser-full}"
PROFILE_DIR="/workspace/profiles/$PROFILE"
# shellcheck disable=SC1090
source "$PROFILE_DIR/profile.env"
[[ "$PROFILE_ID" == "$PROFILE" ]] || { echo "Profile mismatch" >&2; exit 1; }

rm -rf /build/imagemagick /out
mkdir -p /build/imagemagick /out

embuilder build zlib libpng libjpeg

# ImageMagick 7.1.2 detects PNG exclusively through pkg-config (libpng >= 1.0.0).
# Emscripten 6.0.6's normal single-threaded libpng port does not install
# libpng.pc, so provide a tiny target-specific record that lets ImageMagick
# configure discover the pinned Emscripten port without enabling pthreads.
LIBPNG_PORT_VERSION="1.6.58"
PORT_PKGCONFIG_DIR="/workspace/wasm-zoo-pkgconfig"
mkdir -p "$PORT_PKGCONFIG_DIR"
cat > "$PORT_PKGCONFIG_DIR/libpng.pc" <<EOF_PC
Name: libpng
Description: Emscripten libpng port for WASM Zoo ImageMagick
Version: $LIBPNG_PORT_VERSION
Libs: -sUSE_LIBPNG=1
Cflags:
EOF_PC
# emconfigure intentionally replaces PKG_CONFIG_PATH. Emscripten 6.0.6 maps
# EM_PKG_CONFIG_PATH into the configure environment, so use that supported
# handoff instead of exporting PKG_CONFIG_PATH directly.
export EM_PKG_CONFIG_PATH="$PORT_PKGCONFIG_DIR"
actual_libpng_version="$(PKG_CONFIG_PATH="$EM_PKG_CONFIG_PATH" pkg-config --modversion libpng)"
[[ "$actual_libpng_version" == "$LIBPNG_PORT_VERSION" ]] || {
  echo "[ERROR] libpng pkg-config shim mismatch: expected $LIBPNG_PORT_VERSION got $actual_libpng_version" >&2
  exit 1
}

# Verify the exact environment that emconfigure will hand to ImageMagick before
# spending minutes on the full Autoconf probe set.
if ! emconfigure sh -c '''
  set -eu
  echo "[INFO] emconfigure PKG_CONFIG_PATH=$PKG_CONFIG_PATH"
  pkg-config --exists "libpng >= 1.0.0"
  version="$(pkg-config --modversion libpng)"
  libs="$(pkg-config --libs libpng)"
  test "$version" = "1.6.58"
  echo "[OK] emconfigure sees libpng $version ($libs)"
'''; then
  echo "[ERROR] emconfigure cannot see the Emscripten libpng pkg-config shim." >&2
  exit 1
fi

# Keep Autoconf probe links simple. Browser-runtime settings such as
# MODULARIZE and ENVIRONMENT are only valid/meaningful for the final JS link
# and can make configure's extension-less conftest executables fail.
PORT_FLAGS="-sUSE_ZLIB=1 -sUSE_LIBPNG=1 -sUSE_LIBJPEG=1"
CONFIGURE_CFLAGS="-O3 $PORT_FLAGS"
# Keep source compilation at -O3, but link the final Wasm module at -O1 while
# function-pointer cast emulation is enabled. Emscripten 6.0.6 runs fpcast-emu
# at -O1 without the O2+ Binaryen optimizer pipeline that previously crashed on
# this ImageMagick module. A 4 MiB stack is retained because the default 64 KiB stack overflowed on the real PNG decode path.
FINAL_LINK_FLAGS="-O1 $PORT_FLAGS -sMODULARIZE=1 -sEXPORT_NAME=createImageMagickCore -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=2147483648 -sSTACK_SIZE=4194304 -sFORCE_FILESYSTEM=1 -sENVIRONMENT=web,worker -sINCOMING_MODULE_JS_API=wasmBinary,locateFile,print,printErr -sEXPORTED_RUNTIME_METHODS=FS,callMain -sEMULATE_FUNCTION_POINTER_CASTS=1"
export CFLAGS="$CONFIGURE_CFLAGS"
export CXXFLAGS="$CONFIGURE_CFLAGS"
export CPPFLAGS="$PORT_FLAGS"
# Do not export FINAL_LINK_FLAGS as LDFLAGS during configure.
export LDFLAGS="$PORT_FLAGS"

cd /src/imagemagick

# ImageMagick's OpenPixelCache() normally performs a one-time security-policy
# lookup for pixel-cache-memory/cache:memory-map before deciding whether to use
# anonymous mmap. browser-full is built with --enable-zero-configuration, whose
# built-in policy map is empty, and Emscripten configure reports no working mmap.
# The native probe therefore always resolves to 0 here. Initialize the cached
# decision directly to its behavior-equivalent value for this zero-configuration
# browser profile so the first pixel-cache open does not need to enter the
# policy/semaphore initialization cycle. This remains independent of threading.
# Keep the patch exact and fail fast if upstream changes the source line.
CACHE_SOURCE="MagickCore/cache.c"
cache_probe_count="$(grep -Fxc '  cache_anonymous_memory = (-1);' "$CACHE_SOURCE" || true)"
[[ "$cache_probe_count" == "1" ]] || {
  echo "[ERROR] Expected exactly one ImageMagick cache_anonymous_memory initializer; found $cache_probe_count" >&2
  exit 1
}
sed -i 's/^  cache_anonymous_memory = (-1);$/  cache_anonymous_memory = 0;/' "$CACHE_SOURCE"
grep -Fq '  cache_anonymous_memory = 0;' "$CACHE_SOURCE" || {
  echo "[ERROR] Failed to apply browser zero-config pixel-cache policy patch" >&2
  exit 1
}
echo "[OK] browser zero-config cache policy: anonymous mmap probe fixed to disabled"

if ! emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --without-modules \
  --without-perl \
  --without-x \
  --with-utilities=yes \
  --with-magick-plus-plus=no \
  --with-quantum-depth=16 \
  --with-threads=no \
  --disable-openmp \
  --disable-dpc \
  --disable-opencl \
  --without-frozenpaths \
  --enable-zero-configuration \
  --with-zlib=yes \
  --with-png=yes \
  --with-jpeg=yes \
  --without-bzlib \
  --without-webp \
  --without-tiff \
  --without-openjp2 \
  --without-lcms \
  --without-lqr \
  --without-xml \
  --without-freetype \
  --without-raqm \
  --without-heic \
  --without-openexr \
  --without-gslib \
  --without-fontconfig \
  --without-gvc \
  --without-djvu \
  --without-pango \
  --without-rsvg \
  --without-raw \
  --without-wmf \
  --without-zip \
  --without-zstd; then
  echo "[ERROR] ImageMagick configure failed. config.log tail follows:" >&2
  tail -n 240 config.log >&2 || true
  exit 1
fi

# Do not spend minutes compiling a build that silently lost a required coder.
# ImageMagick's configure can succeed even when an explicitly requested
# optional delegate was not found, so enforce the Zoo browser-full contract.
for delegate in PNG JPEG; do
  if ! grep -Eq "^#define (${delegate}_DELEGATE|MAGICKCORE_${delegate}_DELEGATE) 1" config/config.h MagickCore/magick-baseconfig.h 2>/dev/null; then
    echo "[ERROR] Required ${delegate} delegate was not enabled by ImageMagick configure." >&2
    echo "[INFO] pkg-config libpng: $(pkg-config --modversion libpng 2>/dev/null || echo unavailable)" >&2
    grep -E "(${delegate}|PNG|JPEG|DELEGATES|FEATURES)" config.log | tail -n 120 >&2 || true
    exit 1
  fi
done
if ! grep -Eq '^#define (ZERO_CONFIGURATION_SUPPORT|MAGICKCORE_ZERO_CONFIGURATION_SUPPORT) 1' config/config.h MagickCore/magick-baseconfig.h 2>/dev/null; then
  echo "[ERROR] ImageMagick zero-configuration support was not enabled." >&2
  exit 1
fi
# browser-full is intentionally single-threaded. Fail closed if configure ever
# re-enables ImageMagick's thread backend, because that would silently introduce
# pthread/shared-memory requirements into this profile.
if grep -Eq '^#define (THREAD_SUPPORT|MAGICKCORE_THREAD_SUPPORT) 1' config/config.h MagickCore/magick-baseconfig.h 2>/dev/null; then
  echo "[ERROR] ImageMagick thread support was unexpectedly enabled." >&2
  exit 1
fi
# Distributed pixel cache is a native/network-oriented facility and is outside
# this browser profile. Keep it disabled rather than carrying extra cache paths.
if grep -Eq '^#define (DPC_SUPPORT|MAGICKCORE_DPC_SUPPORT) 1' config/config.h MagickCore/magick-baseconfig.h 2>/dev/null; then
  echo "[ERROR] ImageMagick distributed pixel cache was unexpectedly enabled." >&2
  exit 1
fi

echo "[OK] configure delegates: PNG + JPEG; zero-configuration enabled"
echo "[OK] configure runtime: single-threaded; distributed pixel cache disabled"

# Apply browser runtime/link settings only to the real magick executable.
emmake make -j"$(nproc)" LDFLAGS="$FINAL_LINK_FLAGS" utilities/magick

launcher=""
for candidate in \
  /src/imagemagick/utilities/magick.js \
  /src/imagemagick/utilities/magick; do
  if [[ -s "$candidate" ]]; then launcher="$candidate"; break; fi
done
[[ -n "$launcher" ]] || {
  echo "[ERROR] ImageMagick magick JavaScript launcher was not produced" >&2
  find /src/imagemagick/utilities -maxdepth 1 -type f -printf '%f\n' >&2 || true
  exit 1
}
if [[ "$launcher" == *.js ]]; then
  wasm="${launcher%.js}.wasm"
else
  wasm="${launcher}.wasm"
fi
[[ -s "$wasm" ]] || { echo "[ERROR] magick Wasm binary was not produced next to $launcher" >&2; exit 1; }

# This profile is linked without pthreads. The browser wrapper still executes
# each CLI invocation inside its own outer Worker, so there is no Emscripten
# pthread worker asset to package and no SharedArrayBuffer requirement.
cp "$launcher" /out/magick-core.js
cp "$wasm" /out/magick-core.wasm
gzip -9 -n -c /out/magick-core.js > /out/magick-core.js.gz
gzip -9 -n -c /out/magick-core.wasm > /out/magick-core.wasm.gz

{
  echo "# WASM Zoo ImageMagick configure summary"
  echo "# ImageMagick $IMAGEMAGICK_REF / builder $BUILDER_VERSION"
  grep -E '^(DELEGATES|FEATURES)=' config.log || true
  grep -E '^(MAGICKCORE_.*|PACKAGE_.*|QuantumDepth)=' config/configure.xml 2>/dev/null || true
} > /out/imagemagick-config.txt || true

cat > /out/features.json <<EOF_JSON
{
  "schemaVersion": 1,
  "package": "imagemagick",
  "profile": "$PROFILE",
  "tools": ["magick"],
  "codecs": {
    "png": true,
    "jpeg": true,
    "gif": false,
    "webp": false,
    "tiff": false,
    "pdf_ghostscript": false,
    "heic": false
  },
  "features": {
    "identify": true,
    "resize": true,
    "convert": true,
    "font_rendering": false,
    "color_management": false,
    "multipage_pdf": false,
    "zero_configuration": true,
    "pthreads": false
  },
  "filesystem": "Emscripten MEMFS",
  "runtimeTested": ["magick -version", "identify PNG fixture", "resize PNG -> JPEG"],
  "notes": [
    "The first browser profile targets generic local image conversion rather than a desktop-complete delegate set.",
    "PNG uses Emscripten 6.0.6's standard single-threaded libpng port; a target-only libpng.pc shim bridges ImageMagick's pkg-config detection to that pinned port.",
    "ImageMagick and the final Emscripten module are built without pthreads; the CLI runs inside an outer Worker and does not require SharedArrayBuffer or cross-origin isolation.",
    "The zero-configuration browser build fixes ImageMagick's one-time anonymous pixel-cache mmap decision to disabled; the empty built-in policy plus Emscripten's unavailable working mmap make this behavior-equivalent while avoiding the policy/semaphore initialization cycle during first pixel-cache open.",
    "Optional delegates such as Ghostscript/PDF, TIFF, WebP, HEIC, XML, font rendering and color management are intentionally disabled in v0.4.0."
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
  "package": "imagemagick",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {
    "name": "ImageMagick",
    "version": "$IMAGEMAGICK_REF",
    "ref": "$IMAGEMAGICK_REF",
    "commit": "$IMAGEMAGICK_COMMIT"
  },
  "toolchain": {
    "name": "Emscripten",
    "version": "$EMSDK_VERSION",
    "commit": "$EMSCRIPTEN_COMMIT"
  },
  "runtime": {
    "threads": false,
    "threadBackend": "none",
    "simd": false,
    "sharedArrayBuffer": false,
    "crossOriginIsolation": false,
    "worker": true,
    "network": false,
    "filesystem": "MEMFS",
    "initialMemory": 134217728,
    "maximumMemory": 2147483648,
    "memoryGrowth": true,
    "stackSize": 4194304
  },
  "build": {
    "binaryLicense": "$PROFILE_BINARY_LICENSE",
    "externalLibraries": ["zlib 1.3.2 (Emscripten port)", "libpng 1.6.58 (Emscripten port)", "libjpeg 9f (Emscripten port)"],
    "tools": ["magick"]
  },
  "files": {
EOF_JSON
  first=1
  for name in magick-core.js magick-core.wasm magick-core.js.gz magick-core.wasm.gz; do
    [[ $first -eq 1 ]] || printf ',
'
    file_json "$name"
    first=0
  done
  printf '
  }
}
'
} > /out/manifest.json

cat > /out/BUILDINFO.txt <<EOF_TXT
WASM Zoo / ImageMagick
======================
Zoo build version: $BUILDER_VERSION
Profile: $PROFILE
Profile label: $PROFILE_DISPLAY_NAME
Binary license: $PROFILE_BINARY_LICENSE

ImageMagick ref: $IMAGEMAGICK_REF
ImageMagick commit: $IMAGEMAGICK_COMMIT
ImageMagick repository: $IMAGEMAGICK_REPOSITORY

Emscripten version: $EMSDK_VERSION
Emscripten commit: $EMSCRIPTEN_COMMIT

Browser target:
- upstream magick CLI
- single-threaded WebAssembly; ImageMagick thread support and OpenMP are disabled
- WebAssembly stack: 4 MiB
- outer Worker + Emscripten MEMFS; no SharedArrayBuffer or cross-origin isolation required
- zlib 1.3.2, libpng 1.6.58 and libjpeg 9f from the pinned Emscripten 6.0.6 toolchain
- ImageMagick zero-configuration mode for a self-contained browser runtime
- browser-only zero-config patch skips the behavior-equivalent anonymous pixel-cache mmap policy probe during first cache open
- no native filesystem, device access, shell pipes or subprocess semantics
- PDF/Ghostscript, TIFF, WebP, HEIC, XML, font stacks and color management intentionally disabled in v0.4.0
EOF_TXT

cp /src/imagemagick/LICENSE /out/LICENSE-imagemagick.txt
printf '[OK] ImageMagick %s built: magick CLI
' "$PROFILE"
