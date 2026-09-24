#!/usr/bin/env bash
set -euo pipefail
: "${QPDF_REPOSITORY:?}" "${QPDF_VERSION:?}" "${QPDF_REF:?}" "${QPDF_COMMIT:?}" "${QPDF_SOURCE_URL:?}" "${QPDF_SOURCE_SHA256:?}"
resolved="$(git ls-remote "$QPDF_REPOSITORY" "refs/tags/$QPDF_REF^{}" | awk 'NR==1 {print $1}')"
[[ "$resolved" == "$QPDF_COMMIT" ]] || { echo "[ERROR] QPDF tag commit mismatch: expected $QPDF_COMMIT got ${resolved:-<empty>}" >&2; exit 1; }
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
archive="$work/qpdf.tar.gz"
curl -fsSL "$QPDF_SOURCE_URL" -o "$archive"
printf '%s  %s\n' "$QPDF_SOURCE_SHA256" "$archive" | sha256sum -c -
rm -rf /src/qpdf && mkdir -p /src/qpdf
tar -xzf "$archive" --strip-components=1 -C /src/qpdf
grep -Eq "VERSION[[:space:]]+$QPDF_VERSION" /src/qpdf/CMakeLists.txt || { echo "[ERROR] extracted QPDF source does not declare $QPDF_VERSION" >&2; exit 1; }
[[ -s /src/qpdf/LICENSE.txt ]] || { echo "[ERROR] QPDF license missing from official source archive" >&2; exit 1; }
printf '[OK] QPDF %s official source archive verified; tag commit %s\n' "$QPDF_VERSION" "$QPDF_COMMIT"
