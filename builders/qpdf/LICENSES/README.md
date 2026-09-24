# QPDF release license inventory

The reviewed QPDF browser release carries license/notice material for every source family explicitly linked by the Zoo build:

- **QPDF 12.4.1** — `LICENSE.txt` and `NOTICE.md` copied from the SHA-256-verified official QPDF release archive.
- **zlib 1.3.2** — `LICENSE` copied from the exact source archive selected by the pinned Emscripten 6.0.8 port after SHA-512 verification.
- **libjpeg 9f** — upstream `README`/license text copied from the exact source archive selected by the pinned Emscripten 6.0.8 port after SHA-512 verification.

The binary ZIP stores these under `LICENSES/`. The corresponding-source bundle includes the complete Zoo builder recipe and its exact dependency source pins.

Publication is still human-controlled: this inventory does not authorize a tag, GitHub Release, or npm publication on its own.
