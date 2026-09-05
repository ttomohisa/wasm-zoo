# Automated upstream promotion PRs

WASM Zoo automates preparation, not approval.

## Flow

For packages with `tracker.candidateMode: auto`:

1. the daily upstream watcher detects a newer stable release;
2. the watcher opens one upstream issue and dispatches `upstream-candidate.yml` with the exact ref, commit and release timestamp;
3. the isolated candidate workspace substitutes the candidate pin and runs the package's real browser build/smoke test;
4. only when the candidate result is `success`, `scripts/prepare-promotion.mjs` prepares the reviewed repository change on a fresh `main` checkout;
5. the script bumps the package builder patch version, updates exact source pins and package/release metadata, refreshes current version-facing docs, and `npm run catalog` regenerates `site/catalog.json`;
6. the workflow runs repository validation and the package repository checker before pushing anything;
7. the bot pushes `automation/promote-<slug>-<version>` and opens a review-only PR;
8. because workflow-created PR events can require approval when using the repository `GITHUB_TOKEN`, the workflow explicitly dispatches `verify.yml` and `build-<slug>.yml` on the promotion branch;
9. a human reviews the diff and CI, merges the PR, confirms the normal `main` checks, and creates the release tag manually.

The automation never merges a PR, creates a package release tag, or publishes a GitHub Release.

## Automatic packages

The current automatic promotion set is defined in `scripts/upstream-config.mjs`:

- FFmpeg
- libarchive
- ImageMagick
- jq

For jq, candidate/promotion preparation also resolves the exact Oniguruma submodule commit from the candidate jq commit.

## Manual gates

- `adapter-gated`: no promotion PR is created from the readiness result. libvips stays here because the wasm-vips adapter plus libvips/Emscripten compatibility patch pins must be reviewed as a unit.
- `none`: upstream tracking may still create/update freshness information, but no automatic candidate substitution or promotion PR is attempted. Ghostscript stays here while the official source-asset digest remains part of the manual trust gate.

## Required repository setting

The promotion job uses the repository `GITHUB_TOKEN` with explicit `contents: write`, `pull-requests: write`, `issues: write` and `actions: write` job permissions. GitHub must allow Actions to create pull requests for the repository. If PR creation is disabled in repository Actions settings, the candidate still reports its result but the promotion job will fail at the PR creation step without modifying `main`.

## Idempotency

The bot branch is normally `automation/promote-<slug>-<version>`.

- If an open PR already exists for that branch, the workflow reuses it and redispatches the validation workflows.
- If the candidate version is already the reviewed version, promotion preparation exits without changes.
- If the expected branch exists without an open PR, a run-specific suffix is used rather than force-pushing over an existing branch.

## Human release steps after merge

After the promotion PR is merged:

1. confirm `Verify catalog` and the package build workflow are green on `main`;
2. update local `main` with `git pull --ff-only origin main`;
3. confirm `HEAD` matches `origin/main`;
4. create the package tag declared in `packages/<slug>/package.json` under `release.tag`;
5. push that tag and confirm the package Release workflow succeeds;
6. confirm Pages/Release Health as appropriate;
7. close the upstream issue with the promotion PR and release tag recorded.
