# Builders

Each builder produces a generic distribution artifact for one upstream project.

- `ffmpeg/` — upstream `fftools/ffmpeg` browser builds (`browser-full`, `browser-full-gpl`) with pthreads, SIMD, generated feature inventory and real-browser testing.
- `libarchive/` — upstream `bsdtar`, `bsdcpio`, `bsdcat` and `bsdunzip` browser build (`browser-full`) with MEMFS, generated build inventory and real ZIP extraction testing.
- `imagemagick/` — upstream ImageMagick `magick` browser CLI (`browser-full`) with a conservative single-threaded delegate set and real PNG → JPEG testing.
- `libvips/` — upstream libvips browser library (`browser-core`, `browser-full`) through a pinned wasm-vips adapter, retaining pthreads/SIMD with real PNG decode → resize → JPEG/WebP testing and automatic profile-size comparison.

Builders prioritize upstream-oriented, reproducible distributions with explicit capability and target metadata.
