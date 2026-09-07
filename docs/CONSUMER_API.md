# Consumer API v1

WASM Zoo Consumer API v1 is the additive ESM interface for browser consumers.

The existing `browser-*.js` globals remain supported. Consumer API v1 loads those reviewed runtime wrappers and presents a small, consistent module surface without changing the underlying native/WASM build contract.

## Goals

- one importable `wasm-zoo.mjs` entry point per published browser profile;
- no package manager or bundler required;
- assets are self-hostable and relocatable with `baseUrl`;
- CLI-style packages share `load() -> runtime.exec(args, options)`;
- CLI results share `{ exitCode, stdout, stderr, files }`;
- existing `WasmZoo*` global wrappers stay backward compatible;
- package-specific behavior remains explicit instead of pretending every native project has the same API.

Consumer API v1 does **not** add network access, synthetic stdin, or a universal cancellation primitive. Those capabilities are not consistently available in the existing package runtimes and are intentionally outside this first contract.

## Common module exports

Every `wasm-zoo.mjs` exports:

```js
export const API_VERSION = 1;
export const packageInfo = { /* immutable package/runtime metadata */ };
export function isSupported() { /* browser capability check */ }
export async function load(options = {}) { /* package runtime */ }
```

The default export contains the same four members.

`load()` defaults `baseUrl` to the directory containing `wasm-zoo.mjs`. This is the recommended deployment model: keep the module next to the package's existing `browser-*.js`, core JavaScript and `.wasm` files.

A relocated asset directory can be selected explicitly:

```js
import { load } from "/vendor/jq/wasm-zoo.mjs";

const jq = await load({
  baseUrl: "/vendor/jq/"
});
```

## CLI runtime contract

FFmpeg, libarchive, ImageMagick, Ghostscript and jq expose a CLI runtime:

```js
const runtime = await load(options);

const result = await runtime.exec(args, {
  files,
  dirs,
  outputs,
  collectDirs,
  timeoutMs,
  onLog,
  onStdout,
  onStderr
});

runtime.dispose();
```

Only options supported by the underlying package are meaningful. Consumer API v1 forwards existing filesystem/output/timeout options rather than emulating unsupported behavior.

The normalized result is:

```ts
{
  exitCode: number;
  stdout: string;
  stderr: string;
  files: Array<{ name: string; data: Uint8Array }>;
}
```

For runtimes that historically returned only files and an exit code, `stdout` and `stderr` are collected from their existing log stream. jq already returns the two streams directly, so those values are preserved.

The callback contract is:

```js
{
  onLog({ stream, message }) {}, // stream is stdout or stderr
  onStdout(message) {},
  onStderr(message) {}
}
```

All three callbacks may be used together.

## jq example

```js
import { load } from "./wasm-zoo.mjs";

const jq = await load();
try {
  const result = await jq.exec(["-M", "-c", ".items[] | select(.active)"], {
    files: [
      {
        name: "/input.json",
        data: new TextEncoder().encode('{"items":[{"active":true,"id":1}]}')
      }
    ]
  });
  console.log(result.stdout);
} finally {
  jq.dispose();
}
```

As with the upstream CLI, applications choose the jq arguments and virtual-filesystem paths appropriate for their workflow.

## FFmpeg example

FFmpeg browser profiles require cross-origin isolation and `SharedArrayBuffer`.

```js
import { load } from "./wasm-zoo.mjs";

const ffmpeg = await load({ profile: "browser-full" });
try {
  const result = await ffmpeg.exec(
    ["-hide_banner", "-nostdin", "-y", "-i", "/input.mp4", "-c", "copy", "/output.mp4"],
    {
      files: [{ name: "/input.mp4", data: await file.arrayBuffer() }],
      outputs: ["/output.mp4"],
      onStderr: (message) => console.debug(message)
    }
  );
  const output = result.files.find((entry) => entry.name === "/output.mp4");
} finally {
  ffmpeg.dispose();
}
```

## libarchive tool binding

libarchive contains four upstream CLI programs. Consumer API v1 selects one at load time so that execution still has the common `exec(args, options)` shape.

```js
import { load, TOOLS } from "./wasm-zoo.mjs";

console.log(TOOLS); // bsdtar, bsdcpio, bsdcat, bsdunzip

const tar = await load({ tool: "bsdtar" });
try {
  const result = await tar.exec(["-tf", "/input.zip"], {
    files: [{ name: "/input.zip", data: await file.arrayBuffer() }]
  });
  console.log(result.stdout);
} finally {
  tar.dispose();
}
```

## libvips library runtime

libvips is deliberately **not** converted into a synthetic CLI. Its Consumer API runtime exposes the reviewed wasm-vips Embind library as `runtime.api`.

```js
import { load } from "./wasm-zoo.mjs";

const runtime = await load({ profile: "browser-core" });
try {
  const vips = runtime.api;
  const image = vips.Image.newFromBuffer(new Uint8Array(await file.arrayBuffer()));
  try {
    const resized = image.thumbnailImage(800);
    try {
      const jpeg = resized.writeToBuffer(".jpg");
    } finally {
      resized.delete();
    }
  } finally {
    image.delete();
  }
} finally {
  runtime.dispose();
}
```

`runtime.dispose()` releases the Consumer API reference. Embind objects such as `Image` still have their own lifecycle and must be deleted by the caller.

libvips browser profiles require cross-origin isolation and `SharedArrayBuffer`.

## Browser requirements

| Package | Kind | WebAssembly | Worker | SharedArrayBuffer / COOP+COEP |
| --- | --- | --- | --- | --- |
| FFmpeg | CLI | required | required | required |
| libarchive | CLI | required | required | no |
| ImageMagick | CLI | required | required | no |
| libvips | library | required | required | required |
| Ghostscript | CLI | required | required | no |
| jq | CLI | required | required | no |

`isSupported()` is intentionally a capability check, not a promise that a particular input format or codec is included. Use the package feature/capability metadata for that distinction.

## Distribution and compatibility

Consumer API v1 is an additive distribution layer:

- GitHub Pages staging places the current `wasm-zoo.mjs` beside each currently published profile, even when the immutable historical release ZIP predates Consumer API v1;
- future package release ZIPs include `wasm-zoo.mjs` automatically;
- existing release ZIPs are never rewritten;
- when self-hosting an older already-published release during the transition, copy the matching package's `runtime/wasm-zoo.mjs` beside the extracted assets;
- the existing `browser-*.js` file and `WasmZoo*` global remain supported for applications that already use them.

## npm distribution

Consumer API v1 remains usable without a package manager, but WASM Zoo v0.12 also uses it as the stable interface for optional npm packages. The first canary is `@wasm-zoo/jq`; its default npm entry adds static asset URL references for bundlers while `@wasm-zoo/jq/self-hosted` keeps the normal relocatable `baseUrl` contract.

See [`NPM_DISTRIBUTION.md`](NPM_DISTRIBUTION.md) for package/version mapping, immutable Release handoff, first-publish bootstrap and Trusted Publisher rules.

A future API-breaking consumer change must use a new `API_VERSION`; it must not silently change the v1 contract.
