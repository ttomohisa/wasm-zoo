# Releasing

1. Update one pin at a time in `versions.env`.
2. Build and smoke-test both profiles.
3. Update catalog metadata if the upstream version changed.
4. Push `main` and require CI to pass.
5. Push `ffmpeg-v<BUILDER_VERSION>`.

The tag workflow rebuilds everything and publishes both binary ZIPs, BUILDINFO files, source/build recipe and SHA-256 checksums.
