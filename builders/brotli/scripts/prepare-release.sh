#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
TAG="${1:-brotli-v${BUILDER_VERSION}}"
PROFILE=browser-full
EXPECTED="brotli-v${BUILDER_VERSION}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Release tag must be $EXPECTED" >&2; exit 1; }
for cmd in git tar gzip sha256sum zip; do command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }; done
DIST="$ROOT/dist/$PROFILE"; RELEASE="$ROOT/release"
for file in browser-brotli.js wasm-zoo.mjs brotli-core.js brotli-core.wasm brotli-core.js.gz brotli-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json brotli-config.txt BUILDINFO.txt LICENSE-Brotli.txt; do [[ -s "$DIST/$file" ]] || { echo "Missing handoff input: $file" >&2; exit 1; }; done
rm -rf "$RELEASE" && mkdir -p "$RELEASE"; work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
src="$work/brotli-$BROTLI_VERSION"; git init -q "$src"; git -C "$src" remote add origin "$BROTLI_REPOSITORY"; git -C "$src" fetch --depth 1 origin "$BROTLI_COMMIT"; git -C "$src" checkout -q --detach FETCH_HEAD; [[ "$(git -C "$src" rev-parse HEAD)" == "$BROTLI_COMMIT" ]]; rm -rf "$src/.git"
binary="brotli-${PROFILE}-${BROTLI_VERSION}-zoo-${BUILDER_VERSION}.zip"; stage="$work/binary"; mkdir -p "$stage/LICENSES"
for file in browser-brotli.js wasm-zoo.mjs brotli-core.js brotli-core.wasm brotli-core.js.gz brotli-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json brotli-config.txt BUILDINFO.txt; do cp "$DIST/$file" "$stage/"; done
cp "$DIST/LICENSE-Brotli.txt" "$stage/LICENSES/Brotli-LICENSE.txt"; find "$stage" -exec touch -t 198001010000 {} +; (cd "$stage" && zip -X -9 -q -r "$RELEASE/$binary" .)
cp "$DIST/provenance.json" "$RELEASE/provenance-browser-full.json"; cp "$DIST/sbom.cdx.json" "$RELEASE/sbom-browser-full.cdx.json"; cp "$DIST/BUILDINFO.txt" "$RELEASE/BUILDINFO-browser-full.txt"
source_root="$work/source-bundle"; mkdir -p "$source_root"; mv "$src" "$source_root/brotli-$BROTLI_VERSION"; mkdir -p "$source_root/wasm-zoo-builder"; tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -; cp "$DIST/BUILDINFO.txt" "$source_root/BUILDINFO-browser-full.txt"
cat > "$source_root/README.txt" <<EOF_TXT
Corresponding source and build recipe for WASM Zoo Brotli $TAG.
Contains exact unpatched Google Brotli $BROTLI_REF source and the Zoo Brotli builder.
The exact Emscripten ref/commit is recorded in BUILDINFO and versions.env.
The reviewed tag-triggered release workflow publishes these assets; creating the package tag remains a human action.
EOF_TXT
source_asset="brotli-sources-${BROTLI_VERSION}-zoo-${BUILDER_VERSION}.tar.gz"; tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$RELEASE/$source_asset" source-bundle
(cd "$RELEASE" && sha256sum "$binary" "$source_asset" BUILDINFO-browser-full.txt provenance-browser-full.json sbom-browser-full.cdx.json > SHA256SUMS.txt)
printf '[OK] Brotli release assets prepared in %s\n' "$RELEASE"
