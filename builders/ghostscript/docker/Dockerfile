# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.7
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
ENV DEBIAN_FRONTEND=noninteractive \
    EMSDK_VERSION=${EMSDK_VERSION} \
    EMSCRIPTEN_COMMIT=${EMSCRIPTEN_COMMIT}
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils make pkg-config autoconf automake libtool git && \
    rm -rf /var/lib/apt/lists/*
RUN test "$(emcc -dumpversion)" = "$EMSDK_VERSION" && emcc --version | grep -q "$EMSCRIPTEN_COMMIT"
WORKDIR /workspace

FROM toolchain AS source
ARG GHOSTSCRIPT_VERSION
ARG GHOSTSCRIPT_SOURCE_URL
ARG GHOSTSCRIPT_SOURCE_SHA256
ENV GHOSTSCRIPT_VERSION=${GHOSTSCRIPT_VERSION} \
    GHOSTSCRIPT_SOURCE_URL=${GHOSTSCRIPT_SOURCE_URL} \
    GHOSTSCRIPT_SOURCE_SHA256=${GHOSTSCRIPT_SOURCE_SHA256}
COPY scripts/fetch-ghostscript.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/fetch-ghostscript.sh && /workspace/scripts/fetch-ghostscript.sh

FROM toolchain AS build
ARG BUILDER_VERSION
ARG GHOSTSCRIPT_VERSION
ARG GHOSTSCRIPT_REF
ARG GHOSTSCRIPT_COMMIT
ARG GHOSTSCRIPT_SOURCE_SHA256
ARG GHOSTSCRIPT_REPOSITORY
ARG PROFILE=browser-full
ENV BUILDER_VERSION=${BUILDER_VERSION} \
    GHOSTSCRIPT_VERSION=${GHOSTSCRIPT_VERSION} \
    GHOSTSCRIPT_REF=${GHOSTSCRIPT_REF} \
    GHOSTSCRIPT_COMMIT=${GHOSTSCRIPT_COMMIT} \
    GHOSTSCRIPT_SOURCE_SHA256=${GHOSTSCRIPT_SOURCE_SHA256} \
    GHOSTSCRIPT_REPOSITORY=${GHOSTSCRIPT_REPOSITORY} \
    PROFILE=${PROFILE}
COPY --from=source /src/ghostscript /src/ghostscript
COPY --from=source /src/source /src/source
COPY profiles /workspace/profiles
COPY scripts/build-full.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/build-full.sh && /workspace/scripts/build-full.sh

FROM toolchain AS package
COPY --from=build /out/ /out/
COPY --from=source /src/source/ /out/source/
COPY runtime/browser-ghostscript.js /out/browser-ghostscript.js
COPY tests/smoke-test.html /out/smoke-test.html
COPY tests/fixtures/smoke-input.pdf /out/smoke-input.pdf

FROM scratch AS export
COPY --from=package /out/ /
