# Validation

A releasable profile must pass:

1. exact source/toolchain pin checks;
2. FFmpeg configure assertions including the upstream CLI and pthread backend;
3. WASM magic/factory/gzip validation;
4. generated feature inventory and hashes;
5. actual headless Chromium execution under COOP/COEP;
6. `ffmpeg -version` plus a real MP4 operation; the GPL profile must also execute libx264.
