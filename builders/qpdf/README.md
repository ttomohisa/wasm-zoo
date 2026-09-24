# QPDF browser WASM

QPDF is the first package added through the WASM Zoo v0.17 Package Onboarding Contract.

It compiles the **upstream QPDF 12.4.1 CLI** to browser WebAssembly from the official GitHub Release source archive. The archive SHA-256, the signed release tag's peeled commit and the Emscripten toolchain are pinned independently.

Current status: **available after the reviewed `qpdf-v0.1.0` package release is published**. The repository includes a release workflow and Playground staging, while npm and automatic upstream promotion remain disabled pending separate reviews.

## Reviewed pins

- QPDF: 12.4.1 / `v12.4.1`
- exact QPDF commit: `c37f83ae468abb6cc741f43b2f6fdeb66e550ffb`
- official source archive SHA-256: `f045aa277be2356ff53a89a8622945958291177d2483afc20ede7c8a8cd3873c`
- Emscripten: 6.0.8 / exact commit `aeb67926e7de656da38bc807d83050af93578758`
- Zoo builder: 0.1.0
- Emscripten port zlib: 1.3.2, pinned source SHA-512
- Emscripten port libjpeg: 9f, pinned source SHA-512

## Browser profile

`browser-full` keeps QPDF's ordinary CLI argument model and stages files through Emscripten MEMFS. The build uses QPDF native crypto, Emscripten zlib/libjpeg ports, wasm-native exceptions, and a fresh single-threaded outer Worker. The QPDF source tree is not patched.

## Build

```powershell
./scripts/build.ps1 browser-full
```

or:

```bash
./build.sh browser-full
```

A successful build runs a real Chromium smoke test: version, structural validation of a deterministic one-page PDF fixture, linearization, AES-256 encryption/decryption, and final validation. It then emits the normal Zoo provenance and CycloneDX metadata. Package publication remains human-triggered: only a reviewed `qpdf-v0.1.0` tag starts the release workflow. The Release workflow publishes binary/source/provenance/SBOM/checksum assets and then asks Pages to stage the published artifact for the Playground.
