#!/usr/bin/env bash
set -euo pipefail
source /workspace/scripts/docker-common.sh
: "${BUILDER_VERSION:?}" "${EMSDK_VERSION:?}" "${EMSCRIPTEN_COMMIT:?}" "${FFMPEG_REF:?}" "${FFMPEG_COMMIT:?}" "${PROFILE:?}" "${OUT_DIR:?}" "${SRC_DIR:?}" "${INSTALL_DIR:?}"
load_profile
print_toolchain
JOBS="${JOBS:-$(nproc)}"
PTHREAD_POOL_SIZE="${PTHREAD_POOL_SIZE:-32}"
MODE_OUT="$OUT_DIR"
mkdir -p "$MODE_OUT"

export PKG_CONFIG_PATH="$INSTALL_DIR/lib/pkgconfig"
export EM_PKG_CONFIG_PATH="$PKG_CONFIG_PATH"
export CFLAGS="-O3 -pthread -msimd128 -I$INSTALL_DIR/include"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-pthread -msimd128 -L$INSTALL_DIR/lib"

pushd "$SRC_DIR/ffmpeg" >/dev/null
log "Configuring upstream ffmpeg CLI: $PROFILE"
emconfigure ./configure \
  --target-os=none \
  --arch=x86_32 \
  --enable-cross-compile \
  --disable-asm \
  --disable-stripping \
  --disable-doc \
  --disable-debug \
  --disable-checkasm \
  --disable-runtime-cpudetect \
  --disable-autodetect \
  --disable-network \
  --disable-iconv \
  --enable-pthreads \
  --disable-w32threads \
  --disable-os2threads \
  --disable-ffplay \
  --disable-ffprobe \
  --disable-avdevice \
  --nm=emnm --ar=emar --ranlib=emranlib \
  --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --ld=emcc \
  --extra-cflags="$CFLAGS" \
  --extra-cxxflags="$CXXFLAGS" \
  --extra-ldflags="$LDFLAGS" \
  "${PROFILE_FLAGS[@]}"

for feature in "${PROFILE_REQUIRED_CONFIG[@]}"; do assert_ffmpeg_config "$feature"; done
grep -q '^HAVE_PTHREADS=yes$' ffbuild/config.mak || fail "pthreads were not detected"
grep -q '^HAVE_THREADS=yes$' ffbuild/config.mak || fail "FFmpeg CLI requires a thread backend"

ENABLED_CONFIG_COUNT="$(grep -Ec '^CONFIG_[A-Z0-9_]+=yes$' ffbuild/config.mak)"
log "Enabled FFmpeg CONFIG entries: $ENABLED_CONFIG_COUNT"

log "Linking upstream fftools/ffmpeg as pthread + WASM SIMD"
LDEXEFLAGS_VALUE="-O3 -pthread -msimd128 -sMODULARIZE=1 -sEXPORT_NAME=createFFmpegCore -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sFORCE_FILESYSTEM=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=2147483648 -sSTACK_SIZE=8388608 -sENVIRONMENT=web,worker -sPTHREAD_POOL_SIZE=${PTHREAD_POOL_SIZE} -sPTHREAD_POOL_SIZE_STRICT=2 -sINCOMING_MODULE_JS_API=wasmBinary,locateFile,mainScriptUrlOrBlob,print,printErr -sEXPORTED_RUNTIME_METHODS=FS,callMain"
emmake make -j"$JOBS" ffmpeg_g.js EXESUF=.js LDEXEFLAGS="$LDEXEFLAGS_VALUE"

for file in ffmpeg_g.js ffmpeg_g.wasm; do [[ -s "$file" ]] || fail "$file was not produced"; done
cp ffmpeg_g.js "$MODE_OUT/ffmpeg-core.js"
cp ffmpeg_g.wasm "$MODE_OUT/ffmpeg-core.wasm"
cp ffbuild/config.mak "$MODE_OUT/ffmpeg-config.mak"

