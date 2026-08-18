# Security

- Generated FFmpeg runs against untrusted media, so upstream security releases should be reviewed promptly.
- Native FFmpeg network protocols are disabled in the current browser profiles.
- `libavdevice` and native hardware backends are disabled/unavailable.
- Full builds require SharedArrayBuffer and cross-origin isolation; deploy with COOP/COEP headers.
- Source/toolchain pins are exact and public release manifests include SHA-256 values.
