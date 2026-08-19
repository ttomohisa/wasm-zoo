#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
[[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unknown profile: $PROFILE" >&2; exit 1; }
OUT="$ROOT/dist/$PROFILE"
rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=()
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then cache_args=(--cache-from "type=gha,scope=libarchive-$PROFILE" --cache-to "type=gha,mode=max,scope=libarchive-$PROFILE"); fi

docker buildx build \
  "${cache_args[@]}" \
  --file "$ROOT/docker/Dockerfile" \
  --target export \
  --build-arg "BUILDER_VERSION=$BUILDER_VERSION" \
  --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
  --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
  --build-arg "LIBARCHIVE_REPOSITORY=$LIBARCHIVE_REPOSITORY" \
  --build-arg "LIBARCHIVE_REF=$LIBARCHIVE_REF" \
  --build-arg "LIBARCHIVE_COMMIT=$LIBARCHIVE_COMMIT" \
  --build-arg "PROFILE=$PROFILE" \
  --output "type=local,dest=$OUT" \
  "$ROOT"

for file in browser-libarchive.js manifest.json features.json libarchive-config.txt smoke-test.html smoke-input.zip; do [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }; done
for tool in bsdtar bsdcpio bsdcat bsdunzip; do for suffix in core.js core.wasm; do [[ -s "$OUT/${tool}-${suffix}" ]] || { echo "Missing build output: ${tool}-${suffix}" >&2; exit 1; }; done; done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
printf '\n[OK] libarchive %s build + browser smoke test passed\n' "$PROFILE"
