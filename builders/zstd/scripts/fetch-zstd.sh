#!/usr/bin/env bash
set -euo pipefail

# Keep exact tag, commit and header version checks for every candidate and reviewed build.
# The source directory argument also permits an offline regression test in a temporary directory.
fetch_zstd() {
  local source_dir="$1" actual actual_tag header_version
  : "${ZSTD_REPOSITORY:?}" "${ZSTD_REF:?}" "${ZSTD_COMMIT:?}"
  if [[ ! "$ZSTD_REF" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    echo "Invalid Zstandard release tag: $ZSTD_REF (expected vMAJOR.MINOR.RELEASE)" >&2
    return 1
  fi
  rm -rf -- "$source_dir"
  git init -q "$source_dir"
  git -C "$source_dir" remote add origin "$ZSTD_REPOSITORY"
  git -C "$source_dir" fetch --depth 1 origin "refs/tags/$ZSTD_REF:refs/tags/$ZSTD_REF"
  git -C "$source_dir" checkout -q --detach "refs/tags/$ZSTD_REF"
  actual="$(git -C "$source_dir" rev-parse HEAD)"
  [[ "$actual" == "$ZSTD_COMMIT" ]] || { echo "Zstandard commit mismatch: expected $ZSTD_COMMIT got $actual" >&2; return 1; }
  actual_tag="$(git -C "$source_dir" describe --tags --exact-match HEAD)" || { echo "Zstandard release tag missing: $ZSTD_REF" >&2; return 1; }
  [[ "$actual_tag" == "$ZSTD_REF" ]] || { echo "Zstandard release tag mismatch: expected $ZSTD_REF got $actual_tag" >&2; return 1; }
  # Require exactly one canonical integer definition per component. Never relax the pin.
  if ! header_version="$(awk '
    $1 == "#define" && $2 ~ /^ZSTD_VERSION_(MAJOR|MINOR|RELEASE)$/ {
      count[$2]++
      if (NF != 3 || $3 !~ /^(0|[1-9][0-9]*)$/) bad = 1
      value[$2] = $3
    }
    END {
      if (bad || count["ZSTD_VERSION_MAJOR"] != 1 || count["ZSTD_VERSION_MINOR"] != 1 || count["ZSTD_VERSION_RELEASE"] != 1) exit 1
      printf "v%s.%s.%s", value["ZSTD_VERSION_MAJOR"], value["ZSTD_VERSION_MINOR"], value["ZSTD_VERSION_RELEASE"]
    }' "$source_dir/lib/zstd.h")"; then
    echo "Zstandard header version is missing, duplicate or malformed: $source_dir/lib/zstd.h" >&2
    return 1
  fi
  [[ "$header_version" == "$ZSTD_REF" ]] || { echo "Zstandard header version mismatch: expected $ZSTD_REF got $header_version" >&2; return 1; }
  printf '[OK] verified Zstandard %s at %s\n' "$ZSTD_REF" "$actual"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  fetch_zstd /src/zstd
fi
