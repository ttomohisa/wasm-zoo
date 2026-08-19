#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
[[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unknown profile: $PROFILE" >&2; exit 1; }
node --check "$ROOT/scripts/smoke-test.mjs"
node --check "$ROOT/runtime/browser-imagemagick.js"
OUT="$ROOT/dist/$PROFILE"
rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=()
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then cache_args=(--cache-from "type=gha,scope=imagemagick-$PROFILE" --cache-to "type=gha,mode=max,scope=imagemagick-$PROFILE"); fi

docker buildx build   "${cache_args[@]}"   --file "$ROOT/docker/Dockerfile"   --target export   --build-arg "BUILDER_VERSION=$BUILDER_VERSION"   --build-arg "EMSDK_VERSION=$EMSDK_VERSION"   --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT"   --build-arg "IMAGEMAGICK_REPOSITORY=$IMAGEMAGICK_REPOSITORY"   --build-arg "IMAGEMAGICK_REF=$IMAGEMAGICK_REF"   --build-arg "IMAGEMAGICK_COMMIT=$IMAGEMAGICK_COMMIT"   --build-arg "PROFILE=$PROFILE"   --output "type=local,dest=$OUT"   "$ROOT"

for file in browser-imagemagick.js manifest.json features.json imagemagick-config.txt smoke-test.html smoke-input.png; do [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }; done
for file in magick-core.js magick-core.wasm; do [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }; done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
printf '
[OK] ImageMagick %s build + browser smoke test passed
' "$PROFILE"
