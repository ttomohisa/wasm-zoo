# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.7
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
RUN test "$(emcc -dumpversion)" = "$EMSDK_VERSION" && emcc --version | grep -q "$EMSCRIPTEN_COMMIT"
WORKDIR /workspace
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates git make gzip && rm -rf /var/lib/apt/lists/*

FROM toolchain AS source
ARG ZSTD_REPOSITORY
ARG ZSTD_REF
ARG ZSTD_COMMIT
ENV ZSTD_REPOSITORY=${ZSTD_REPOSITORY} ZSTD_REF=${ZSTD_REF} ZSTD_COMMIT=${ZSTD_COMMIT}
COPY scripts/fetch-zstd.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/fetch-zstd.sh && /workspace/scripts/fetch-zstd.sh

FROM toolchain AS build
ARG BUILDER_VERSION
ARG ZSTD_REF
ARG ZSTD_COMMIT
ARG ZSTD_REPOSITORY
ARG PROFILE=browser-core
ENV BUILDER_VERSION=${BUILDER_VERSION} ZSTD_REF=${ZSTD_REF} ZSTD_COMMIT=${ZSTD_COMMIT} ZSTD_REPOSITORY=${ZSTD_REPOSITORY} PROFILE=${PROFILE}
COPY --from=source /src/zstd /src/zstd
COPY profiles /workspace/profiles
COPY scripts/zstd-wasm.c scripts/build-core.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/build-core.sh && /workspace/scripts/build-core.sh

FROM toolchain AS package
COPY --from=build /out/ /out/
COPY runtime/browser-zstd.js runtime/browser-zstd-worker.js runtime/wasm-zoo.mjs /out/
COPY tests/smoke-test.html /out/smoke-test.html

FROM scratch AS export
COPY --from=package /out/ /
