#!/usr/bin/env bash
set -euo pipefail
source /workspace/scripts/docker-common.sh
: "${FFMPEG_REPOSITORY:?}" "${FFMPEG_COMMIT:?}" "${SRC_DIR:?}"
mkdir -p "$SRC_DIR"
log "Fetching exact FFmpeg source"
clone_exact_commit "$FFMPEG_REPOSITORY" "" "$FFMPEG_COMMIT" "$SRC_DIR/ffmpeg"
