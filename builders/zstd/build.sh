#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-core}"
source "$ROOT/versions.env"
[[ "$PROFILE" == browser-core || "$PROFILE" == browser-full ]] && [[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unsupported Zstandard canary profile: $PROFILE" >&2; exit 1; }
node --check "$ROOT/runtime/browser-zstd.js"
node --check "$ROOT/runtime/browser-zstd-worker.js"
node --check "$ROOT/runtime/wasm-zoo.mjs"
node --check "$ROOT/runtime/browser-zstd-cli.js"
node --check "$ROOT/runtime/browser-zstd-cli-worker.js"
node --check "$ROOT/runtime/wasm-zoo-cli.mjs"
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
if [[ "$PROFILE" == browser-core ]]; then
  required=(browser-zstd.js browser-zstd-worker.js wasm-zoo.mjs zstd-core.js zstd-core.wasm manifest.json features.json BUILDINFO.txt LICENSE-zstd.txt smoke-test.html)
else
  required=(browser-zstd-cli.js browser-zstd-cli-worker.js wasm-zoo-cli.mjs zstd-cli.js zstd-cli.wasm manifest.json features.json BUILDINFO.txt LICENSE-zstd.txt smoke-test.html)
fi
for file in "${required[@]}"; do
  [[ -s "$OUT/$file" ]] || { echo "Missing Zstandard build output: $file" >&2; exit 1; }
done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
node "$ROOT/../../scripts/generate-build-metadata.mjs" --slug zstd --profile "$PROFILE" --dist "$OUT"
echo "[OK] experimental Zstandard $PROFILE compiled, browser-tested and supplied with provenance/SBOM"
