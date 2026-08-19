#!/usr/bin/env bash
set -euo pipefail
: "${LIBARCHIVE_REPOSITORY:?}"
: "${LIBARCHIVE_REF:?}"
: "${LIBARCHIVE_COMMIT:?}"
rm -rf /src/libarchive
mkdir -p /src/libarchive
git -C /src/libarchive init -q
git -C /src/libarchive remote add origin "$LIBARCHIVE_REPOSITORY"
git -C /src/libarchive fetch --depth 1 origin "$LIBARCHIVE_COMMIT"
git -C /src/libarchive checkout -q --detach FETCH_HEAD
actual="$(git -C /src/libarchive rev-parse HEAD)"
[[ "$actual" == "$LIBARCHIVE_COMMIT" ]] || { echo "libarchive commit mismatch: $actual" >&2; exit 1; }
ref_commit="$(git -C /src/libarchive rev-list -n 1 "$LIBARCHIVE_REF" 2>/dev/null || true)"
if [[ -n "$ref_commit" && "$ref_commit" != "$LIBARCHIVE_COMMIT" ]]; then
  echo "libarchive ref mismatch: $LIBARCHIVE_REF -> $ref_commit" >&2
  exit 1
fi
printf '[OK] libarchive %s @ %s\n' "$LIBARCHIVE_REF" "$actual"
