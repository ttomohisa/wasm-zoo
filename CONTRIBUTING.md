# Contributing

WASM Zoo favors small, inspectable build recipes over broad but untested compatibility claims.

For a new package:

1. add `packages/<slug>/package.json` with `status: planned`;
2. add a builder only when the build can be reproduced from pinned sources;
3. define target/profile boundaries explicitly;
4. add a runtime smoke test that exercises the actual advertised operation;
5. document binary licensing based on the real linked feature set;
6. run `npm run build:site && npm run check`.

Do not publish third-party binaries until license/source obligations are understood and the release workflow can produce the required notices/checksums/source handoff.
