# Package onboarding contract

WASM Zoo adds packages in stages. The contract is intentionally stricter as a package moves from planning to a published distribution so incomplete work can be reviewed without pretending that release or npm support already exists.

## Lifecycle

### `planned`

Metadata may exist before a builder is ready. A planned package is not required to have build, release, Playground or npm infrastructure.

### `experimental`

An experimental package is buildable and must have the common browser-builder skeleton:

- `builders/<slug>/README.md`
- `build.sh` and `build.bat`
- `versions.env`
- `docker/Dockerfile`
- `runtime/wasm-zoo.mjs`
- `scripts/build.ps1`
- `scripts/check-repository.mjs`
- `scripts/prepare-release.sh`
- `scripts/smoke-test.mjs`
- `tests/smoke-test.html`
- one `profiles/<profile>/profile.env` for every declared profile
- `.github/workflows/build-<slug>.yml`

The manifest builder version must match `versions.env`. The build workflow must run the package repository checker and the real builder. The onboarding check also executes every active package's repository checker.

This stage is intended for a new canary such as QPDF while its build and browser smoke are being proven. Release, Playground and npm publication do not have to be claimed yet.

### `available`

An available package additionally requires:

- immutable release metadata in the package manifest;
- integration documentation and a capability matrix;
- `.github/workflows/release-<slug>.yml`;
- a release workflow that runs `prepare-release.sh` and creates a GitHub Release;
- at least one Playground-enabled profile;
- `site/<slug>-playground/index.html` and `app.js`;
- Pages staging for the package's published release assets.

Changing a package to `available` before these surfaces exist is a contract failure.

## Automatic upstream candidates

`tracker.candidateMode` is one of `auto`, `adapter-gated`, or `none`.

An `auto` package must declare valid candidate profiles, have an entry in `scripts/upstream-config.mjs`, and have a candidate job, result mapping and promotion repository-checker mapping in `upstream-candidate.yml`.

The contract verifies wiring only. Package-specific source identity and build invariants remain in the package repository checker and the shared promotion rehearsal.

Automation remains review-only: it never automatically merges, creates release tags, creates GitHub Releases or publishes npm.

## npm and the Cross-browser Lab

A manifest with `npm.status: published` must also be wired into:

- the `publish-npm.yml` package choices;
- the shared npm package generator/runtime contract;
- a real package-specific operation in `scripts/smoke-npm-package.mjs`;
- the Chromium / Firefox / WebKit compatibility matrix.

This means a new package can be released to GitHub before npm rollout, while setting npm to `published` is not allowed until its registry and browser-test surfaces are present.

## Commands

Run the onboarding contract directly:

```text
npm run onboarding:check
```

The same check is part of `npm run check` and therefore runs in the normal Verify catalog and Pages validation paths.

Package-specific behavior should not be moved into this file merely to make every builder look identical. The onboarding contract owns **required surfaces and wiring**; each builder's `scripts/check-repository.mjs` owns its source, toolchain, feature and packaging invariants.
