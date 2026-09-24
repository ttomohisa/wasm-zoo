# WASM Zoo v0.16.1 — project release review

This project patch release records the reviewed **libvips adapter-gate removal** already merged into the project. It does **not** change any package's reviewed upstream pin, Zoo builder version, npm version or immutable package GitHub Release, and it does not authorize automatic publication.

## Included in v0.16.1

- libvips now uses `tracker.candidateMode: auto`, so all seven currently published packages have reviewed automatic candidate contracts.
- libvips automation is deliberately **fail-closed**. A newer libvips release is not dispatched until an exact `kleisauke/wasm-vips` commit itself targets that release and the complete adapter bundle can be resolved.
- The watcher freezes the wasm-vips adapter commit, adapter version, Emscripten version/source commit, libvips compatibility patch head and Emscripten compatibility patch head before candidate execution. Moving compatibility branches are discovery inputs only; candidate builds consume immutable commits.
- If wasm-vips has not caught up, or an adapter/compatibility input cannot be resolved, the existing upstream Issue is refreshed and the daily watcher can retry later. No candidate build or promotion PR is created from an incomplete bundle.
- Once the adapter bundle is ready, both libvips `browser-core` and `browser-full` profiles must build and pass their browser smoke tests before review-only promotion preparation can succeed.
- The shared offline promotion rehearsal now includes libvips and verifies that synthetic libvips, wasm-vips, Emscripten and both compatibility-patch pins move together through the real promotion generator.
- The public Automation Contract now reports libvips as automatic while preserving the fail-closed adapter requirement.
- The reviewed-pin boundary is unchanged: automation may create a review-only promotion PR, but it never automatically merges, tags, creates a GitHub Release or publishes npm.

## Review checklist (PowerShell 7)

Run this **only after** manually reviewing and merging the v0.16.1 finalization PR. Do not create the project tag from a PR branch.

```powershell
cd C:\Users\broth\Desktop\workspace\wasm-zoo
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git status --short

# Confirm the reviewed project version is consistent everywhere.
Get-Content VERSION
node -p "require('./package.json').version"
node -p "require('./site/catalog.json').project.version"

# Re-run the deterministic repository/release contracts from reviewed main.
npm run catalog
npm run check
npm run metadata:check
npm run promotion:rehearse
git diff --check
git status --short

# Confirm the newest reviewed-main CI, browser lab and Pages deployment are green.
gh run list --workflow verify.yml --branch main --limit 3
gh run list --workflow cross-browser-compat.yml --branch main --limit 3
gh run list --workflow build-libvips.yml --branch main --limit 3
gh run list --workflow pages.yml --branch main --limit 5
```

The generated catalog must remain clean after `npm run catalog`. The shared promotion rehearsal must include libvips, and the current reviewed libvips 8.18.6 build must remain green for both browser profiles. The latest eligible main-branch browser snapshot must remain complete/fresh rather than falling back to older evidence.

## Optional project tag

The project tag is a **human action after all post-merge gates are reviewed**:

```powershell
git ls-remote --tags origin refs/tags/v0.16.1

# Only if absent, and ONLY from the verified reviewed main commit:
git tag -a v0.16.1 -m "WASM Zoo v0.16.1 — fail-closed libvips adapter automation"
git push origin v0.16.1
```

Optionally create a matching GitHub **project** release manually after reviewing `CHANGELOG.md`. Do not create or recreate any package release, do not republish any npm package, and do not change a reviewed package pin merely because the project version changed.
