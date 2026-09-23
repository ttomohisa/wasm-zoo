#!/usr/bin/env bash
set -euo pipefail
: "${ZSTD_REPOSITORY:?}" "${ZSTD_REF:?}" "${ZSTD_COMMIT:?}"
rm -rf /src/zstd
git init -q /src/zstd
git -C /src/zstd remote add origin "$ZSTD_REPOSITORY"
git -C /src/zstd fetch --depth 1 origin "refs/tags/$ZSTD_REF:refs/tags/$ZSTD_REF"
git -C /src/zstd checkout -q --detach "$ZSTD_REF"
actual="$(git -C /src/zstd rev-parse HEAD)"
[[ "$actual" == "$ZSTD_COMMIT" ]] || { echo "Zstandard commit mismatch: expected $ZSTD_COMMIT got $actual" >&2; exit 1; }
[[ "$(git -C /src/zstd describe --tags --exact-match HEAD)" == "$ZSTD_REF" ]] || { echo "Zstandard release tag mismatch" >&2; exit 1; }
grep -Eq '^#define ZSTD_VERSION_MAJOR[[:space:]]+1$' /src/zstd/lib/zstd.h
grep -Eq '^#define ZSTD_VERSION_MINOR[[:space:]]+5$' /src/zstd/lib/zstd.h
grep -Eq '^#define ZSTD_VERSION_RELEASE[[:space:]]+7$' /src/zstd/lib/zstd.h
printf '[OK] verified Zstandard %s at %s\n' "$ZSTD_REF" "$actual"
