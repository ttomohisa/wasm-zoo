# Architecture

```text
FFmpeg upstream source
       │
       ├─ browser-full ───────────────┐
       │  broad built-in features    │
       │                             ├─ upstream fftools/ffmpeg
       └─ browser-full-gpl ─ x264 ───┘       ↓
                                      Emscripten pthread + SIMD
                                              ↓
                         ffmpeg-core.js / .wasm
                                              ↓
                                  generic browser CLI wrapper
```

The wrapper starts a fresh worker/core instance per `exec()` call, so the public surface remains arbitrary FFmpeg CLI arguments instead of a Zoo-specific operation API.
