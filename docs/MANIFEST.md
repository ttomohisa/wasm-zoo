# Package and build manifests

WASM Zoo has two metadata layers.

## Catalog metadata

`packages/<slug>/package.json` is human-reviewed metadata: upstream pin, Zoo status, distributed profiles and a curated native→WASM capability gap.

`status=available` means a concrete build recipe exists and its runtime smoke test passes. Planned packages may track upstream without pretending a binary exists.

## Generated artifact metadata

Each builder emits a machine-generated `manifest.json` beside the WASM files. A generic/full build should record:

- exact upstream ref + commit;
- exact toolchain version + commit;
- upstream frontend/API shape used by the artifact;
- threading, SIMD, SharedArrayBuffer/cross-origin-isolation requirements;
- external libraries actually linked;
- known target gaps;
- exact byte sizes and SHA-256 hashes.

For FFmpeg, a release additionally carries:

- `features.json` generated from the actual configure result;
- `ffmpeg-config.mak` for exact low-level feature diffing;
- `BUILDINFO.txt`;
- applicable license notices;
- corresponding source/build recipe;
- `SHA256SUMS.txt`.

The catalog must never claim “full” means every feature of every native build. The target gaps are part of the artifact identity.
