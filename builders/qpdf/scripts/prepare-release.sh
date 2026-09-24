#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
PROFILE="browser-full"; DIST="$ROOT/dist/$PROFILE"; RELEASE="$ROOT/release"
for file in browser-qpdf.js wasm-zoo.mjs qpdf-core.js qpdf-core.wasm manifest.json features.json provenance.json sbom.cdx.json qpdf-config.txt BUILDINFO.txt LICENSE-QPDF.txt NOTICE-QPDF.md LICENSE-ZLIB.txt LICENSE-LIBJPEG.txt; do [[ -s "$DIST/$file" ]] || { echo "Missing release input: $file" >&2; exit 1; }; done
rm -rf "$RELEASE"; mkdir -p "$RELEASE"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
stage="$work/binary"; mkdir -p "$stage/LICENSES"
for file in browser-qpdf.js wasm-zoo.mjs qpdf-core.js qpdf-core.wasm manifest.json features.json provenance.json sbom.cdx.json qpdf-config.txt BUILDINFO.txt; do cp "$DIST/$file" "$stage/"; done
cp "$DIST/LICENSE-QPDF.txt" "$stage/LICENSES/QPDF-LICENSE.txt"
cp "$DIST/NOTICE-QPDF.md" "$stage/LICENSES/QPDF-NOTICE.md"
cp "$DIST/LICENSE-ZLIB.txt" "$stage/LICENSES/zlib-LICENSE.txt"
cp "$DIST/LICENSE-LIBJPEG.txt" "$stage/LICENSES/libjpeg-LICENSE.txt"
find "$stage" -exec touch -t 198001010000 {} +
binary="qpdf-browser-full-$QPDF_VERSION-zoo-$BUILDER_VERSION.zip"; (cd "$stage" && zip -X -9 -q -r "$RELEASE/$binary" .)
archive="$work/qpdf-$QPDF_VERSION.tar.gz"; curl -fsSL "$QPDF_SOURCE_URL" -o "$archive"; printf '%s  %s\n' "$QPDF_SOURCE_SHA256" "$archive" | sha256sum -c -
source_asset="qpdf-sources-$QPDF_VERSION-zoo-$BUILDER_VERSION.tar.gz"; source_root="$work/source-bundle"; mkdir -p "$source_root/official-source" "$source_root/wasm-zoo-builder"
tar -xzf "$archive" --strip-components=1 -C "$source_root/official-source"
tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -
cp "$DIST/BUILDINFO.txt" "$source_root/BUILDINFO-browser-full.txt"
tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$RELEASE/$source_asset" source-bundle
cp "$DIST/provenance.json" "$RELEASE/provenance-browser-full.json"; cp "$DIST/sbom.cdx.json" "$RELEASE/sbom-browser-full.cdx.json"; cp "$DIST/BUILDINFO.txt" "$RELEASE/BUILDINFO-browser-full.txt"
(cd "$RELEASE" && sha256sum "$binary" "$source_asset" BUILDINFO-browser-full.txt provenance-browser-full.json sbom-browser-full.cdx.json > SHA256SUMS.txt)
printf '[OK] QPDF reviewed release assets prepared locally in %s\n' "$RELEASE"
