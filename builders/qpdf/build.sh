#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
[[ -s "$ROOT/profiles/$PROFILE/profile.env" ]] || { echo "Unknown profile: $PROFILE" >&2; exit 1; }
node --check "$ROOT/scripts/smoke-test.mjs"
node --check "$ROOT/runtime/browser-qpdf.js"
node --check "$ROOT/runtime/wasm-zoo.mjs"
OUT="$ROOT/dist/$PROFILE"; rm -rf "$OUT" && mkdir -p "$OUT"
cache_args=(); if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then cache_args=(--cache-from "type=gha,scope=qpdf-$PROFILE" --cache-to "type=gha,mode=max,scope=qpdf-$PROFILE"); fi
docker buildx build "${cache_args[@]}" --file "$ROOT/docker/Dockerfile" --target export \
  --build-arg "BUILDER_VERSION=$BUILDER_VERSION" --build-arg "EMSDK_VERSION=$EMSDK_VERSION" --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
  --build-arg "QPDF_REPOSITORY=$QPDF_REPOSITORY" --build-arg "QPDF_VERSION=$QPDF_VERSION" --build-arg "QPDF_REF=$QPDF_REF" --build-arg "QPDF_COMMIT=$QPDF_COMMIT" \
  --build-arg "QPDF_SOURCE_URL=$QPDF_SOURCE_URL" --build-arg "QPDF_SOURCE_SHA256=$QPDF_SOURCE_SHA256" \
  --build-arg "ZLIB_PORT_VERSION=$ZLIB_PORT_VERSION" --build-arg "ZLIB_SOURCE_SHA512=$ZLIB_SOURCE_SHA512" \
  --build-arg "LIBJPEG_PORT_VERSION=$LIBJPEG_PORT_VERSION" --build-arg "LIBJPEG_SOURCE_SHA512=$LIBJPEG_SOURCE_SHA512" --build-arg "PROFILE=$PROFILE" \
  --output "type=local,dest=$OUT" "$ROOT"
for file in browser-qpdf.js wasm-zoo.mjs qpdf-core.js qpdf-core.wasm manifest.json features.json qpdf-config.txt BUILDINFO.txt LICENSE-QPDF.txt NOTICE-QPDF.md smoke-test.html; do [[ -s "$OUT/$file" ]] || { echo "Missing build output: $file" >&2; exit 1; }; done
node "$ROOT/scripts/smoke-test.mjs" "$PROFILE"
node "$ROOT/../../scripts/generate-build-metadata.mjs" --slug qpdf --profile "$PROFILE" --dist "$OUT"
printf '\n[OK] QPDF %s build + real Chromium smoke + provenance/SBOM passed\n' "$PROFILE"
