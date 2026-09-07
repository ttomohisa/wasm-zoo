# npm distribution

WASM Zoo v0.12 adds npm as an optional distribution channel on top of the reviewed GitHub Release artifacts. The first canary started at `@wasm-zoo/jq@0.9.0`; the first npm-only packaging fix is `@wasm-zoo/jq@0.9.1`.

## Contract

The npm package is not a second independent native/Wasm build. `scripts/prepare-npm-package.mjs` starts from the immutable binary ZIP declared in `packages/jq/package.json`, keeps its core JavaScript/Wasm, manifests and supply-chain metadata, then overlays the current reviewed `browser-jq.js`, Consumer API v1 module and bundler-aware `index.mjs` entry. The wrapper overlay matches the GitHub Pages distribution model and lets packaging fixes evolve without rewriting historical Release assets.

`@wasm-zoo/jq` therefore bundles:

- `index.mjs` — npm/bundler entry;
- `wasm-zoo.mjs` — self-hosted Consumer API v1 entry;
- `browser-jq.js`;
- `jq-core.js` and `jq-core.wasm`;
- `manifest.json` and `features.json`;
- the release `provenance.json`, CycloneDX SBOM and BUILDINFO;
- WASM Zoo and upstream license notices.

The npm package now has an **independent distribution version**. `@wasm-zoo/jq@0.9.1` is still backed by jq 1.8.2, Zoo builder 0.9.0, `jq-v0.9.0`, and `jq-browser-full-1.8.2-zoo-0.9.0.zip`. This separation allows npm-only wrapper/packaging fixes without pretending that the native/Wasm build or immutable GitHub Release changed.

## Consumer usage

```bash
npm install @wasm-zoo/jq
```

```js
import { load } from "@wasm-zoo/jq";

const jq = await load();
try {
  const result = await jq.exec(["-M", "-c", ".", "/input.json"], {
    files: [{
      name: "/input.json",
      data: new TextEncoder().encode('{"hello":"world"}')
    }]
  });
  console.log(result.stdout);
} finally {
  jq.dispose();
}
```

The default npm entry statically references `jq-core.js` and `jq-core.wasm` with `new URL(..., import.meta.url)` and forwards the emitted URLs into Consumer API v1. This is intended for modern bundlers such as Vite and webpack 5.

For manual/self-hosted deployments, import `@wasm-zoo/jq/self-hosted` and use the normal Consumer API `baseUrl` contract instead.

## Package and live-registry validation

The repository can validate tarball construction without rebuilding jq:

```text
npm run npm:check
```

The contract check creates a real `.tgz`, installs that tarball into a temporary project, and verifies the runtime, Wasm, metadata and license files under `node_modules/@wasm-zoo/jq`.

The published package has a separate live-registry smoke test:

```text
npm run npm:smoke:jq
```

`scripts/smoke-npm-jq.mjs` creates a clean application, installs the exact `@wasm-zoo/jq` version declared by repository metadata from the public npm registry, installs pinned Vite and Playwright versions, performs a production `vite build`, verifies that a Wasm asset was emitted, serves the production output, opens it in Chromium, and executes a real jq JSON transformation. `.github/workflows/npm-jq-smoke.yml` exposes that test manually and also runs it weekly.

## Publishing workflow after bootstrap

The first-package bootstrap is complete: `@wasm-zoo/jq@0.9.0` has been published, npm Trusted Publisher is configured for `ttomohisa/wasm-zoo` / `publish-npm.yml`, and the temporary long-lived npm publish token has been removed.

`.github/workflows/publish-npm.yml` is now intentionally **stage-only** for registry writes. It has two modes:

- `pack` — download the immutable GitHub Release asset, generate the npm package, run contract checks and upload the `.tgz` as a GitHub Actions artifact; no registry write occurs;
- `stage` — authenticate through the npm Trusted Publisher OIDC relationship and run `npm stage publish`; the package is not public until a maintainer reviews it and approves it with 2FA on npmjs.com or with `npm stage approve`.

There is no direct `npm publish` path and no `NPM_TOKEN`/`NODE_AUTH_TOKEN` dependency in the workflow. The workflow retains `id-token: write` because npm Trusted Publishing requires an OIDC token from the GitHub-hosted runner.

For maximum security, the npm package publishing-access setting should require 2FA and disallow traditional tokens, while the Trusted Publisher permission should allow `npm stage publish` but not direct `npm publish`.

Existing GitHub Release ZIPs are never modified.

## Promotion interaction

The npm version is independent from the jq Zoo builder version. A wrapper/package-only correction bumps only `npm.version`; the immutable Release and `zoo.builderVersion` remain unchanged. When a future reviewed jq promotion bumps the builder version, the promotion PR also patch-bumps the current npm distribution version independently. After the corresponding immutable jq Release exists, run `Package / stage npm canary` in `pack` mode, inspect the artifact, then run it in `stage` mode. The staged package still requires an explicit maintainer approval before it becomes public.

## npm 0.9.0 packaging correction

The initial `@wasm-zoo/jq@0.9.0` package correctly caused Vite to emit hashed `jq-core` JavaScript/Wasm assets, but it copied the historical `browser-jq.js` from the immutable Release. That older wrapper did not honor the explicit emitted asset URLs passed by Consumer API v1, so production execution attempted the non-hashed `/assets/jq-core.js`. `0.9.1` fixes only the npm distribution layer by overlaying the current reviewed wrapper; the jq 1.8.2 Wasm binary and its source Release remain unchanged.

## Canary exit criteria

Before enabling the other five packages, jq should pass all of these:

1. package generation starts from the immutable jq Release;
2. generated tarballs install with the expected Wasm/runtime/metadata/license files;
3. the current `@wasm-zoo/jq` npm distribution is publicly installable from npm;
4. Trusted Publisher is configured stage-only and long-lived publish tokens are removed;
5. a production Vite build installs the public npm package, emits its Wasm asset and runs real jq in Chromium;
6. npm provenance remains enabled;
7. package size and install ergonomics are acceptable.

A webpack 5 compatibility fixture remains a useful follow-up before calling bundler compatibility broad rather than Vite-verified; it is not required to preserve the Consumer API v1 contract.
