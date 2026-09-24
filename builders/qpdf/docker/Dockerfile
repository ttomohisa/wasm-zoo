# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.8
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
ENV DEBIAN_FRONTEND=noninteractive EMSDK_VERSION=${EMSDK_VERSION} EMSCRIPTEN_COMMIT=${EMSCRIPTEN_COMMIT}
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git cmake ninja-build pkg-config make gzip zip && rm -rf /var/lib/apt/lists/*
RUN test "$(emcc -dumpversion)" = "$EMSDK_VERSION" && emcc --version | grep -q "$EMSCRIPTEN_COMMIT"
WORKDIR /workspace

FROM toolchain AS source
ARG QPDF_REPOSITORY
ARG QPDF_VERSION
ARG QPDF_REF
ARG QPDF_COMMIT
ARG QPDF_SOURCE_URL
ARG QPDF_SOURCE_SHA256
ENV QPDF_REPOSITORY=${QPDF_REPOSITORY} QPDF_VERSION=${QPDF_VERSION} QPDF_REF=${QPDF_REF} QPDF_COMMIT=${QPDF_COMMIT} QPDF_SOURCE_URL=${QPDF_SOURCE_URL} QPDF_SOURCE_SHA256=${QPDF_SOURCE_SHA256}
COPY scripts/fetch-qpdf.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/fetch-qpdf.sh && /workspace/scripts/fetch-qpdf.sh

FROM toolchain AS build
ARG BUILDER_VERSION
ARG QPDF_REPOSITORY
ARG QPDF_VERSION
ARG QPDF_REF
ARG QPDF_COMMIT
ARG QPDF_SOURCE_URL
ARG QPDF_SOURCE_SHA256
ARG ZLIB_VERSION
ARG ZLIB_SOURCE_URL
ARG ZLIB_SOURCE_SHA512
ARG LIBJPEG_VERSION
ARG LIBJPEG_SOURCE_URL
ARG LIBJPEG_SOURCE_SHA512
ARG PROFILE=browser-full
ENV BUILDER_VERSION=${BUILDER_VERSION} QPDF_REPOSITORY=${QPDF_REPOSITORY} QPDF_VERSION=${QPDF_VERSION} QPDF_REF=${QPDF_REF} QPDF_COMMIT=${QPDF_COMMIT} QPDF_SOURCE_URL=${QPDF_SOURCE_URL} QPDF_SOURCE_SHA256=${QPDF_SOURCE_SHA256} \
    ZLIB_VERSION=${ZLIB_VERSION} ZLIB_SOURCE_URL=${ZLIB_SOURCE_URL} ZLIB_SOURCE_SHA512=${ZLIB_SOURCE_SHA512} \
    LIBJPEG_VERSION=${LIBJPEG_VERSION} LIBJPEG_SOURCE_URL=${LIBJPEG_SOURCE_URL} LIBJPEG_SOURCE_SHA512=${LIBJPEG_SOURCE_SHA512} PROFILE=${PROFILE}
COPY --from=source /src/qpdf /src/qpdf
COPY profiles /workspace/profiles
COPY scripts/build-full.sh scripts/stage-third-party-licenses.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/*.sh && /workspace/scripts/build-full.sh

FROM toolchain AS package
COPY --from=build /out/ /out/
COPY runtime/browser-qpdf.js /out/browser-qpdf.js
COPY runtime/wasm-zoo.mjs /out/wasm-zoo.mjs
COPY tests/smoke-test.html /out/smoke-test.html

FROM scratch AS export
COPY --from=package /out/ /
