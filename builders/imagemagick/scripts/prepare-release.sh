#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
TAG="${1:-imagemagick-v${BUILDER_VERSION}}"
EXPECTED="imagemagick-v${BUILDER_VERSION}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Release tag must be $EXPECTED" >&2; exit 1; }
for cmd in git tar sha256sum zip; do command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }; done
profile=browser-full; dist="$ROOT/dist/$profile"
for file in magick-core.js magick-core.wasm magick-core.js.gz magick-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json imagemagick-config.txt browser-imagemagick.js BUILDINFO.txt LICENSE-imagemagick.txt; do [[ -s "$dist/$file" ]] || { echo "Missing $dist/$file" >&2; exit 1; }; done
release="$ROOT/release"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; rm -rf "$release" && mkdir -p "$release"
src="$work/imagemagick-$IMAGEMAGICK_REF"; git -C "$work" init -q source-fetch; git -C "$work/source-fetch" remote add origin "$IMAGEMAGICK_REPOSITORY"; git -C "$work/source-fetch" fetch --depth 1 origin "$IMAGEMAGICK_REF"; git -C "$work/source-fetch" checkout -q --detach FETCH_HEAD; mv "$work/source-fetch" "$src"; rm -rf "$src/.git"
stage="$work/binary"; mkdir -p "$stage/LICENSES"
for file in magick-core.js magick-core.wasm magick-core.js.gz magick-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json imagemagick-config.txt browser-imagemagick.js BUILDINFO.txt; do cp "$dist/$file" "$stage/"; done
cp "$src/LICENSE" "$stage/LICENSES/imagemagick-LICENSE.txt" || true
cat > "$stage/LICENSES/Emscripten-toolchain.txt" <<EOT
Generated with emscripten/emsdk:$EMSDK_VERSION.
Emscripten source: $EMSCRIPTEN_REPOSITORY
Ref: $EMSCRIPTEN_REF
Commit: $EMSCRIPTEN_COMMIT
zlib 1.3.2, libpng 1.6.58, and libjpeg 9f are provided by Emscripten ports tied to this exact toolchain pin.
EOT
find "$stage" -exec touch -t 198001010000 {} +
asset="imagemagick-browser-full-${IMAGEMAGICK_REF}-zoo-${BUILDER_VERSION}.zip"; (cd "$stage" && zip -X -9 -q -r "$release/$asset" .)
cp "$dist/BUILDINFO.txt" "$release/BUILDINFO-browser-full.txt"
cp "$dist/provenance.json" "$release/provenance-browser-full.json"
cp "$dist/sbom.cdx.json" "$release/sbom-browser-full.cdx.json"
source_root="$work/source-bundle"; mkdir -p "$source_root"; mv "$src" "$source_root/imagemagick-$IMAGEMAGICK_REF"; mkdir -p "$source_root/wasm-zoo-builder"; tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -; cp "$release/BUILDINFO-browser-full.txt" "$source_root/"
cat > "$source_root/README.txt" <<EOT
Corresponding source and build recipe for WASM Zoo ImageMagick $TAG.
Contains exact ImageMagick source and the Zoo ImageMagick build recipe.
EOT
source_name="imagemagick-sources-${IMAGEMAGICK_REF}-zoo-${BUILDER_VERSION}.tar.gz"; tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$release/$source_name" source-bundle
(cd "$release" && sha256sum "$asset" "$source_name" BUILDINFO-browser-full.txt provenance-browser-full.json sbom-browser-full.cdx.json > SHA256SUMS.txt)
echo "[OK] ImageMagick release assets prepared in $release"
