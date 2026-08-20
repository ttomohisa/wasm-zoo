#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
[[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unknown profile: $PROFILE" >&2; exit 1; }
node --check "$ROOT/scripts/smoke-test.mjs"
node --check "$ROOT/runtime/browser-ghostscript.js"
OUT="$ROOT/dist/$PROFILE"
rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=()
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then cache_args=(--cache-from "type=gha,scope=ghostscript-$PROFILE" --cache-to "type=gha,mode=max,scope=ghostscript-$PROFILE"); fi
docker buildx build \
  "${cache_args[@]}" \
  --file "$ROOT/docker/Dockerfile" --target export \
  --build-arg "BUILDER_VERSION=$BUILDER_VERSION" \
  --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
  --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
  --build-arg "GHOSTSCRIPT_VERSION=$GHOSTSCRIPT_VERSION" \
  --build-arg "GHOSTSCRIPT_REF=$GHOSTSCRIPT_REF" \
  --build-arg "GHOSTSCRIPT_COMMIT=$GHOSTSCRIPT_COMMIT" \
  --build-arg "GHOSTSCRIPT_RELEASE_TAG=$GHOSTSCRIPT_RELEASE_TAG" \
  --build-arg "GHOSTSCRIPT_SOURCE_URL=$GHOSTSCRIPT_SOURCE_URL" \
  --build-arg "GHOSTSCRIPT_SOURCE_SHA256=$GHOSTSCRIPT_SOURCE_SHA256" \
  --build-arg "GHOSTSCRIPT_REPOSITORY=$GHOSTSCRIPT_REPOSITORY" \
  --build-arg "PROFILE=$PROFILE" \
  --output "type=local,dest=$OUT" "$ROOT"
for file in browser-ghostscript.js gs-core.js gs-core.wasm manifest.json features.json ghostscript-config.txt BUILDINFO.txt LICENSE-Ghostscript.txt smoke-test.html smoke-input.pdf; do
  [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }
done
[[ -s "$OUT/THIRD-PARTY-LICENSES/INDEX.txt" ]] || { echo "Missing third-party license inventory" >&2; exit 1; }
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
printf '\n[OK] Ghostscript %s build + browser smoke test passed\n' "$PROFILE"
