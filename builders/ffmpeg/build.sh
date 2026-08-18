#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
[[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unknown profile: $PROFILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ROOT/profiles/$PROFILE/profile.env"
case "$PROFILE_USE_X264" in
  0) TARGET=export-no-x264 ;;
  1) TARGET=export-with-x264 ;;
  *) echo "Invalid PROFILE_USE_X264" >&2; exit 1 ;;
esac
OUT="$ROOT/dist/$PROFILE"
rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=()
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  cache_args=(--cache-from "type=gha,scope=ffmpeg-$PROFILE" --cache-to "type=gha,mode=max,scope=ffmpeg-$PROFILE")
fi

docker buildx build \
  "${cache_args[@]}" \
  --file "$ROOT/docker/Dockerfile" \
  --target "$TARGET" \
  --build-arg "BUILDER_VERSION=$BUILDER_VERSION" \
  --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
  --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
  --build-arg "FFMPEG_REPOSITORY=$FFMPEG_REPOSITORY" \
  --build-arg "FFMPEG_REF=$FFMPEG_REF" \
  --build-arg "FFMPEG_COMMIT=$FFMPEG_COMMIT" \
  --build-arg "X264_REPOSITORY=$X264_REPOSITORY" \
  --build-arg "X264_FALLBACK_REPOSITORY=$X264_FALLBACK_REPOSITORY" \
  --build-arg "X264_REF=$X264_REF" \
  --build-arg "X264_COMMIT=$X264_COMMIT" \
  --build-arg "PROFILE=$PROFILE" \
  --output "type=local,dest=$OUT" \
  "$ROOT"

for file in ffmpeg-core.js ffmpeg-core.wasm manifest.json browser-ffmpeg.js smoke-test.html smoke-input.mp4; do
  [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }
done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
printf '\n[OK] FFmpeg %s build + browser smoke test passed\n' "$PROFILE"
