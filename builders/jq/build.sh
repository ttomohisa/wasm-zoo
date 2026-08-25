#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
[[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unknown profile: $PROFILE" >&2; exit 1; }
node --check "$ROOT/scripts/smoke-test.mjs"
node --check "$ROOT/runtime/browser-jq.js"
OUT="$ROOT/dist/$PROFILE"
rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=()
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then cache_args=(--cache-from "type=gha,scope=jq-$PROFILE" --cache-to "type=gha,mode=max,scope=jq-$PROFILE"); fi
docker buildx build \
  "${cache_args[@]}" \
  --file "$ROOT/docker/Dockerfile" --target export \
  --build-arg "BUILDER_VERSION=$BUILDER_VERSION" \
  --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
  --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
  --build-arg "JQ_REPOSITORY=$JQ_REPOSITORY" \
  --build-arg "JQ_REF=$JQ_REF" \
  --build-arg "JQ_COMMIT=$JQ_COMMIT" \
  --build-arg "ONIGURUMA_REPOSITORY=$ONIGURUMA_REPOSITORY" \
  --build-arg "ONIGURUMA_VERSION=$ONIGURUMA_VERSION" \
  --build-arg "ONIGURUMA_COMMIT=$ONIGURUMA_COMMIT" \
  --build-arg "PROFILE=$PROFILE" \
  --output "type=local,dest=$OUT" "$ROOT"
for file in browser-jq.js jq-core.js jq-core.wasm manifest.json features.json jq-config.txt BUILDINFO.txt LICENSE-jq.txt LICENSE-oniguruma.txt smoke-test.html smoke-input.json; do
  [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }
done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
node "$ROOT/../../scripts/generate-build-metadata.mjs" --slug jq --profile "$PROFILE" --dist "$OUT"
printf '\n[OK] jq %s build + browser smoke test + provenance/SBOM passed\n' "$PROFILE"
