# Package catalog sources

Every `packages/<slug>/package.json` is human-reviewed metadata used to generate `site/catalog.json`.

Do not set `status` to `available` merely because an upstream project can theoretically compile to WASM. `available` means the Zoo repository contains a reproducible build path and a meaningful runtime test for at least one published profile.

Planned packages should keep `upstream.version` as `null` until a concrete Zoo build is pinned and tested.

## Freshness metadata

`tracker` describes how `scripts/check-upstream.mjs` discovers a stable upstream release. Supported tracker types are `github-releases` and `github-tags`.

Candidate modes:

- `auto`: the watcher may dispatch `.github/workflows/upstream-candidate.yml` with an isolated candidate ref/commit. It never updates the reviewed repository pin automatically.
- `adapter-gated`: a new upstream version requires a reviewed adapter/patch update before the normal build matrix can be meaningful. The candidate workflow records that gate instead of pretending to test a source version with stale adapter pins.
- `none`: track freshness only.

`referenceWasm` is an informational comparison against a representative third-party WASM project. It must include a `checkedAt` date because it is not maintained by WASM Zoo.

## Feature matrix

Available packages should publish `capabilityMatrix` rows using the shared state vocabulary:

- `included` — present in the Zoo profile.
- `excluded` — intentionally removed from this profile.
- `na` — not applicable to the browser WASM target.
- `optional` — optional in native builds.
- `platform` — depends on the native platform.
- `unknown` — not yet verified.

Each row contains `native`, a `profiles` object keyed by profile id, and an explanatory `note`. Do not use a plain false value when the more precise distinction is `na` or `unknown`.

## npm distribution metadata

`npm` is optional and means the reviewed package also has an npm distribution contract. While a package is being proven, use `status: canary`; move it to `published` only after the registry package and browser/bundler gates are confirmed.

Required npm fields are:

- `package` — scoped package name under `@wasm-zoo/`;
- `version` — must match `zoo.builderVersion` so the npm artifact identifies the same Zoo distribution revision;
- `profile` — one existing published profile whose immutable GitHub Release ZIP supplies the binary assets;
- `entry` — currently `index.mjs` for the bundler-aware entry;
- `bundledAssets` — must be `true`; npm packages must not silently fetch their core WASM from a third-party CDN;
- `publishWorkflow` — currently `publish-npm.yml`.

Automatic upstream promotion must bump `npm.version` together with the builder version. Existing GitHub Release assets remain immutable; npm packaging is a separate distribution step derived from the declared release asset.
