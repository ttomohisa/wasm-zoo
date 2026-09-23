# Zstandard browser-full (experimental)

This profile builds the original upstream Zstandard `programs/*.c` CLI
against the reviewed, pinned libzstd static library. It is *not* a JavaScript
reimplementation or a claim of native host filesystem support.

- Profiles: `browser-core` remains unchanged; `browser-full` adds
  the upstream CLI for `.zst` frames and MEMFS file arguments.
- Browser runtime: fresh Worker on each invocation; stage files explicitly,
  pass normal CLI arguments, collect requested outputs. No SharedArrayBuffer.
- Build omissions: pthreads, assembly, legacy-frame decode, and
  optional native gzip/xz/lz4 codec dependencies. Dictionary subcommands
  compile from upstream source but await their own browser fixture.
- Limits: up to 64 MiB staged input and 64 MiB *per* requested output, plus
  an operation timeout. This phase does not provide a streaming JS API.
- Release: **experimental only**; neither the core nor CLI is published to npm
  or a GitHub Release until further reviewed gates complete.
