# Builders

Each builder produces a generic distribution artifact for one upstream project.

- `ffmpeg/` — upstream `fftools/ffmpeg` browser builds (`browser-full`, `browser-full-gpl`) with pthreads, SIMD, generated feature inventory and real-browser testing.
- `libarchive/` — upstream `bsdtar`, `bsdcpio`, `bsdcat` and `bsdunzip` browser build (`browser-full`) with MEMFS, generated build inventory and real ZIP extraction testing.

Builders prioritize upstream-oriented, reproducible distributions with explicit capability and target metadata.
