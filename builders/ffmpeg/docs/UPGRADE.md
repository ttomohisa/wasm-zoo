# Upgrading FFmpeg or Emscripten

Upgrade one pin at a time. The first checks are `CONFIG_FFMPEG=yes`, `HAVE_PTHREADS=yes`, `HAVE_THREADS=yes`, required profile configs, Emscripten linker settings, generated `features.json`, and the real Chromium smoke test.

When upstream changes the available software feature set, keep the generated inventory as the source of truth rather than preserving stale hand-maintained claims.
