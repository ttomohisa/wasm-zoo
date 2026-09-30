# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.8
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
ENV DEBIAN_FRONTEND=noninteractive EMSDK_VERSION=${EMSDK_VERSION} EMSCRIPTEN_COMMIT=${EMSCRIPTEN_COMMIT}
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates git cmake ninja-build gzip zip && \
    rm -rf /var/lib/apt/lists/*
RUN test "$(emcc -dumpversion)" = "$EMSDK_VERSION" && emcc --version | grep -q "$EMSCRIPTEN_COMMIT"
WORKDIR /workspace

FROM toolchain AS source
ARG BROTLI_REPOSITORY
ARG BROTLI_VERSION
ARG BROTLI_REF
ARG BROTLI_COMMIT
ENV BROTLI_REPOSITORY=${BROTLI_REPOSITORY} BROTLI_VERSION=${BROTLI_VERSION} BROTLI_REF=${BROTLI_REF} BROTLI_COMMIT=${BROTLI_COMMIT}
COPY scripts/fetch-brotli.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/fetch-brotli.sh && /workspace/scripts/fetch-brotli.sh

FROM toolchain AS build
ARG BUILDER_VERSION
ARG BROTLI_REPOSITORY
ARG BROTLI_VERSION
ARG BROTLI_REF
ARG BROTLI_COMMIT
ARG PROFILE=browser-full
ENV BUILDER_VERSION=${BUILDER_VERSION} BROTLI_REPOSITORY=${BROTLI_REPOSITORY} BROTLI_VERSION=${BROTLI_VERSION} BROTLI_REF=${BROTLI_REF} BROTLI_COMMIT=${BROTLI_COMMIT} PROFILE=${PROFILE}
COPY --from=source /src/brotli /src/brotli
COPY profiles /workspace/profiles
COPY scripts/build-full.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/build-full.sh && /workspace/scripts/build-full.sh

FROM toolchain AS package
COPY --from=build /out/ /out/
COPY runtime/browser-brotli.js /out/browser-brotli.js
COPY tests/smoke-test.html /out/smoke-test.html

FROM scratch AS export
COPY --from=package /out/ /
