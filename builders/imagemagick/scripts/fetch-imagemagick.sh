#!/usr/bin/env bash
set -euo pipefail
: "${IMAGEMAGICK_REPOSITORY:?}"
: "${IMAGEMAGICK_REF:?}"
: "${IMAGEMAGICK_COMMIT:?}"
rm -rf /src/imagemagick && mkdir -p /src
 git init -q /src/imagemagick
 git -C /src/imagemagick remote add origin "$IMAGEMAGICK_REPOSITORY"
 git -C /src/imagemagick fetch --depth 1 origin "$IMAGEMAGICK_REF"
 git -C /src/imagemagick checkout -q --detach FETCH_HEAD
[[ "$IMAGEMAGICK_COMMIT" =~ ^[0-9a-fA-F]{7,40}$ ]] || {
  echo "ImageMagick commit pin must be a 7-40 character hexadecimal SHA: $IMAGEMAGICK_COMMIT" >&2
  exit 1
}
actual="$(git -C /src/imagemagick rev-parse HEAD)"
expected="${IMAGEMAGICK_COMMIT,,}"
[[ "${actual:0:${#expected}}" == "$expected" ]] || {
  echo "ImageMagick commit mismatch: expected $IMAGEMAGICK_COMMIT got $actual" >&2
  exit 1
