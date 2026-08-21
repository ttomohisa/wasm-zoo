#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
TAG="${1:-ffmpeg-v${BUILDER_VERSION}}"
PROFILES=(browser-full browser-full-gpl)
EXPECTED="ffmpeg-v${BUILDER_VERSION}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Release tag must be $EXPECTED" >&2; exit 1; }
for cmd in git tar gzip sha256sum zip; do command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }; done

for profile in "${PROFILES[@]}"; do
  dist="$ROOT/dist/$profile"
  for file in ffmpeg-core.js ffmpeg-core.wasm ffmpeg-core.js.gz ffmpeg-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json ffmpeg-config.mak browser-ffmpeg.js; do
    [[ -s "$dist/$file" ]] || { echo "Missing $dist/$file; build both profiles first" >&2; exit 1; }
  done
done

release="$ROOT/release"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
rm -rf "$release" && mkdir -p "$release"

fetch_exact() {
  local label="$1" primary="$2" fallback="$3" commit="$4" dst="$5"
  echo "[release] fetch $label $commit"
  mkdir -p "$dst" && git -C "$dst" init -q && git -C "$dst" remote add origin "$primary"
  if ! git -C "$dst" fetch --depth 1 origin "$commit"; then
    [[ -n "$fallback" ]] || return 1
    git -C "$dst" remote set-url origin "$fallback"
    git -C "$dst" fetch --depth 1 origin "$commit"
  fi
  git -C "$dst" checkout -q --detach FETCH_HEAD
  [[ "$(git -C "$dst" rev-parse HEAD)" == "$commit" ]]
}

ffsrc="$work/ffmpeg-${FFMPEG_REF}"
xsrc="$work/x264-${X264_COMMIT:0:12}"
fetch_exact FFmpeg "$FFMPEG_REPOSITORY" "" "$FFMPEG_COMMIT" "$ffsrc"
fetch_exact x264 "$X264_REPOSITORY" "$X264_FALLBACK_REPOSITORY" "$X264_COMMIT" "$xsrc"

write_buildinfo() {
  local profile="$1" out="$2"
  # shellcheck disable=SC1090
  source "$ROOT/profiles/$profile/profile.env"
  {
    echo "WASM Zoo / FFmpeg"
    echo "================="
    echo "Zoo build version: $BUILDER_VERSION"
    echo "Release tag: $TAG"
    echo "Profile: $profile"
    echo "Profile label: $PROFILE_DISPLAY_NAME"
    echo "Binary license: $PROFILE_BINARY_LICENSE"
    echo
    echo "FFmpeg ref: $FFMPEG_REF"
    echo "FFmpeg commit: $FFMPEG_COMMIT"
    echo "FFmpeg repository: $FFMPEG_REPOSITORY"
    echo
    echo "Emscripten version: $EMSDK_VERSION"
    echo "Emscripten ref: $EMSCRIPTEN_REF"
    echo "Emscripten commit: $EMSCRIPTEN_COMMIT"
    echo "Emscripten repository: $EMSCRIPTEN_REPOSITORY"
    if [[ "$PROFILE_USE_X264" == "1" ]]; then
      echo
      echo "x264 ref: $X264_REF"
      echo "x264 commit: $X264_COMMIT"
      echo "x264 repository: $X264_REPOSITORY"
    fi
    echo
    echo "Common target constraints:"
    echo "- upstream fftools/ffmpeg CLI"
    echo "- Emscripten pthreads"
    echo "- WebAssembly SIMD (-msimd128)"
    echo "- SharedArrayBuffer + COOP/COEP required"
    echo "- libavdevice disabled"
    echo "- native network protocols disabled"
    echo "- native hardware acceleration APIs unavailable"
    echo
    echo "Profile-specific configure flags:"
    sed -e 's/\r$//' -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$ROOT/profiles/$profile/ffmpeg.flags"
    echo
    echo "See manifest.json, features.json and ffmpeg-config.mak for the exact generated feature set and binary hashes."
  } > "$out"
}

