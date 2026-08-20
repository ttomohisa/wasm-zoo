#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"
PROFILE=browser-full
DIST="$ROOT/dist/$PROFILE"
RELEASE="$ROOT/release"
rm -rf "$RELEASE" && mkdir -p "$RELEASE"
for file in browser-ghostscript.js gs-core.js gs-core.wasm manifest.json features.json ghostscript-config.txt BUILDINFO.txt LICENSE-Ghostscript.txt; do
  [[ -s "$DIST/$file" ]] || { echo "Missing release input: $file" >&2; exit 1; }
done
[[ -s "$DIST/THIRD-PARTY-LICENSES/INDEX.txt" ]] || { echo "Missing third-party license inventory" >&2; exit 1; }
binary="ghostscript-${PROFILE}-${GHOSTSCRIPT_VERSION}-zoo-${BUILDER_VERSION}.zip"
(
  cd "$DIST"
  zip -9 -q -r "$RELEASE/$binary" browser-ghostscript.js gs-core.js gs-core.wasm manifest.json features.json ghostscript-config.txt BUILDINFO.txt LICENSE-Ghostscript.txt THIRD-PARTY-LICENSES
)
source_asset="ghostscript-sources-${GHOSTSCRIPT_VERSION}-zoo-${BUILDER_VERSION}.tar.gz"
source_archive="$DIST/source/ghostscript-${GHOSTSCRIPT_VERSION}.tar.xz"
[[ -s "$source_archive" ]] || { echo "Missing exact Ghostscript release source archive: $source_archive" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/ghostscript-sources-${GHOSTSCRIPT_VERSION}-zoo-${BUILDER_VERSION}/recipe"
cp "$source_archive" "$tmp/ghostscript-sources-${GHOSTSCRIPT_VERSION}-zoo-${BUILDER_VERSION}/"
cp "$ROOT/versions.env" "$ROOT/scripts/build-full.sh" "$ROOT/scripts/fetch-ghostscript.sh" "$ROOT/docker/Dockerfile" "$tmp/ghostscript-sources-${GHOSTSCRIPT_VERSION}-zoo-${BUILDER_VERSION}/recipe/"
cp "$DIST/BUILDINFO.txt" "$DIST/LICENSE-Ghostscript.txt" "$tmp/ghostscript-sources-${GHOSTSCRIPT_VERSION}-zoo-${BUILDER_VERSION}/"
tar -czf "$RELEASE/$source_asset" -C "$tmp" "ghostscript-sources-${GHOSTSCRIPT_VERSION}-zoo-${BUILDER_VERSION}"
(
  cd "$RELEASE"
  sha256sum "$binary" "$source_asset" > SHA256SUMS.txt
)
printf '[OK] release assets prepared in %s\n' "$RELEASE"
