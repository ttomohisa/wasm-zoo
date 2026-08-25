#!/usr/bin/env bash
set -euo pipefail
: "${JQ_REPOSITORY:?}" "${JQ_REF:?}" "${JQ_COMMIT:?}" "${ONIGURUMA_COMMIT:?}"
rm -rf /src/jq
mkdir -p /src/jq
git -C /src/jq init -q
git -C /src/jq remote add origin "$JQ_REPOSITORY"
git -C /src/jq fetch --depth 1 origin "refs/tags/$JQ_REF:refs/tags/$JQ_REF"
git -C /src/jq checkout -q --detach "$JQ_REF"
actual="$(git -C /src/jq rev-parse HEAD)"
[[ "$actual" == "$JQ_COMMIT" ]] || { echo "jq commit mismatch: expected $JQ_COMMIT got $actual" >&2; exit 1; }
GIT_ALLOW_PROTOCOL=https git -C /src/jq submodule update --init --depth 1 vendor/oniguruma
actual_onig="$(git -C /src/jq/vendor/oniguruma rev-parse HEAD)"
[[ "$actual_onig" == "$ONIGURUMA_COMMIT" ]] || { echo "Oniguruma submodule mismatch: expected $ONIGURUMA_COMMIT got $actual_onig" >&2; exit 1; }
described="$(git -C /src/jq describe --tags --exact-match HEAD)"
[[ "$described" == "$JQ_REF" ]] || { echo "jq tag mismatch: expected $JQ_REF got $described" >&2; exit 1; }
printf '[OK] fetched jq %s (%s) and Oniguruma %s\n' "$JQ_REF" "$JQ_COMMIT" "$ONIGURUMA_COMMIT"