make_zip() {
  local profile="$1" info="$2"
  # shellcheck disable=SC1090
  source "$ROOT/profiles/$profile/profile.env"
  local stage="$work/binary-$profile"
  mkdir -p "$stage/LICENSES"
  for file in ffmpeg-core.js ffmpeg-core.wasm ffmpeg-core.js.gz ffmpeg-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json ffmpeg-config.mak browser-ffmpeg.js; do cp "$ROOT/dist/$profile/$file" "$stage/"; done
  cp "$info" "$stage/BUILDINFO.txt"
  cp "$ffsrc/LICENSE.md" "$stage/LICENSES/FFmpeg-LICENSE.md"
  if [[ "$PROFILE_BINARY_LICENSE" == GPL-* ]]; then cp "$ffsrc/COPYING.GPLv2" "$stage/LICENSES/FFmpeg-COPYING.GPLv2"; else cp "$ffsrc/COPYING.LGPLv2.1" "$stage/LICENSES/FFmpeg-COPYING.LGPLv2.1"; fi
  if [[ "$PROFILE_USE_X264" == "1" ]]; then cp "$xsrc/COPYING" "$stage/LICENSES/x264-COPYING"; fi
  cat > "$stage/LICENSES/Emscripten-toolchain.txt" <<EOT
Generated with emscripten/emsdk:$EMSDK_VERSION.
Emscripten source: $EMSCRIPTEN_REPOSITORY
Ref: $EMSCRIPTEN_REF
Commit: $EMSCRIPTEN_COMMIT
See the upstream Emscripten repository for its license notices and source.
EOT
  find "$stage" -exec touch -t 198001010000 {} +
  local name="ffmpeg-${profile}-${FFMPEG_REF#n}-zoo-${BUILDER_VERSION}.zip"
  (cd "$stage" && zip -X -9 -q -r "$release/$name" .)
}

for profile in "${PROFILES[@]}"; do
  info="$release/BUILDINFO-${profile}.txt"
  write_buildinfo "$profile" "$info"
  make_zip "$profile" "$info"
  cp "$ROOT/dist/$profile/provenance.json" "$release/provenance-${profile}.json"
  cp "$ROOT/dist/$profile/sbom.cdx.json" "$release/sbom-${profile}.cdx.json"
done

rm -rf "$ffsrc/.git" "$xsrc/.git"
source_root="$work/source-bundle"
mkdir -p "$source_root"
mv "$ffsrc" "$source_root/ffmpeg-${FFMPEG_REF}"
mv "$xsrc" "$source_root/x264-${X264_COMMIT:0:12}"
mkdir -p "$source_root/wasm-zoo-builder"
tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -
cp "$release"/BUILDINFO-*.txt "$source_root/"
cat > "$source_root/README.txt" <<EOT
Corresponding source and build recipe for WASM Zoo FFmpeg $TAG.
Contains exact FFmpeg source, exact x264 source used by browser-full-gpl, and the Zoo FFmpeg build recipe.
The exact Emscripten toolchain ref/commit is recorded in BUILDINFO and versions.env.
EOT
source_name="ffmpeg-sources-${FFMPEG_REF#n}-zoo-${BUILDER_VERSION}.tar.gz"
tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$release/$source_name" source-bundle

(
  cd "$release"
  sha256sum \
    "ffmpeg-browser-full-${FFMPEG_REF#n}-zoo-${BUILDER_VERSION}.zip" \
    "ffmpeg-browser-full-gpl-${FFMPEG_REF#n}-zoo-${BUILDER_VERSION}.zip" \
    "$source_name" \
    BUILDINFO-browser-full.txt BUILDINFO-browser-full-gpl.txt \
    provenance-browser-full.json provenance-browser-full-gpl.json \
    sbom-browser-full.cdx.json sbom-browser-full-gpl.cdx.json > SHA256SUMS.txt
)
echo "[OK] release assets prepared in $release"
