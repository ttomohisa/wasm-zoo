# QPDF browser WASM

QPDF 12.4.1 is the first package added through the WASM Zoo v0.17 Package Onboarding Contract and the first canary promoted from `experimental` to the reviewed GitHub Release/Playground stage.

The builder compiles the **upstream QPDF 12.4.1 CLI** to browser WebAssembly from the official GitHub Release source archive. The archive SHA-256, signed release tag's peeled commit, Emscripten toolchain and the zlib/libjpeg port source identities are pinned independently.

Current reviewed package release: **qpdf-v0.1.0**. npm publication and automatic upstream promotion remain disabled until separate reviews.

## Reviewed pins

- QPDF: 12.4.1 / `v12.4.1`
- exact QPDF commit: `c37f83ae468abb6cc741f43b2f6fdeb66e550ffb`
- official QPDF source SHA-256: `f045aa277be2356ff53a89a8622945958291177d2483afc20ede7c8a8cd3873c`
- Emscripten: 6.0.8 / `aeb67926e7de656da38bc807d83050af93578758`
- Emscripten zlib port: 1.3.2
- Emscripten libjpeg port: 9f
- Zoo builder: 0.1.0

## Browser profile

`browser-full` preserves QPDF's ordinary CLI argument model and stages files through Emscripten MEMFS. It uses QPDF native crypto, the pinned Emscripten zlib/libjpeg ports, wasm-native exceptions and a fresh single-threaded outer Worker. QPDF itself is not patched.

## Build

```powershell
./scripts/build.ps1 browser-full
```

or:

```bash
./build.sh browser-full
```

A successful build runs a real Chromium smoke test: version, structural validation of a deterministic one-page PDF fixture, linearization, AES-256 encryption/decryption and final validation. Provenance and CycloneDX metadata are generated only after the smoke passes.

## Release

After this release PR is reviewed, merged and main CI is green, the maintainer creates the human-controlled annotated tag `qpdf-v0.1.0`.

The tag-triggered release workflow rebuilds from the reviewed pins, reruns the Chromium smoke, prepares the binary ZIP plus corresponding source, standalone provenance/SBOM and SHA-256 checksums, then creates the GitHub Release. The source bundle includes QPDF, zlib 1.3.2, libjpeg 9f, immutable Emscripten port recipe/header snapshots and the Zoo build recipe.

The release workflow never creates the tag itself and never publishes npm.
