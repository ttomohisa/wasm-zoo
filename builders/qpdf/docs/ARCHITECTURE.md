# QPDF experimental browser architecture

The canary preserves the upstream QPDF CLI rather than inventing a PDF-specific JavaScript API.

```text
browser app -> wasm-zoo.mjs -> browser-qpdf.js -> fresh Web Worker + MEMFS -> qpdf-core.js / qpdf-core.wasm
                                                                    |-> upstream QPDF CLI
                                                                    |-> QPDF native crypto
                                                                    |-> Emscripten zlib + libjpeg
```

The official source archive is SHA-256 verified before compilation. The release tag's peeled exact Git commit is checked independently. The first profile is deliberately single-threaded. wasm-native exceptions are enabled because QPDF uses C++ exceptions for error propagation.
