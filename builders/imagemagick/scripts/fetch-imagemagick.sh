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
actual="$(git -C /src/imagemagick rev-parse --short=7 HEAD)"
[[ "$actual" == "$IMAGEMAGICK_COMMIT" ]] || { echo "ImageMagick commit mismatch: expected $IMAGEMAGICK_COMMIT got $actual" >&2; exit 1; }
