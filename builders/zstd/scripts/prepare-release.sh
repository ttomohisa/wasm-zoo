#!/usr/bin/env bash
# Build both reviewed profiles and their metadata before calling this script.
# Produces release-ready assets; does not create tags, merge, release or publish.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/versions.env"
EXPECTED="zstd-v${BUILDER_VERSION}"
TAG="${1:-$EXPECTED}"
[[ "$TAG" == "$EXPECTED" ]] || { echo "Refusing incorrect release tag: $TAG (expected $EXPECTED)" >&2; exit 1; }
for cmd in git tar gzip sha256sum zip unzip node; do command -v "$cmd" >/dev/null || { echo "Missing release tool: $cmd" >&2; exit 1; }; done
node "$ROOT/scripts/verify-build-inputs.mjs"
RELEASE="$ROOT/release"
rm -rf "$RELEASE" && mkdir -p "$RELEASE"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
for profile in browser-core browser-full; do
  dist="$ROOT/dist/$profile"
  stage="$work/$profile"
  mkdir -p "$stage"
  if [[ "$profile" == browser-core ]]; then
    required=(zstd-core.js zstd-core.wasm zstd-core.js.gz zstd-core.wasm.gz browser-zstd.js browser-zstd-worker.js wasm-zoo.mjs)
  else
    required=(zstd-cli.js zstd-cli.wasm zstd-cli.js.gz zstd-cli.wasm.gz browser-zstd-cli.js browser-zstd-cli-worker.js wasm-zoo-cli.mjs)
  fi
  required+=(manifest.json features.json provenance.json sbom.cdx.json BUILDINFO.txt LICENSE-zstd.txt)
  for file in "${required[@]}"; do
    [[ -s "$dist/$file" ]] || { echo "Missing release input: $profile/$file" >&2; exit 1; }
    cp "$dist/$file" "$stage/"
  done
  find "$stage" -exec touch -t 198001010000 {} +
  binary="zstd-${profile}-${ZSTD_REF#v}-zoo-${BUILDER_VERSION}.zip"
  (cd "$stage" && LC_ALL=C find . -type f -printf '%P\n' | LC_ALL=C sort | zip -X -9 -q "$RELEASE/$binary" -@)
  cp "$dist/provenance.json" "$RELEASE/provenance-$profile.json"
  cp "$dist/sbom.cdx.json" "$RELEASE/sbom-$profile.cdx.json"
  cp "$dist/BUILDINFO.txt" "$RELEASE/BUILDINFO-$profile.txt"
done
sourceDir="$work/source-bundle"
mkdir -p "$sourceDir/zstd-${ZSTD_REF#v}" "$sourceDir/wasm-zoo-builder"
git init -q "$work/zstd-src"
git -C "$work/zstd-src" remote add origin "$ZSTD_REPOSITORY"
git -C "$work/zstd-src" fetch -q --depth 1 origin "refs/tags/$ZSTD_REF:refs/tags/$ZSTD_REF"
git -C "$work/zstd-src" checkout -q --detach "$ZSTD_REF"
[[ "$(git -C "$work/zstd-src" rev-parse HEAD)" == "$ZSTD_COMMIT" ]] || { echo "Source commit mismatch" >&2; exit 1; }
[[ "$(git -C "$work/zstd-src" describe --tags --exact-match HEAD)" == "$ZSTD_REF" ]] || { echo "Source tag mismatch" >&2; exit 1; }
cp -a "$work/zstd-src/." "$sourceDir/zstd-${ZSTD_REF#v}/"
rm -rf "$sourceDir/zstd-${ZSTD_REF#v}/.git"
cmp "$sourceDir/zstd-${ZSTD_REF#v}/LICENSE" "$ROOT/dist/browser-core/LICENSE-zstd.txt"
cmp "$sourceDir/zstd-${ZSTD_REF#v}/LICENSE" "$ROOT/dist/browser-full/LICENSE-zstd.txt"
# Include the reviewed exact Zoo build recipe, runtime wrappers, tests and release scripts.
tar -C "$ROOT" --exclude='./dist' --exclude='./release' --exclude='./node_modules' \
  --exclude='./.git' -cf - . | tar -C "$sourceDir/wasm-zoo-builder" -xf -
cp "$ROOT/dist/browser-core/BUILDINFO.txt" "$sourceDir/BUILDINFO-browser-core.txt"
cp "$ROOT/dist/browser-full/BUILDINFO.txt" "$sourceDir/BUILDINFO-browser-full.txt"
cat > "$sourceDir/README.txt" <<EOF
Corresponding sources for WASM Zoo Zstandard $TAG.
zstd-${ZSTD_REF#v}: exact official Zstandard source at $ZSTD_COMMIT.
wasm-zoo-builder: the exact reviewed build/runtime/test/release recipes.
Emscripten $EMSDK_VERSION exact commit $EMSCRIPTEN_COMMIT is recorded in versions.env.
Choose the upstream BSD LICENSE option; both profiles omit pthreads and external codecs.
EOF
sourceAsset="zstd-sources-${ZSTD_REF#v}-zoo-${BUILDER_VERSION}.tar.gz"
tar --sort=name --mtime='UTC 1980-01-01' --owner=0 --group=0 --numeric-owner \
  -C "$work" -czf "$RELEASE/$sourceAsset" source-bundle
(
  cd "$RELEASE"
  find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -printf '%P\n' | LC_ALL=C sort | xargs sha256sum > SHA256SUMS.txt
  sha256sum -c SHA256SUMS.txt
)
node "$ROOT/scripts/verify-release-assets.mjs"
echo "[OK] prepared two verified Zstandard binary ZIPs, exact source archive, standalone provenance/SBOM, and SHA256SUMS; no publication"
