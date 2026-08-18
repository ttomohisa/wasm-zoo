#!/usr/bin/env bash
set -euo pipefail
source /workspace/scripts/docker-common.sh
: "${X264_REPOSITORY:?}" "${X264_FALLBACK_REPOSITORY:?}" "${X264_COMMIT:?}" "${INSTALL_DIR:?}" "${SRC_DIR:?}"
JOBS="${JOBS:-$(nproc)}"
mkdir -p "$SRC_DIR" "$INSTALL_DIR"
print_toolchain
log "Fetching exact x264 source"
clone_exact_commit "$X264_REPOSITORY" "$X264_FALLBACK_REPOSITORY" "$X264_COMMIT" "$SRC_DIR/x264"
pushd "$SRC_DIR/x264" >/dev/null
export CFLAGS="-O3 -msimd128 -fPIC"
export CXXFLAGS="$CFLAGS"
log "Building x264 static library (asm/opencl/thread disabled for portability)"
emconfigure ./configure \
  --prefix="$INSTALL_DIR" \
  --host=x86-gnu \
  --enable-static \
  --disable-cli \
  --disable-asm \
  --disable-opencl \
  --disable-thread \
  --bit-depth=8 \
  --chroma-format=420 \
  --extra-cflags="$CFLAGS"
emmake make -j"$JOBS"
emmake make install-lib-static
popd >/dev/null
