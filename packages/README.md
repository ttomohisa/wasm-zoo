# Package catalog sources

Every `packages/<slug>/package.json` is human-reviewed metadata used to generate `site/catalog.json`.

Do not set `status` to `available` merely because an upstream project can theoretically compile to WASM. `available` means the Zoo repository contains a reproducible build path and a meaningful runtime test for at least one published profile.

Planned packages should keep `upstream.version` as `null` until a concrete Zoo build is pinned and tested.
