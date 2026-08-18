#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[wasm-zoo/ffmpeg] %s\n' "$*"; }
fail() { printf '\n[ERROR] %s\n' "$*" >&2; exit 1; }

clone_exact_commit() {
  local primary="$1" fallback="$2" commit="$3" destination="$4"
  rm -rf "$destination"
  mkdir -p "$destination"
  git -C "$destination" init -q
  git -C "$destination" remote add origin "$primary"
  if ! git -C "$destination" fetch --depth 1 origin "$commit"; then
    [[ -n "$fallback" ]] || fail "Could not fetch $commit from $primary"
    log "Primary source failed; trying fallback mirror"
    git -C "$destination" remote set-url origin "$fallback"
    git -C "$destination" fetch --depth 1 origin "$commit"
  fi
  git -C "$destination" checkout -q --detach FETCH_HEAD
  local actual
  actual="$(git -C "$destination" rev-parse HEAD)"
  [[ "$actual" == "$commit" ]] || fail "Commit mismatch: expected $commit, got $actual"
}

load_profile() {
  local env_path="/workspace/profiles/${PROFILE}/profile.env"
  local flags_path="/workspace/profiles/${PROFILE}/ffmpeg.flags"
  [[ -s "$env_path" ]] || fail "Profile metadata missing: $env_path"
  [[ -f "$flags_path" ]] || fail "Profile flags missing: $flags_path"
  # shellcheck disable=SC1090
  source "$env_path"
  : "${PROFILE_DISPLAY_NAME:?}" "${PROFILE_USE_X264:?}" "${PROFILE_BINARY_LICENSE:?}" "${PROFILE_OUTPUT_DESCRIPTION:?}"
  declare -p PROFILE_REQUIRED_CONFIG >/dev/null 2>&1 || fail "PROFILE_REQUIRED_CONFIG missing"
  mapfile -t PROFILE_FLAGS < <(sed -e 's/\r$//' -e 's/[[:space:]]*#.*$//' -e '/^[[:space:]]*$/d' "$flags_path")
}

assert_ffmpeg_config() {
  local name="$1"
  grep -q "^${name}=yes$" ffbuild/config.mak || fail "FFmpeg configure did not enable ${name}"
}

sha256_of() { sha256sum "$1" | awk '{print $1}'; }
bytes_of() { wc -c < "$1" | tr -d ' '; }
validate_wasm() {
  local path="$1"
  head -c 4 "$path" | od -An -t x1 | tr -d ' \n' | grep -qi '^0061736d$' || fail "Invalid WASM magic: $path"
}

print_toolchain() {
  local line
  line="$(emcc --version | head -n 1)"
  log "$line"
  [[ "$line" == *"${EMSDK_VERSION}"* ]] || fail "Emscripten version mismatch; expected ${EMSDK_VERSION}"
  printf 'Zoo build:      %s\n' "${BUILDER_VERSION:-n/a}"
  printf 'FFmpeg:         %s (%s)\n' "${FFMPEG_REF:-n/a}" "${FFMPEG_COMMIT:-n/a}"
  printf 'Emscripten:     %s (%s)\n' "${EMSDK_VERSION:-n/a}" "${EMSCRIPTEN_COMMIT:-n/a}"
  printf 'Profile:        %s\n' "${PROFILE:-n/a}"
}
