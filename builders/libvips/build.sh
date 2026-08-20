#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-browser-full}"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
node --check "$ROOT/scripts/smoke-test.mjs"
node --check "$ROOT/scripts/compare-profiles.mjs"
node --check "$ROOT/runtime/browser-libvips.js"

build_profile() {
  local profile="$1"
  [[ -s "$ROOT/profiles/$profile/profile.env" ]] || { echo "Unknown profile: $profile" >&2; exit 1; }
  local out="$ROOT/dist/$profile"
  rm -rf "$out" && mkdir -p "$out"
  local cache_args=()
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    cache_args=(--cache-from "type=gha,scope=libvips-$profile" --cache-to "type=gha,mode=max,scope=libvips-$profile")
  fi

  docker buildx build \
    "${cache_args[@]}" \
    --file "$ROOT/docker/Dockerfile" \
    --target export \
    --build-arg "BUILDER_VERSION=$BUILDER_VERSION" \
    --build-arg "EMSDK_VERSION=$EMSDK_VERSION" \
    --build-arg "EMSCRIPTEN_REF=$EMSCRIPTEN_REF" \
    --build-arg "EMSCRIPTEN_COMMIT=$EMSCRIPTEN_COMMIT" \
    --build-arg "LIBVIPS_REF=$LIBVIPS_REF" \
    --build-arg "LIBVIPS_COMMIT=$LIBVIPS_COMMIT" \
    --build-arg "WASM_VIPS_REPOSITORY=$WASM_VIPS_REPOSITORY" \
    --build-arg "WASM_VIPS_COMMIT=$WASM_VIPS_COMMIT" \
    --build-arg "WASM_VIPS_VERSION=$WASM_VIPS_VERSION" \
    --build-arg "WASM_VIPS_LIBVIPS_PATCH_REPOSITORY=$WASM_VIPS_LIBVIPS_PATCH_REPOSITORY" \
    --build-arg "WASM_VIPS_LIBVIPS_PATCH_COMMIT=$WASM_VIPS_LIBVIPS_PATCH_COMMIT" \
    --build-arg "WASM_VIPS_EMSCRIPTEN_PATCH_REPOSITORY=$WASM_VIPS_EMSCRIPTEN_PATCH_REPOSITORY" \
    --build-arg "WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT=$WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT" \
    --build-arg "PROFILE=$profile" \
    --output "type=local,dest=$out" \
    "$ROOT"
  node "$ROOT/scripts/smoke-test.mjs" "$profile"
  echo "[OK] libvips $profile build + browser smoke test passed"
}

if [[ "$PROFILE" == "all" ]]; then
  build_profile browser-core
  build_profile browser-full
else
  build_profile "$PROFILE"
fi
node "$ROOT/scripts/compare-profiles.mjs"
