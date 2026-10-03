# Changelog

## Unreleased

- reduce GitHub Actions waste by impact-scoping the heavyweight Registry/browser/build workflows, keeping the full 27-cell Lab as reviewed-main evidence for project `VERSION` changes while skipping it for release-documentation/project-metadata-only pull requests, preventing generated catalog/status files from rebuilding Brotli/QPDF, avoiding duplicate Pages deployment before Lab completion, and cancelling stale heavy pull-request runs when a newer commit arrives;

## v0.19.0

- publish the separately reviewed `@wasm-zoo/brotli@0.1.0` npm distribution from immutable `brotli-v0.1.0/browser-full` after the exact canary tarball passed Vite Chromium/Firefox/WebKit quality-11 compress/integrity/decompress operations, recording Registry `dist.shasum` `6d66df90e8d472e5f2e24e1c1c1ec547ea6923a7` and expanding the manifest-derived Registry Lab from 24 to 27 operation cells; the initial local publish does not claim npm Registry-generated provenance, while the bundled reviewed CI provenance/SBOM remain intact;

- enable Brotli stable-release automatic candidates after the reviewed `brotli-v0.1.0` package release: resolve each Google Brotli Release tag to an exact commit, substitute version/ref/commit together, run the patch-zero upstream CLI Chromium round-trip gate, and allow success to create only a review-only promotion PR while merge/tag/Release/npm remain human-controlled;

- promote Brotli 1.2.0 from the patch-zero experimental feasibility gate to the ninth available package, adding a human-tag-triggered `brotli-v0.1.0` GitHub Release workflow, checksum-verified published-only Playground, local preview stager and Release Health pending state while keeping npm and automatic upstream candidates as separate reviews;

- add Google Brotli 1.2.0 as the ninth package feasibility builder, compiling the exact upstream CMake `brotli` executable target at commit `028fb5a23661f123017c060daa546b55cf4bde29` with zero Brotli source patches and gating it on a real Chromium quality-11 compression, integrity-test and byte-identical decompression round trip;

- repair upstream candidate/promotion Issue reporting by granting the candidate `report` job `issues: write` and escaping Markdown backticks inside unquoted shell heredocs, preventing `auto: command not found`, `Resource not accessible by integration`, and stripped workflow names in watcher comments; add static automation-contract guards for both failure modes;

- make the threaded Cross-browser aggregate consume the exact resolver-selected threaded matrix for each run, preventing prepublication npm PR deferrals from being misreported as missing libvips browser artifacts while keeping main/scheduled/manual runs complete and fail-closed;

- publish the separately reviewed `@wasm-zoo/libvips@0.5.3` npm distribution from immutable `libvips-v0.5.3` / libvips 8.18.7 through Trusted Publisher staged review, keeping the Registry package on `browser-core`, binding its source identity to builder 0.5.3 and exact upstream commit `24ad4d042940e6bf99a68871ba886ca8847c9c82`, and recording Registry `dist.shasum` `f1561fbfae5c7b5d75aba19881bd2d5f4706111a`;

- align the generic Registry/Vite smoke with npm-only pull-request staging: PR runs choose their deterministic baseline only from exact Registry-ready versions, while scheduled and manual Registry smokes keep the reviewed published-version requirement without prepublication deferral;

- publish the separately reviewed `@wasm-zoo/imagemagick@0.4.4` npm distribution from immutable `imagemagick-v0.4.4` / ImageMagick 7.1.2-32 through Trusted Publisher staged review, binding the source identity to builder 0.4.4 and exact commit `ad98b244c995d2e3051757fa3b7855f45b550d24` and recording Registry `dist.shasum` `a4dcbc9948eecf9e409d0e0c9fbd4a10463cd3e4`;

- make Cross-browser Lab pull-request matrices Registry-aware for separately reviewed npm-only updates: exact-version npm 404s are deferred until Trusted Publisher approval, while all other Registry failures remain fail-closed and main/scheduled/manual runs still require the complete reviewed package set;

- publish the separately reviewed `@wasm-zoo/qpdf@0.1.1` npm distribution from immutable `qpdf-v0.1.1` / QPDF 12.4.2 through Trusted Publisher staged review, binding builder 0.1.1 and exact commit `4eba95899886e851cc41d76886483b347612f2a8` and recording Registry `dist.shasum` `53714e9a98edca7fbe775b5028adde7719e86625`;

- promote libvips 8.18.7 to builder 0.5.3 after the isolated upstream candidate build and browser smoke test passed, moving the reviewed source pin to exact commit `24ad4d042940e6bf99a68871ba886ca8847c9c82`;
