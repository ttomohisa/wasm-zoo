# npm distribution

WASM Zoo v0.12 adds npm as an optional distribution channel on top of the reviewed GitHub Release artifacts. The first canary is the public package `@wasm-zoo/jq@0.9.0`.

## Contract

The npm package is not a second independent build. `scripts/prepare-npm-package.mjs` starts from the immutable binary ZIP declared in `packages/jq/package.json`, then adds the current Consumer API v1 module and a bundler-aware `index.mjs` entry.

`@wasm-zoo/jq` therefore bundles:

- `index.mjs` — npm/bundler entry;
- `wasm-zoo.mjs` — self-hosted Consumer API v1 entry;
- `browser-jq.js`;
- `jq-core.js` and `jq-core.wasm`;
- `manifest.json` and `features.json`;
- the release `provenance.json`, CycloneDX SBOM and BUILDINFO;
- WASM Zoo and upstream license notices.

The npm version matches the package **Zoo builder version**, not the repository-wide WASM Zoo version. The jq canary is `@wasm-zoo/jq@0.9.0`, backed by `jq-v0.9.0` and `jq-browser-full-1.8.2-zoo-0.9.0.zip`.

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

The npm version follows the jq Zoo builder version. When a future reviewed jq promotion bumps the builder version, the promotion PR updates the npm metadata as part of the reviewed change. After the corresponding immutable jq Release exists, run `Package / stage npm canary` in `pack` mode, inspect the artifact, then run it in `stage` mode. The staged package still requires an explicit maintainer approval before it becomes public.

## Canary exit criteria

Before enabling the other five packages, jq should pass all of these:

1. package generation starts from the immutable jq Release;
2. generated tarballs install with the expected Wasm/runtime/metadata/license files;
3. `@wasm-zoo/jq@0.9.0` is publicly installable from npm;
4. Trusted Publisher is configured stage-only and long-lived publish tokens are removed;
5. a production Vite build installs the public npm package, emits its Wasm asset and runs real jq in Chromium;
6. npm provenance remains enabled;
7. package size and install ergonomics are acceptable.

A webpack 5 compatibility fixture remains a useful follow-up before calling bundler compatibility broad rather than Vite-verified; it is not required to preserve the Consumer API v1 contract.
