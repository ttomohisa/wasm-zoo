#!/usr/bin/env bash
set -euo pipefail
: "${ZLIB_VERSION:?}" "${ZLIB_SOURCE_URL:?}" "${ZLIB_SOURCE_SHA512:?}" "${LIBJPEG_VERSION:?}" "${LIBJPEG_SOURCE_URL:?}" "${LIBJPEG_SOURCE_SHA512:?}"
OUT="${1:-/out}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

fetch_and_verify() {
  local url="$1" sha="$2" out="$3"
  curl -fsSL "$url" -o "$out"
  printf '%s  %s\n' "$sha" "$out" | sha512sum -c -
}

fetch_and_verify "$ZLIB_SOURCE_URL" "$ZLIB_SOURCE_SHA512" "$work/zlib.tar.gz"
mkdir -p "$work/zlib"
tar -xzf "$work/zlib.tar.gz" --strip-components=1 -C "$work/zlib"
[[ -s "$work/zlib/LICENSE" ]] || { echo "[ERROR] zlib LICENSE missing from pinned source" >&2; exit 1; }

fetch_and_verify "$LIBJPEG_SOURCE_URL" "$LIBJPEG_SOURCE_SHA512" "$work/libjpeg.tar.gz"
mkdir -p "$work/libjpeg"
tar -xzf "$work/libjpeg.tar.gz" --strip-components=1 -C "$work/libjpeg"
[[ -s "$work/libjpeg/README" ]] || { echo "[ERROR] libjpeg README/license text missing from pinned source" >&2; exit 1; }

cp "$work/zlib/LICENSE" "$OUT/LICENSE-ZLIB.txt"
cp "$work/libjpeg/README" "$OUT/LICENSE-LIBJPEG.txt"
printf '[OK] staged pinned zlib %s and libjpeg %s license texts\n' "$ZLIB_VERSION" "$LIBJPEG_VERSION"
