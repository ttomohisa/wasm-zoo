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
IFS='.' read -r gs_major gs_minor gs_patch <<< "$GHOSTSCRIPT_VERSION"
[[ "$gs_major" =~ ^[0-9]+$ && "$gs_minor" =~ ^[0-9]+$ && "$gs_patch" =~ ^[0-9]+$ ]] || { echo "[ERROR] invalid GHOSTSCRIPT_VERSION: $GHOSTSCRIPT_VERSION" >&2; exit 1; }
grep -q "^GS_VERSION_MAJOR=${gs_major}$" /src/ghostscript/base/version.mak
grep -q "^GS_VERSION_MINOR=${gs_minor}$" /src/ghostscript/base/version.mak
grep -q "^GS_VERSION_PATCH=${gs_patch}$" /src/ghostscript/base/version.mak
printf '[OK] fetched Ghostscript %s release source (%s)
' "$GHOSTSCRIPT_VERSION" "$GHOSTSCRIPT_SOURCE_SHA256"
