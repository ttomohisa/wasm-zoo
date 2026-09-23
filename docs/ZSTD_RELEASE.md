# Zstandard reviewed package release procedure

This procedure applies **after** a review-only Zstandard promotion PR has been manually merged. It never authorizes automation to merge, tag, release or publish npm.

The authoritative package pin is `builders/zstd/versions.env`. The build/release workflows derive the release title, upstream version, exact commit and builder version from those reviewed values rather than from hard-coded historical numbers.

## Before tagging

On PowerShell 7:

```powershell
cd C:\Users\broth\Desktop\workspace\wasm-zoo
git fetch origin main --tags
git switch main
git pull --ff-only origin main
git status --short

Get-Content builders/zstd/versions.env
node builders/zstd/scripts/check-repository.mjs
npm run catalog
npm run check
npm run metadata:check

gh run list --workflow verify.yml --branch main --limit 3
gh run list --workflow build-zstd.yml --branch main --limit 3
```

The latest reviewed-main `build-zstd.yml` must have both `browser-core` and `browser-full` real Chromium operations green. The full profile must also have the mandatory browser/native two-way Zstandard frame interoperability gate green. Its dependent package job must verify the corresponding-source release bundle.

## Manual package tag

Resolve the reviewed builder/upstream values from `versions.env`:

```powershell
$zstd = @{}
Get-Content builders/zstd/versions.env | ForEach-Object {
    if ($_ -match '^([A-Z0-9_]+)=(.*)$') {
        $zstd[$matches[1]] = $matches[2]
    }
}

$builder = $zstd.BUILDER_VERSION
$upstream = $zstd.ZSTD_REF -replace '^v',''
$tag = "zstd-v$builder"

git ls-remote --tags origin "refs/tags/$tag"
```

If the tag is absent, and only after reviewing the merged main commit and successful main CI:

```powershell
git tag -a $tag -m "WASM Zoo Zstandard $upstream browser release"
git push origin $tag
gh run list --workflow release-zstd.yml --limit 3
```

The tag-triggered release workflow independently checks that the tag is the reviewed builder tag on main ancestry, rebuilds both profiles, reruns Chromium and native interoperability, creates checksum-covered binary/source/provenance/SBOM assets, and only then creates the GitHub Release. Pages is refreshed afterward and serves only checksum-verified published assets.

## npm remains a separate review

A package promotion does **not** advance the public npm package automatically. `packages/zstd/package.json -> npm.source` continues to identify the immutable release underlying the currently published npm version. After the new GitHub Release exists, any npm version/source update is a separate reviewed change and publication remains human-controlled.

Never republish an existing npm version, rewrite an existing package GitHub Release, or infer that a successful candidate authorizes publication.

## Historical v0.15 bootstrap

The first published package release was `zstd-v0.3.0`, and the first npm distribution was `@wasm-zoo/zstd@0.3.0`. Those historical identities remain immutable. Current reviewed pins may move only through the flow documented above.