json_array_for_suffix() {
  local suffix="$1"
  grep -E "^CONFIG_[A-Z0-9_]+_${suffix}=yes$" ffbuild/config.mak \
    | sed -E "s/^CONFIG_(.*)_${suffix}=yes$/\1/" \
    | sort \
    | awk 'BEGIN{printf "["} {if(NR>1)printf ","; printf "\"%s\"",$0} END{print "]"}'
}
cat > "$MODE_OUT/features.json" <<EOF_FEATURES
{
  "schemaVersion": 1,
  "profile": "$PROFILE",
  "enabledConfigEntries": $ENABLED_CONFIG_COUNT,
  "decoders": $(json_array_for_suffix DECODER),
  "encoders": $(json_array_for_suffix ENCODER),
  "demuxers": $(json_array_for_suffix DEMUXER),
  "muxers": $(json_array_for_suffix MUXER),
  "parsers": $(json_array_for_suffix PARSER),
  "filters": $(json_array_for_suffix FILTER),
  "protocols": $(json_array_for_suffix PROTOCOL)
}
EOF_FEATURES
popd >/dev/null

for name in ffmpeg-core.js ffmpeg-core.wasm; do gzip -9 -c "$MODE_OUT/$name" > "$MODE_OUT/$name.gz"; done
validate_wasm "$MODE_OUT/ffmpeg-core.wasm"
grep -q 'createFFmpegCore' "$MODE_OUT/ffmpeg-core.js" || fail "Emscripten factory not found"
for gz in "$MODE_OUT"/*.gz; do gzip -t "$gz"; done

cat > "$MODE_OUT/manifest.json" <<EOF_JSON
{
  "schemaVersion": 1,
  "distribution": "WASM Zoo",
  "package": "ffmpeg",
  "zooBuildVersion": "$BUILDER_VERSION",
  "profile": "$PROFILE",
  "profileLabel": "$PROFILE_DISPLAY_NAME",
  "upstream": {
    "version": "${FFMPEG_REF#n}",
    "ref": "$FFMPEG_REF",
    "commit": "$FFMPEG_COMMIT"
  },
  "toolchain": {
    "emscripten": "$EMSDK_VERSION",
    "emscriptenCommit": "$EMSCRIPTEN_COMMIT"
  },
  "runtime": {
    "frontend": "upstream-fftools-ffmpeg",
    "arbitraryCli": true,
    "threads": "pthreads",
    "pthreadPoolSize": $PTHREAD_POOL_SIZE,
    "pthreadPoolSizeStrict": 2,
    "simd": "wasm-simd128",
    "requiresSharedArrayBuffer": true,
    "requiresCrossOriginIsolation": true,
    "worker": true,
    "pthreadBootstrap": "main-script",
    "separatePthreadWorkerFile": false,
    "network": false
  },
  "build": {
    "enabledConfigEntries": $ENABLED_CONFIG_COUNT,
    "externalLibraries": $([[ "$PROFILE_USE_X264" == "1" ]] && printf '["libx264"]' || printf '[]'),
    "binaryLicense": "$PROFILE_BINARY_LICENSE"
  },
  "knownNativeGaps": [
    "hardware acceleration APIs (CUDA, VAAPI, VideoToolbox, V4L2, etc.)",
    "native capture/device APIs (libavdevice disabled)",
    "native socket/network protocols (network disabled)",
    "optional third-party libraries not explicitly built by this profile"
  ],
  "files": {
    "ffmpeg-core.js": {"bytes": $(bytes_of "$MODE_OUT/ffmpeg-core.js"), "sha256": "$(sha256_of "$MODE_OUT/ffmpeg-core.js")"},
    "ffmpeg-core.wasm": {"bytes": $(bytes_of "$MODE_OUT/ffmpeg-core.wasm"), "sha256": "$(sha256_of "$MODE_OUT/ffmpeg-core.wasm")"},
    "ffmpeg-core.js.gz": {"bytes": $(bytes_of "$MODE_OUT/ffmpeg-core.js.gz"), "sha256": "$(sha256_of "$MODE_OUT/ffmpeg-core.js.gz")"},
    "ffmpeg-core.wasm.gz": {"bytes": $(bytes_of "$MODE_OUT/ffmpeg-core.wasm.gz"), "sha256": "$(sha256_of "$MODE_OUT/ffmpeg-core.wasm.gz")"},
    "features.json": {"bytes": $(bytes_of "$MODE_OUT/features.json"), "sha256": "$(sha256_of "$MODE_OUT/features.json")"}
  }
}
EOF_JSON

log "Full CLI build completed"
find "$MODE_OUT" -maxdepth 1 -type f -printf '%f %k KB\n' | sort
