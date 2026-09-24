#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/versions.env"

TAG="${1:-qpdf-v${BUILDER_VERSION}}"
EXPECTED="qpdf-v${BUILDER_VERSION}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Release tag must be $EXPECTED" >&2; exit 1; }
for cmd in curl tar gzip sha256sum sha512sum zip; do
  command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }
done

PROFILE="browser-full"
DIST="$ROOT/dist/$PROFILE"
RELEASE="$ROOT/release"
for file in browser-qpdf.js wasm-zoo.mjs qpdf-core.js qpdf-core.wasm manifest.json features.json provenance.json sbom.cdx.json qpdf-config.txt BUILDINFO.txt LICENSE-QPDF.txt NOTICE-QPDF.md LICENSE-ZLIB.txt LICENSE-LIBJPEG.txt; do
  [[ -s "$DIST/$file" ]] || { echo "Missing release input: $file" >&2; exit 1; }
done

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fetch_sha256(){ local url="$1" digest="$2" dst="$3"; curl -fsSL "$url" -o "$dst"; printf '%s  %s\n' "$digest" "$dst" | sha256sum -c -; }
fetch_sha512(){ local url="$1" digest="$2" dst="$3"; curl -fsSL "$url" -o "$dst"; printf '%s  %s\n' "$digest" "$dst" | sha512sum -c -; }

qpdf_archive="$work/qpdf-$QPDF_VERSION.tar.gz"
zlib_archive="$work/zlib-$ZLIB_VERSION.tar.gz"
jpeg_archive="$work/jpeg-$LIBJPEG_VERSION.tar.gz"
fetch_sha256 "$QPDF_SOURCE_URL" "$QPDF_SOURCE_SHA256" "$qpdf_archive"
fetch_sha512 "$ZLIB_SOURCE_URL" "$ZLIB_SOURCE_SHA512" "$zlib_archive"
fetch_sha512 "$LIBJPEG_SOURCE_URL" "$LIBJPEG_SOURCE_SHA512" "$jpeg_archive"

zlib_src="$work/zlib-src"
jpeg_src="$work/jpeg-src"
mkdir -p "$zlib_src" "$jpeg_src"
tar -xzf "$zlib_archive" --strip-components=1 -C "$zlib_src"
tar -xzf "$jpeg_archive" --strip-components=1 -C "$jpeg_src"
[[ -s "$zlib_src/LICENSE" ]] || { echo "Missing zlib LICENSE" >&2; exit 1; }
[[ -s "$jpeg_src/README" ]] || { echo "Missing libjpeg README/license text" >&2; exit 1; }

stage="$work/binary"
mkdir -p "$stage/LICENSES"
for file in browser-qpdf.js wasm-zoo.mjs qpdf-core.js qpdf-core.wasm manifest.json features.json provenance.json sbom.cdx.json qpdf-config.txt BUILDINFO.txt; do
  cp "$DIST/$file" "$stage/"
done
cp "$DIST/LICENSE-QPDF.txt" "$stage/LICENSES/QPDF-LICENSE.txt"
cp "$DIST/NOTICE-QPDF.md" "$stage/LICENSES/QPDF-NOTICE.md"
cp "$zlib_src/LICENSE" "$stage/LICENSES/zlib-LICENSE.txt"
cp "$jpeg_src/README" "$stage/LICENSES/libjpeg-README.txt"
cat > "$stage/LICENSES/THIRD-PARTY.txt" <<EOF_TXT
QPDF $QPDF_VERSION: Apache-2.0; see QPDF-LICENSE.txt and QPDF-NOTICE.md.
zlib $ZLIB_VERSION: zlib license; see zlib-LICENSE.txt.
Independent JPEG Group libjpeg $LIBJPEG_VERSION: IJG terms; see libjpeg-README.txt.
The exact Emscripten port recipes are pinned by Emscripten commit $EMSCRIPTEN_COMMIT.
EOF_TXT
find "$stage" -exec touch -t 198001010000 {} +
binary="qpdf-browser-full-$QPDF_VERSION-zoo-$BUILDER_VERSION.zip"
(cd "$stage" && zip -X -9 -q -r "$RELEASE/$binary" .)

source_asset="qpdf-sources-$QPDF_VERSION-zoo-$BUILDER_VERSION.tar.gz"
source_root="$work/source-bundle"
mkdir -p "$source_root/qpdf-$QPDF_VERSION" "$source_root/zlib-$ZLIB_VERSION" "$source_root/libjpeg-$LIBJPEG_VERSION" "$source_root/emscripten-port-recipes" "$source_root/wasm-zoo-builder"
tar -xzf "$qpdf_archive" --strip-components=1 -C "$source_root/qpdf-$QPDF_VERSION"
cp -a "$zlib_src/." "$source_root/zlib-$ZLIB_VERSION/"
cp -a "$jpeg_src/." "$source_root/libjpeg-$LIBJPEG_VERSION/"

raw_base="https://raw.githubusercontent.com/emscripten-core/emscripten/$EMSCRIPTEN_COMMIT"
for rel in tools/ports/zlib.py tools/ports/zlib/zconf.h tools/ports/libjpeg.py tools/ports/libjpeg/jconfig.h; do
  dest="$source_root/emscripten-port-recipes/$rel"
  mkdir -p "$(dirname "$dest")"
  curl -fsSL "$raw_base/$rel" -o "$dest"
done
grep -Fq "VERSION = '$ZLIB_VERSION'" "$source_root/emscripten-port-recipes/tools/ports/zlib.py"
grep -Fq "HASH = '$ZLIB_SOURCE_SHA512'" "$source_root/emscripten-port-recipes/tools/ports/zlib.py"
grep -Fq "VERSION = '$LIBJPEG_VERSION'" "$source_root/emscripten-port-recipes/tools/ports/libjpeg.py"
grep -Fq "HASH = '$LIBJPEG_SOURCE_SHA512'" "$source_root/emscripten-port-recipes/tools/ports/libjpeg.py"

tar -C "$ROOT" --exclude='./dist' --exclude='./release' -cf - . | tar -C "$source_root/wasm-zoo-builder" -xf -
cp "$DIST/BUILDINFO.txt" "$source_root/BUILDINFO-browser-full.txt"
cat > "$source_root/README.txt" <<EOF_TXT
Corresponding source and build recipe for WASM Zoo QPDF $TAG.
Contains the exact official QPDF release source, the exact zlib/libjpeg port sources used by Emscripten $EMSDK_VERSION, immutable Emscripten port recipe/header snapshots from $EMSCRIPTEN_COMMIT, and the reviewed Zoo builder recipe.
QPDF itself is unpatched.
EOF_TXT
tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner -C "$work" -czf "$RELEASE/$source_asset" source-bundle

cp "$DIST/provenance.json" "$RELEASE/provenance-browser-full.json"
cp "$DIST/sbom.cdx.json" "$RELEASE/sbom-browser-full.cdx.json"
cp "$DIST/BUILDINFO.txt" "$RELEASE/BUILDINFO-browser-full.txt"
(
  cd "$RELEASE"
  sha256sum "$binary" "$source_asset" BUILDINFO-browser-full.txt provenance-browser-full.json sbom-browser-full.cdx.json > SHA256SUMS.txt
)
printf '[OK] QPDF release assets prepared in %s\n' "$RELEASE"
