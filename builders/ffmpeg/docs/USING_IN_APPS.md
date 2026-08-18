# Using Zoo FFmpeg builds

Host `ffmpeg-core.js`, `ffmpeg-core.wasm` and `browser-ffmpeg.js` on the same origin. Serve the page with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Then call `WasmZooFFmpeg.loadHosted()` and pass ordinary FFmpeg CLI arguments to `exec()`.

Zoo full builds prioritize broad capability and upstream CLI compatibility. Plan for a comparatively large download and memory footprint, and set codec/filter thread counts explicitly for thread-heavy workloads.
