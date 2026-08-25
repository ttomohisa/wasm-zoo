#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
TAG="${1:-jq-v${BUILDER_VERSION}}"
PROFILE=browser-full
EXPECTED="jq-v${BUILDER_VERSION}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Release tag must be $EXPECTED" >&2; exit 1; }
for cmd in git tar gzip sha256sum zip; do command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }; done
DIST="$ROOT/dist/$PROFILE"; RELEASE="$ROOT/release"
for file in browser-jq.js jq-core.js jq-core.wasm jq-core.js.gz jq-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json jq-config.txt BUILDINFO.txt LICENSE-jq.txt LICENSE-oniguruma.txt; do
  [[ -s "$DIST/$file" ]] || { echo "Missing release input: $file" >&2; exit 1; }
done
rm -rf "$RELEASE" && mkdir -p "$RELEASE"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

fetch_exact() { local repo="$1" commit="$2" dst="$3"; git init -q "$dst"; git -C "$dst" remote add origin "$repo"; git -C "$dst" fetch --depth 1 origin "$commit"; git -C "$dst" checkout -q --detach FETCH_HEAD; [[ "$(git -C "$dst" rev-parse HEAD)" == "$commit" ]]; }
jqsrc="$work/jq-$JQ_REF"; fetch_exact "$JQ_REPOSITORY" "$JQ_COMMIT" "$jqsrc"
onigsrc="$work/oniguruma-$ONIGURUMA_VERSION"; fetch_exact "$ONIGURUMA_REPOSITORY" "$ONIGURUMA_COMMIT" "$onigsrc"
rm -rf "$jqsrc/vendor/oniguruma"; mkdir -p "$jqsrc/vendor"; cp -a "$onigsrc" "$jqsrc/vendor/oniguruma"
rm -rf "$jqsrc/.git" "$jqsrc/vendor/oniguruma/.git" "$onigsrc/.git"

binary="jq-${PROFILE}-${JQ_REF#jq-}-zoo-${BUILDER_VERSION}.zip"
stage="$work/binary"; mkdir -p "$stage/LICENSES"
for file in browser-jq.js jq-core.js jq-core.wasm jq-core.js.gz jq-core.wasm.gz manifest.json features.json provenance.json sbom.cdx.json jq-config.txt BUILDINFO.txt; do cp "$DIST/$file" "$stage/"; done
cp "$DIST/LICENSE-jq.txt" "$stage/LICENSES/jq-COPYING.txt"; cp "$DIST/LICENSE-oniguruma.txt" "$stage/LICENSES/oniguruma-COPYING.txt"
find "$stage" -exec touch -t 198001010000 {} +
(cd "$stage" && zip -X -9 -q -r "$RELEASE/$binary" .)
cp "$DIST/provenance.json" "$RELEASE/provenance-browser-full.json"
cp "$DIST/sbom.cdx.json" "$RELEASE/sbom-browser-full.cdx.json"
cp "$DIST/BUILDINFO.txt" "$RELEASE/BUILDINFO-browser-full.txt"

source_root="$work/source-bundle"; mkdir -p "$source_root"
mv "$jqsrc" "$source_root/jq-${JQ_REF#jq-}"
mkdir -p "$source_root/wasm-zoo-builder"
tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -
cp "$DIST/BUILDINFO.txt" "$source_root/BUILDINFO-browser-full.txt"
cat > "$source_root/README.txt" <<EOF_TXT
Corresponding source and build recipe for WASM Zoo jq $TAG.
Contains exact jq source, exact Oniguruma submodule source and the Zoo jq build recipe.
The exact Emscripten toolchain ref/commit is recorded in BUILDINFO and versions.env.
EOF_TXT
source_asset="jq-sources-${JQ_REF#jq-}-zoo-${BUILDER_VERSION}.tar.gz"
tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$RELEASE/$source_asset" source-bundle
(
 cd "$RELEASE"
 sha256sum "$binary" "$source_asset" BUILDINFO-browser-full.txt provenance-browser-full.json sbom-browser-full.cdx.json > SHA256SUMS.txt
)
printf '[OK] jq release assets prepared in %s\n' "$RELEASE"
