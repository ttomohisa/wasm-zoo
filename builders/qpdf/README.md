# QPDF browser WASM

QPDF was the first package added through the WASM Zoo v0.17 Package Onboarding Contract and is now configured for its first reviewed GitHub Release.

It compiles the **upstream QPDF 12.4.1 CLI** to browser WebAssembly from the official GitHub Release source archive. The archive SHA-256, the signed release tag's peeled commit and the Emscripten toolchain are pinned independently.

Current status: **available / reviewed release configuration**. The first package tag is `qpdf-v0.1.0`. Creating that tag remains a human maintainer action; npm publication and automatic upstream promotion are still disabled.

## Reviewed pins

- QPDF: 12.4.1 / `v12.4.1`
- exact QPDF commit: `c37f83ae468abb6cc741f43b2f6fdeb66e550ffb`
- official source archive SHA-256: `f045aa277be2356ff53a89a8622945958291177d2483afc20ede7c8a8cd3873c`
- Emscripten: 6.0.8 / exact commit `aeb67926e7de656da38bc807d83050af93578758`
- Zoo builder: 0.1.0

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

A successful build runs a real Chromium smoke test: version, structural validation of a deterministic one-page PDF fixture, linearization, AES-256 encryption/decryption, and final validation. It then emits the normal Zoo provenance and CycloneDX metadata. None of these canary artifacts are published automatically.

## Reviewed release

After this release configuration is merged and reviewed, the maintainer may create the annotated package tag `qpdf-v0.1.0`. The tag-triggered release workflow rebuilds QPDF from the reviewed official source archive, reruns the real Chromium PDF smoke, prepares binary/corresponding-source/provenance/SBOM/checksum assets, and then creates the GitHub Release.

The binary ZIP includes QPDF's license/notice plus the exact zlib and libjpeg license texts copied from the pinned Emscripten port source cache used by the build.

The public QPDF Playground is staged only from that published immutable Release. Until the tag exists, Pages fails closed and does not invent or substitute QPDF runtime assets.
