#!/usr/bin/env bash
set -euo pipefail
: "${GHOSTSCRIPT_VERSION:?}"
: "${GHOSTSCRIPT_SOURCE_URL:?}"
: "${GHOSTSCRIPT_SOURCE_SHA256:?}"
rm -rf /src/ghostscript /src/source
mkdir -p /src/ghostscript /src/source
archive="/src/source/ghostscript-${GHOSTSCRIPT_VERSION}.tar.xz"
curl -fL --retry 5 --retry-delay 2 --connect-timeout 30 "$GHOSTSCRIPT_SOURCE_URL" -o "$archive"
echo "${GHOSTSCRIPT_SOURCE_SHA256}  ${archive}" | sha256sum -c -
tar -xJf "$archive" -C /src/ghostscript --strip-components=1
[[ -s /src/ghostscript/configure ]] || { echo "[ERROR] release archive did not contain configure" >&2; exit 1; }
[[ -s /src/ghostscript/LICENSE ]] || { echo "[ERROR] release archive did not contain LICENSE" >&2; exit 1; }
grep -q 'GS_VERSION_MAJOR=10' /src/ghostscript/base/version.mak
grep -q 'GS_VERSION_MINOR=07' /src/ghostscript/base/version.mak
grep -q 'GS_VERSION_PATCH=1' /src/ghostscript/base/version.mak
printf '[OK] fetched Ghostscript %s release source (%s)
' "$GHOSTSCRIPT_VERSION" "$GHOSTSCRIPT_SOURCE_SHA256"
