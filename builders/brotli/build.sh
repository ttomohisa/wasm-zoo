#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
[[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unknown profile: $PROFILE" >&2; exit 1; }
node --check "$ROOT/scripts/smoke-test.mjs"
node --check "$ROOT/runtime/browser-brotli.js"
node --check "$ROOT/runtime/wasm-zoo.mjs"
OUT="$ROOT/dist/$PROFILE"
rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=()
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  cache_args=(--cache-from "type=gha,scope=brotli-$PROFILE" --cache-to "type=gha,mode=max,scope=brotli-$PROFILE")
fi
docker buildx build \
  "${cache_args[@]}" \
  --file "$ROOT/docker/Dockerfile" --target export \
  --build-arg "BUILDER_VERSION=$BUILDER_VERSION" \
  --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
  --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
  --build-arg "BROTLI_REPOSITORY=$BROTLI_REPOSITORY" \
  --build-arg "BROTLI_VERSION=$BROTLI_VERSION" \
  --build-arg "BROTLI_REF=$BROTLI_REF" \
  --build-arg "BROTLI_COMMIT=$BROTLI_COMMIT" \
  --build-arg "PROFILE=$PROFILE" \
  --output "type=local,dest=$OUT" "$ROOT"
for file in browser-brotli.js brotli-core.js brotli-core.wasm manifest.json features.json brotli-config.txt BUILDINFO.txt LICENSE-Brotli.txt smoke-test.html; do
  [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }
done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
node "$ROOT/../../scripts/generate-build-metadata.mjs" --slug brotli --profile "$PROFILE" --dist "$OUT"
printf '\n[OK] Brotli %s feasibility build + real Chromium round trip + provenance/SBOM passed\n' "$PROFILE"
