# Security

WASM Zoo packages execute complex native-origin code in WebAssembly. Treat upstream updates, toolchain changes and enabled parsers/codecs as security-sensitive changes.

For public issues, do not include exploit payloads or private vulnerability details. Report sensitive findings privately through the repository owner's preferred GitHub security reporting channel when enabled.

A dependency update must not bypass the builder's runtime smoke test merely to make the catalog current.
