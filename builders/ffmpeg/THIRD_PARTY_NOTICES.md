# Third-party notices

WASM Zoo's orchestration/runtime wrapper is MIT-licensed, but generated FFmpeg artifacts retain upstream licenses.

- `browser-full` is intended to remain LGPL-2.1-or-later by avoiding GPL enablement and optional GPL libraries.
- `browser-full-gpl` enables FFmpeg GPL components and links x264, so its generated binary is GPL-2.0-or-later.
- Emscripten-generated runtime code remains subject to the upstream Emscripten/runtime notices.

Exact source refs/commits and applicable license texts are recorded with public releases.
