#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
repo="$work/upstream"
git init -q "$repo"
git -C "$repo" config user.name "WASM Zoo regression test"
git -C "$repo" config user.email "test@example.invalid"
mkdir -p "$repo/lib"
make_tag() {
  local tag="$1" major="$2" minor="$3" release="$4" style="${5:-lightweight}"
  printf '#define ZSTD_VERSION_MAJOR    %s\n#define ZSTD_VERSION_MINOR    %s\n#define ZSTD_VERSION_RELEASE  %s\n' "$major" "$minor" "$release" > "$repo/lib/zstd.h"
  if [[ "$style" == duplicate ]]; then
    printf '#define ZSTD_VERSION_MINOR    %s\n' "$minor" >> "$repo/lib/zstd.h"
  fi
  git -C "$repo" add lib/zstd.h
  git -C "$repo" commit -qm "fixture $tag"
  if [[ "$style" == annotated ]]; then git -C "$repo" tag -am "fixture $tag" "$tag"; else git -C "$repo" tag "$tag"; fi
}
make_tag v1.5.7 1 5 7
make_tag v1.6.0 1 6 0 annotated
make_tag v2.0.1 2 0 1
make_tag v2.1.0 2 0 0
make_tag v2.2.0 2 2 1
make_tag v3.0.0 2 0 0
make_tag v3.1.0 3 1 0 duplicate
make_tag v3.2.0 3 x 0
commit_for() { git -C "$repo" rev-parse "refs/tags/$1^{commit}"; }
run_fetch() {
  ZSTD_REPOSITORY="$repo" ZSTD_REF="$1" ZSTD_COMMIT="$2" \
    bash -c 'source "$1"; fetch_zstd "$2"' _ "$ROOT/scripts/fetch-zstd.sh" "$work/checkout"
}
for tag in v1.5.7 v1.6.0 v2.0.1; do
  run_fetch "$tag" "$(commit_for "$tag")"
done
expect_failure() {
  local tag="$1" sha="$2" diagnostic="$3"
  if run_fetch "$tag" "$sha" > "$work/output" 2>&1; then
    echo "Expected failure for $tag" >&2; exit 1
  fi
  if ! grep -Fq "$diagnostic" "$work/output"; then
    cat "$work/output" >&2; echo "Missing diagnostic: $diagnostic" >&2; exit 1
  fi
  printf '[OK] rejected %s: %s\n' "$tag" "$diagnostic"
}
expect_failure v1.6.0 "$(commit_for v1.5.7)" 'Zstandard commit mismatch'
expect_failure v2.1.0 "$(commit_for v2.1.0)" 'Zstandard header version mismatch: expected v2.1.0 got v2.0.0'
expect_failure v2.2.0 "$(commit_for v2.2.0)" 'Zstandard header version mismatch: expected v2.2.0 got v2.2.1'
expect_failure v3.0.0 "$(commit_for v3.0.0)" 'Zstandard header version mismatch: expected v3.0.0 got v2.0.0'
expect_failure v3.1.0 "$(commit_for v3.1.0)" 'Zstandard header version is missing, duplicate or malformed'
expect_failure v3.2.0 "$(commit_for v3.2.0)" 'Zstandard header version is missing, duplicate or malformed'
expect_failure v1.6 "$(commit_for v1.6.0)" 'Invalid Zstandard release tag'
echo '[OK] Zstandard exact-source fetch regression tests passed'
