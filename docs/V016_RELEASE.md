# WASM Zoo v0.16.0 — project release review

This project release records **reviewed automation hardening already merged into the project**. It does **not** change any package's reviewed upstream pin, Zoo builder version, npm version or immutable package GitHub Release, and it does not authorize automatic publication.

## Included in v0.16.0

- Zstandard stable-release candidate automation now uses exact upstream tag/commit identity across both `browser-core` and `browser-full`. The full CLI candidate must also pass bidirectional native-zstd interoperability before a review-only promotion PR can be prepared.
- Zstandard's already-published npm identity remains separately immutable: `@wasm-zoo/zstd@0.3.0`, source upstream 1.5.7, builder 0.3.0 and `zstd-v0.3.0` are not rewritten by a later package promotion. A future reviewed package promotion leaves the Playground fail-closed until a separately reviewed npm release exists.
- One shared offline synthetic promotion rehearsal now covers every package whose manifest declares `tracker.candidateMode: auto`. It runs the real promotion generator in isolated git worktrees and validates reviewed pins, builder/release metadata and package-specific invariants before CI accepts the repository.
- Ghostscript rehearsal preserves its official source release tag, archive URL and SHA-256 identity together; jq rehearsal carries an exact Oniguruma submodule commit; Zstandard rehearsal verifies that its published npm object stays unchanged.
- The public Pages **Automation Contract** is derived directly from package manifests. It documents candidate mode, candidate profiles, review-only promotion behavior and shared rehearsal coverage without polling live Issues, PRs or workflow state.
- libvips remains **`adapter-gated`** and outside ordinary automatic promotion rehearsal. Its wasm-vips adapter and compatibility patch pins still require a reviewed unit before a meaningful upstream candidate can advance.
- The reviewed-pin boundary is unchanged: automation may create a review-only promotion PR, but it never automatically merges, tags, creates a GitHub Release or publishes npm.

## Review checklist (PowerShell 7)

Run this **only after** manually reviewing and merging the v0.16.0 finalization PR. Do not create the project tag from a PR branch.

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
gh run list --workflow pages.yml --branch main --limit 5
```

The generated catalog must remain clean after `npm run catalog`. The shared promotion rehearsal must pass for the automatic package set while still reporting libvips as adapter-gated. The latest eligible main-branch browser snapshot must remain complete/fresh rather than falling back to an older passing result.

## Optional project tag

The project tag is a **human action after all post-merge gates are reviewed**:

```powershell
git ls-remote --tags origin refs/tags/v0.16.0

# Only if absent, and ONLY from the verified reviewed main commit:
git tag -a v0.16.0 -m "WASM Zoo v0.16.0 — reviewed automation contract and promotion rehearsal"
git push origin v0.16.0
```

Optionally create a matching GitHub **project** release manually after reviewing `CHANGELOG.md`. Do not create or recreate any package release, do not republish any npm package, and do not change a reviewed package pin merely because the project version changed.
