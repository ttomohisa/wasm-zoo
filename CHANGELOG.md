# Changelog

## Unreleased

- add a `Use in your app` section to every published package detail with required runtime files, a copyable minimal integration example and package-specific hosting/runtime notes;

## v0.4.0

- keep ImageMagick browser-full single-threaded while linking the final Wasm module at `-O1` with Emscripten function-pointer cast emulation and a 4 MiB WebAssembly stack, avoiding the Emscripten 6.0.6 O2+ Binaryen fpcast crash and the default-stack overflow;

- make the ImageMagick browser-full runtime consistently single-threaded at configure, compile and final-link time; use the standard libpng port and avoid SharedArrayBuffer/cross-origin-isolation requirements;

- fix ImageMagick browser smoke-test script escaping and add pre-build JavaScript syntax checks;

- add ImageMagick 7.1.2-29 as an available package;
- add `builders/imagemagick` with browser-full build, Chromium smoke test, release preparation and repository checks;
- add ImageMagick Playground to GitHub Pages;
- stage published ImageMagick releases into Pages/local preview;
- update catalog, README and validation logic for the third published package.
