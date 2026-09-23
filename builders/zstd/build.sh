#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-core}"
source "$ROOT/versions.env"
[[ "$PROFILE" == browser-core && -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unsupported Zstandard canary profile: $PROFILE" >&2; exit 1; }
node --check "$ROOT/runtime/browser-zstd.js"
node --check "$ROOT/runtime/browser-zstd-worker.js"
node --check "$ROOT/runtime/wasm-zoo.mjs"
OUT="$ROOT/dist/$PROFILE"
rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=()
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  cache_args=(--cache-from "type=gha,scope=zstd-$PROFILE" --cache-to "type=gha,mode=max,scope=zstd-$PROFILE")
fi
docker buildx build "${cache_args[@]}" --file "$ROOT/docker/Dockerfile" --target export \
  --build-arg "BUILDER_VERSION=$BUILDER_VERSION" \
  --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
  --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
  --build-arg "ZSTD_REPOSITORY=$ZSTD_REPOSITORY" \
  --build-arg "ZSTD_REF=$ZSTD_REF" \
  --build-arg "ZSTD_COMMIT=$ZSTD_COMMIT" \
  --build-arg "PROFILE=$PROFILE" \
  --output "type=local,dest=$OUT" "$ROOT"
for file in browser-zstd.js browser-zstd-worker.js wasm-zoo.mjs zstd-core.js zstd-core.wasm manifest.json features.json BUILDINFO.txt LICENSE-zstd.txt smoke-test.html; do
  [[ -s "$OUT/$file" ]] || { echo "Missing Zstandard build output: $file" >&2; exit 1; }
done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
node "$ROOT/../../scripts/generate-build-metadata.mjs" --slug zstd --profile "$PROFILE" --dist "$OUT"
echo "[OK] experimental Zstandard browser-core built and real browser roundtrip passed"
