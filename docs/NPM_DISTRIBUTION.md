# npm distribution

WASM Zoo v0.12 adds npm as an optional distribution channel on top of the reviewed GitHub Release artifacts. The first canary is `@wasm-zoo/jq`.

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

The npm version matches the package **Zoo builder version**, not the repository-wide WASM Zoo version. The initial jq canary is therefore `@wasm-zoo/jq@0.9.0`, backed by `jq-v0.9.0` and `jq-browser-full-1.8.2-zoo-0.9.0.zip`.

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

## Local/package-only validation

The repository does not need jq to be rebuilt to validate the npm package contract:

```text
npm run npm:check
```

To prepare a package from an extracted reviewed release ZIP:

```text
node scripts/prepare-npm-package.mjs --slug jq --input <release-directory> --output npm-work/package
npm pack ./npm-work/package
```

## Publishing workflow

`.github/workflows/publish-npm.yml` is manual and has three modes:

- `pack` — download the immutable GitHub Release asset, generate the npm package, run the contract checks and upload the `.tgz` as a GitHub Actions artifact; no registry write occurs;
- `publish` — perform the same checks and then run `npm publish --access public`;
- `stage` — run `npm stage publish` for a new version when the npm package itself **already exists**, so a maintainer can approve that version separately.

Existing GitHub Release ZIPs are never modified.

## First publish / scope bootstrap

Staged publishing cannot create a brand-new npm package. Before the first `@wasm-zoo/jq` publish, the `@wasm-zoo` npm scope must be controlled by the maintainer and the workflow needs publish credentials for the bootstrap publish. Use a short-lived/granular `NPM_TOKEN` repository secret for that first direct publish, then remove it after trusted publishing is configured.

After the package exists, configure its npm **Trusted Publisher** for:

- GitHub owner: `ttomohisa`
- repository: `wasm-zoo`
- workflow filename: `publish-npm.yml`

Allow the workflow action you intend to use (`npm publish`, `npm stage publish`, or both). The workflow already requests `id-token: write`, uses a GitHub-hosted runner and Node 24. When npm Trusted Publishing is active, npm can authenticate with OIDC instead of a long-lived token; public packages published that way receive npm provenance automatically.

## Canary exit criteria

Do not enable the other five packages until jq has passed all of these:

1. `pack` workflow succeeds from the immutable jq Release;
2. the generated tarball contains the expected WASM/runtime/metadata/license files;
3. `npm install @wasm-zoo/jq` works in a small Vite app;
4. the production Vite build runs jq in a browser, not only the dev server;
5. a webpack 5 fixture resolves the same assets;
6. npm provenance/trusted publishing is configured after bootstrap;
7. package size and install ergonomics are acceptable.

After those gates pass, `scripts/prepare-npm-package.mjs` can be extended package-by-package without changing the Consumer API v1 contract.
