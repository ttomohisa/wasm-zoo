#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
TAG="${1:-libarchive-v${BUILDER_VERSION}}"
EXPECTED="libarchive-v${BUILDER_VERSION}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Release tag must be $EXPECTED" >&2; exit 1; }
for cmd in git tar sha256sum zip; do command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }; done
profile=browser-full; dist="$ROOT/dist/$profile"
for tool in bsdtar bsdcpio bsdcat bsdunzip; do for suffix in core.js core.wasm core.js.gz core.wasm.gz; do [[ -s "$dist/${tool}-${suffix}" ]] || { echo "Missing $dist/${tool}-${suffix}" >&2; exit 1; }; done; done
for file in manifest.json features.json provenance.json sbom.cdx.json libarchive-config.txt browser-libarchive.js BUILDINFO.txt LICENSE-libarchive.txt; do [[ -s "$dist/$file" ]] || { echo "Missing $dist/$file" >&2; exit 1; }; done
release="$ROOT/release"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT; rm -rf "$release" && mkdir -p "$release"
src="$work/libarchive-$LIBARCHIVE_REF"; git -C "$work" init -q source-fetch; git -C "$work/source-fetch" remote add origin "$LIBARCHIVE_REPOSITORY"; git -C "$work/source-fetch" fetch --depth 1 origin "$LIBARCHIVE_COMMIT"; git -C "$work/source-fetch" checkout -q --detach FETCH_HEAD; [[ "$(git -C "$work/source-fetch" rev-parse HEAD)" == "$LIBARCHIVE_COMMIT" ]]; mv "$work/source-fetch" "$src"; rm -rf "$src/.git"
stage="$work/binary"; mkdir -p "$stage/LICENSES"
for tool in bsdtar bsdcpio bsdcat bsdunzip; do for suffix in core.js core.wasm core.js.gz core.wasm.gz; do cp "$dist/${tool}-${suffix}" "$stage/"; done; done
for file in manifest.json features.json provenance.json sbom.cdx.json libarchive-config.txt browser-libarchive.js BUILDINFO.txt; do cp "$dist/$file" "$stage/"; done
cp "$src/COPYING" "$stage/LICENSES/libarchive-COPYING"
cp "$ROOT/LICENSES/zlib-LICENSE.txt" "$stage/LICENSES/zlib-LICENSE.txt"
cp "$ROOT/LICENSES/bzip2-LICENSE.txt" "$stage/LICENSES/bzip2-LICENSE.txt"
cat > "$stage/LICENSES/Emscripten-toolchain.txt" <<EOT
Generated with emscripten/emsdk:$EMSDK_VERSION.
Emscripten source: $EMSCRIPTEN_REPOSITORY
Ref: $EMSCRIPTEN_REF
Commit: $EMSCRIPTEN_COMMIT
zlib 1.3.2 and bzip2 1.0.6 are provided by Emscripten ports tied to this exact toolchain pin.
EOT
find "$stage" -exec touch -t 198001010000 {} +
asset="libarchive-browser-full-${LIBARCHIVE_REF#v}-zoo-${BUILDER_VERSION}.zip"; (cd "$stage" && zip -X -9 -q -r "$release/$asset" .)
cp "$dist/BUILDINFO.txt" "$release/BUILDINFO-browser-full.txt"
cp "$dist/provenance.json" "$release/provenance-browser-full.json"
cp "$dist/sbom.cdx.json" "$release/sbom-browser-full.cdx.json"
source_root="$work/source-bundle"; mkdir -p "$source_root"; mv "$src" "$source_root/libarchive-$LIBARCHIVE_REF"; mkdir -p "$source_root/wasm-zoo-builder"; tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -; cp "$release/BUILDINFO-browser-full.txt" "$source_root/"
cat > "$source_root/README.txt" <<EOT
Corresponding source and build recipe for WASM Zoo libarchive $TAG.
Contains exact libarchive source and the Zoo libarchive build recipe.
zlib 1.3.2 and bzip2 1.0.6 are Emscripten ports tied to the exact Emscripten ref/commit in versions.env and BUILDINFO. Their license notices are retained in the Zoo builder and binary release.
EOT
source_name="libarchive-sources-${LIBARCHIVE_REF#v}-zoo-${BUILDER_VERSION}.tar.gz"; tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$release/$source_name" source-bundle
(cd "$release" && sha256sum "$asset" "$source_name" BUILDINFO-browser-full.txt provenance-browser-full.json sbom-browser-full.cdx.json > SHA256SUMS.txt)
echo "[OK] libarchive release assets prepared in $release"
