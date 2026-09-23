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
- Ghostscript
- jq
- Zstandard (requires BOTH browser profiles, native interop, corresponding source and Playground)

Ghostscript is source-archive-backed: the watcher requires the exact official `ghostscript-<version>.tar.xz` Release asset, consumes GitHub's published SHA-256 asset digest, resolves the matching `gs<version>` commit from `ArtifexSoftware/ghostpdl`, and passes all of those immutable values through candidate build and promotion preparation. For jq, candidate/promotion preparation also resolves the exact Oniguruma submodule commit from the candidate jq commit.

### Zstandard: reviewed-pin pipeline and independent npm source

For a newer official stable `facebook/zstd` Release, the watcher accepts only the canonical `vX.Y.Z` tag and exact resolved full commit SHA. Candidate preparation rechecks the live official Release (not draft/prerelease) and the same exact commit even on manual workflow dispatch. Candidate jobs build `browser-core` and `browser-full` in isolation, each with real Chromium roundtrip/frame/invalid-input tests. The CLI has mandatory native `zstd` interoperability **in both directions**. A dependent, required candidate job verifies both binary hashes against manifests and in-toto/SLSA provenance, verifies SBOMs, assembles the exact corresponding-source review bundle and runs the real staged two-profile Playground. A missing/skipped/failed profile or dependent review cannot produce a promotion PR.

Successful candidates may create `automation/promote-zstd-<version>` review-only PRs that bump only the Zoo builder patch, reviewed upstream pin and *future, not-yet-published* GitHub Release metadata. PR CI and real builds must pass again. After a human merges and manually pushes the reviewed new `zstd-v<builder>` tag, the existing tag-triggered release workflow independently rebuilds, checks native/CLI interop and publishes the new release. A separately reviewed npm rollout may then version and publish a **new** npm tarball. The already published `@wasm-zoo/zstd@0.3.0` stays frozen to `zstd-v0.3.0`, including its Registry SHA-1 `29add1aaf6ab0c3e9a3d538166a51a3f70cefa99`. Existing npm browser tests continue to test those authentic immutable bytes; an unreleased candidate may never be relabeled as the published npm version.

The published-only Playground intentionally shows *not yet released* after a new Zoo pin is merged until a human-reviewed Release actually exists. Do not silently serve old binary bytes under a new upstream version.

## Manual gates

- `adapter-gated`: no promotion PR is created from the readiness result. libvips stays here because the wasm-vips adapter plus libvips/Emscripten compatibility patch pins must be reviewed as a unit.
- `none`: upstream tracking may still create/update freshness information, but automatic candidate substitution/promotion is disabled until independently reviewed. Zstandard moved from this mode only after its dual-profile/native/corresponding-source gates were added.

## Required repository setting

The promotion job uses the repository `GITHUB_TOKEN` with explicit `contents: write`, `pull-requests: write`, `issues: write` and `actions: write` job permissions. GitHub must allow Actions to create pull requests for the repository. If PR creation is disabled in repository Actions settings, the candidate still reports its result but the promotion job will fail at the PR creation step without modifying `main`.

## Idempotency

Existing upstream issues are reused rather than treated as a permanent skip condition. The watcher refreshes the issue body with the current candidate mode/source metadata, then dispatches a candidate only when the issue has no prior candidate-dispatch/result or promotion-PR activity. This allows an issue created before automation support was enabled to resume safely without creating duplicates.

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
