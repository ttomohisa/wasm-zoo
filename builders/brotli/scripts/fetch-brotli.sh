#!/usr/bin/env bash
set -euo pipefail
: "${BROTLI_REPOSITORY:?}" "${BROTLI_REF:?}" "${BROTLI_COMMIT:?}"
rm -rf /src/brotli
mkdir -p /src/brotli
git -C /src/brotli init -q
git -C /src/brotli remote add origin "$BROTLI_REPOSITORY"
git -C /src/brotli fetch --depth 1 origin "refs/tags/$BROTLI_REF:refs/tags/$BROTLI_REF"
git -C /src/brotli checkout -q --detach "$BROTLI_REF"
actual="$(git -C /src/brotli rev-parse HEAD)"
[[ "$actual" == "$BROTLI_COMMIT" ]] || { echo "Brotli commit mismatch: expected $BROTLI_COMMIT got $actual" >&2; exit 1; }
described="$(git -C /src/brotli describe --tags --exact-match HEAD)"
[[ "$described" == "$BROTLI_REF" ]] || { echo "Brotli tag mismatch: expected $BROTLI_REF got $described" >&2; exit 1; }
[[ -s /src/brotli/CMakeLists.txt && -s /src/brotli/c/tools/brotli.c && -s /src/brotli/LICENSE ]] || { echo "Reviewed Brotli source tree is incomplete" >&2; exit 1; }
printf '[OK] fetched Brotli %s (%s) with no source patch step\n' "$BROTLI_REF" "$BROTLI_COMMIT"
