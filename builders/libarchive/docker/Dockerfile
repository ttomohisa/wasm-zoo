# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.6
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
ENV DEBIAN_FRONTEND=noninteractive \
    EMSDK_VERSION=${EMSDK_VERSION} \
    EMSCRIPTEN_COMMIT=${EMSCRIPTEN_COMMIT} \
    SRC_DIR=/src \
    BUILD_DIR=/build \
    OUT_DIR=/out
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates cmake ninja-build pkg-config zip && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

FROM toolchain AS source
ARG LIBARCHIVE_REPOSITORY
ARG LIBARCHIVE_REF
ARG LIBARCHIVE_COMMIT
ENV LIBARCHIVE_REPOSITORY=${LIBARCHIVE_REPOSITORY} \
    LIBARCHIVE_REF=${LIBARCHIVE_REF} \
    LIBARCHIVE_COMMIT=${LIBARCHIVE_COMMIT}
COPY scripts/fetch-libarchive.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/fetch-libarchive.sh && /workspace/scripts/fetch-libarchive.sh

FROM toolchain AS build
ARG BUILDER_VERSION
ARG LIBARCHIVE_REPOSITORY
ARG LIBARCHIVE_REF
ARG LIBARCHIVE_COMMIT
ARG PROFILE=browser-full
ENV BUILDER_VERSION=${BUILDER_VERSION} \
    LIBARCHIVE_REPOSITORY=${LIBARCHIVE_REPOSITORY} \
    LIBARCHIVE_REF=${LIBARCHIVE_REF} \
    LIBARCHIVE_COMMIT=${LIBARCHIVE_COMMIT} \
    PROFILE=${PROFILE}
COPY --from=source /src/libarchive /src/libarchive
COPY profiles /workspace/profiles
COPY scripts/build-full.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/build-full.sh && /workspace/scripts/build-full.sh

FROM toolchain AS package
ARG PROFILE=browser-full
ENV PROFILE=${PROFILE}
COPY --from=build /out/ /out/
COPY runtime/browser-libarchive.js /out/browser-libarchive.js
COPY tests/smoke-test.html /out/smoke-test.html
COPY tests/fixtures/smoke-input.zip /out/smoke-input.zip

FROM scratch AS export
COPY --from=package /out/ /
