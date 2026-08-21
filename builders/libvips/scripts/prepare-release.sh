#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
TAG="${1:-libvips-v${BUILDER_VERSION}}"; EXPECTED="libvips-v${BUILDER_VERSION}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Release tag must be $EXPECTED" >&2; exit 1; }
for cmd in git tar sha256sum zip node; do command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }; done
profiles=(browser-core browser-full)
required=(vips.js vips.wasm vips.d.ts vips.js.gz vips.wasm.gz versions.json manifest.json features.json provenance.json sbom.cdx.json browser-libvips.js BUILDINFO.txt LICENSE-libvips.txt LICENSE-wasm-vips.txt THIRD-PARTY-NOTICES-wasm-vips.md)
for profile in "${profiles[@]}"; do
  dist="$ROOT/dist/$profile"
  for file in "${required[@]}"; do [[ -s "$dist/$file" ]] || { echo "Missing $dist/$file" >&2; exit 1; }; done
done
node "$ROOT/scripts/compare-profiles.mjs"
for file in size-comparison.json size-comparison.md; do [[ -s "$ROOT/dist/$file" ]] || { echo "Missing $ROOT/dist/$file" >&2; exit 1; }; done

release="$ROOT/release"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; rm -rf "$release" && mkdir -p "$release"
version="${LIBVIPS_REF#v}"
assets=()
for profile in "${profiles[@]}"; do
  dist="$ROOT/dist/$profile"
  stage="$work/binary-$profile"; mkdir -p "$stage/LICENSES"
  for file in vips.js vips.wasm vips.d.ts vips.js.gz vips.wasm.gz versions.json manifest.json features.json provenance.json sbom.cdx.json browser-libvips.js BUILDINFO.txt; do cp "$dist/$file" "$stage/"; done
  cp "$dist/LICENSE-libvips.txt" "$stage/LICENSES/libvips-LICENSE.txt"
  cp "$dist/LICENSE-wasm-vips.txt" "$stage/LICENSES/wasm-vips-LICENSE.txt"
  cp "$dist/THIRD-PARTY-NOTICES-wasm-vips.md" "$stage/LICENSES/THIRD-PARTY-NOTICES-wasm-vips.md"
  cat > "$stage/LICENSES/Emscripten-toolchain.txt" <<EOT
Generated with emscripten/emsdk:$EMSDK_VERSION.
Emscripten source: $EMSCRIPTEN_REPOSITORY
Ref: $EMSCRIPTEN_REF
Commit: $EMSCRIPTEN_COMMIT
The browser adapter and linked dependency inventory are recorded in versions.json and BUILDINFO.txt.
EOT
  find "$stage" -exec touch -t 198001010000 {} +
  asset="libvips-${profile}-${version}-zoo-${BUILDER_VERSION}.zip"
  (cd "$stage" && zip -X -9 -q -r "$release/$asset" .)
  assets+=("$asset")
  cp "$dist/BUILDINFO.txt" "$release/BUILDINFO-${profile}.txt"
  cp "$dist/provenance.json" "$release/provenance-${profile}.json"
  cp "$dist/sbom.cdx.json" "$release/sbom-${profile}.cdx.json"
done
cp "$ROOT/dist/size-comparison.json" "$release/size-comparison.json"
cp "$ROOT/dist/size-comparison.md" "$release/size-comparison.md"

source_root="$work/source-bundle"; mkdir -p "$source_root"
for spec in "libvips|$LIBVIPS_REPOSITORY|$LIBVIPS_REF|$LIBVIPS_COMMIT" "wasm-vips|$WASM_VIPS_REPOSITORY|$WASM_VIPS_COMMIT|$WASM_VIPS_COMMIT"; do
  IFS='|' read -r name repo ref commit <<<"$spec"
  git init -q "$work/fetch-$name"
  git -C "$work/fetch-$name" remote add origin "$repo"
  git -C "$work/fetch-$name" fetch -q --depth 1 origin "$ref"
  git -C "$work/fetch-$name" checkout -q --detach FETCH_HEAD
  actual="$(git -C "$work/fetch-$name" rev-parse HEAD)"
  [[ "$actual" == "$commit" ]] || { echo "$name source commit mismatch" >&2; exit 1; }
  rm -rf "$work/fetch-$name/.git"
  mv "$work/fetch-$name" "$source_root/$name"
done
mkdir -p "$source_root/patches"
make_patch() {
  local name="$1" upstream_repo="$2" upstream_ref="$3" upstream_commit="$4" fork_repo="$5" fork_commit="$6"
  local repo="$work/patch-$name"
  git init -q "$repo"
  git -C "$repo" remote add upstream "$upstream_repo"
  git -C "$repo" remote add fork "$fork_repo"
  git -C "$repo" fetch -q --depth 1 upstream "$upstream_ref":refs/remotes/upstream/base
  actual="$(git -C "$repo" rev-parse refs/remotes/upstream/base)"
  [[ "$actual" == "$upstream_commit" ]] || { echo "$name upstream patch base mismatch" >&2; exit 1; }
  git -C "$repo" fetch -q --depth 1 fork "$fork_commit":refs/remotes/fork/patched
  git -C "$repo" diff --binary refs/remotes/upstream/base refs/remotes/fork/patched > "$source_root/patches/$name.patch"
  [[ -s "$source_root/patches/$name.patch" ]] || { echo "$name compatibility patch was empty" >&2; exit 1; }
}
make_patch libvips-wasm "$LIBVIPS_REPOSITORY" "$LIBVIPS_REF" "$LIBVIPS_COMMIT" "$WASM_VIPS_LIBVIPS_PATCH_REPOSITORY" "$WASM_VIPS_LIBVIPS_PATCH_COMMIT"
make_patch emscripten-wasm-vips "$EMSCRIPTEN_REPOSITORY" "$EMSCRIPTEN_REF" "$EMSCRIPTEN_COMMIT" "$WASM_VIPS_EMSCRIPTEN_PATCH_REPOSITORY" "$WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT"
mkdir -p "$source_root/wasm-zoo-builder"
tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -
for profile in "${profiles[@]}"; do cp "$release/BUILDINFO-${profile}.txt" "$source_root/"; done
cp "$release/size-comparison.json" "$source_root/"
cat > "$source_root/README.txt" <<EOT
Corresponding source and build recipe for WASM Zoo libvips $TAG.
Contains exact upstream libvips source, the pinned wasm-vips browser adapter, the Zoo builder recipe and the exact compatibility patch diffs reconstructed from immutable Git commits.
Both browser-core and browser-full profiles are described by the included builder profile files and BUILDINFO records.
EOT
source_name="libvips-sources-${version}-zoo-${BUILDER_VERSION}.tar.gz"
tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$release/$source_name" source-bundle
(
  cd "$release"
  sha256sum "${assets[@]}" "$source_name" BUILDINFO-browser-core.txt BUILDINFO-browser-full.txt size-comparison.json size-comparison.md \
    provenance-browser-core.json provenance-browser-full.json \
    sbom-browser-core.cdx.json sbom-browser-full.cdx.json > SHA256SUMS.txt
)
echo "[OK] libvips release assets prepared in $release"
