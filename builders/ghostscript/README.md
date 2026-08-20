# Ghostscript builder

WASM Zoo builds the upstream **Ghostscript `gs` CLI 10.07.1** as a browser WebAssembly distribution.

## Profile

`browser-full` keeps the PostScript/PDF interpreter and the `BMP,JPEG,PNG,PS,TIFF` output-driver groups. It is deliberately single-threaded and runs each command in an isolated Web Worker with Emscripten MEMFS.

Desktop integrations such as CUPS, D-Bus, GTK, X11, fontconfig, libpaper, libidn, pdftoraster and IJS are intentionally excluded. GhostPCL and GhostXPS are separate interpreters in the GhostPDL tree and are not part of this Ghostscript package.

## Build

Windows:

```text
build-ghostscript.bat browser-full
```

Linux/macOS:

```text
./builders/ghostscript/build.sh browser-full
```

A successful build ends with:

```text
[OK] Browser smoke test: SMOKE_TEST_PASS_Ghostscript_10.07.1_PDF_to_PNG_and_PS_to_PDF
[OK] Ghostscript browser-full build + browser smoke test passed
```

The smoke test performs both a real PDF → PNG render and a PostScript → PDF (`pdfwrite`) conversion in Chromium.

## Source and licensing

Ghostscript is AGPL-3.0-or-later (with commercial licensing available separately from Artifex). The binary release therefore records the Ghostscript license prominently, and the source release bundles the exact official `ghostscript-10.07.1.tar.xz` archive plus the Zoo build recipe. The binary archive also carries a conservative `THIRD-PARTY-LICENSES/` inventory collected from the exact source tree. The official archive SHA-256 is pinned in `versions.env`.
