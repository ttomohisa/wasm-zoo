# Using Zoo FFmpeg builds

Host the three Emscripten core files and `browser-ffmpeg.js` on the same origin. Serve the page with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Then call `WasmZooFFmpeg.loadHosted()` and pass ordinary FFmpeg CLI arguments to `exec()`.

Zoo full builds are intentionally large. For single-purpose/offline Browser Kitty tools, use a separate specialized FFmpeg builder instead of embedding the Zoo full core.
