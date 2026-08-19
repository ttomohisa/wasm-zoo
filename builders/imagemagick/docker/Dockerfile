# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.6
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
ENV DEBIAN_FRONTEND=noninteractive     EMSDK_VERSION=${EMSDK_VERSION}     EMSCRIPTEN_COMMIT=${EMSCRIPTEN_COMMIT}     SRC_DIR=/src     BUILD_DIR=/build     OUT_DIR=/out
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked     --mount=type=cache,target=/var/lib/apt/lists,sharing=locked     apt-get update && apt-get install -y --no-install-recommends       git ca-certificates autoconf automake libtool pkg-config make zip &&     rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

FROM toolchain AS source
ARG IMAGEMAGICK_REPOSITORY
ARG IMAGEMAGICK_REF
ARG IMAGEMAGICK_COMMIT
ENV IMAGEMAGICK_REPOSITORY=${IMAGEMAGICK_REPOSITORY}     IMAGEMAGICK_REF=${IMAGEMAGICK_REF}     IMAGEMAGICK_COMMIT=${IMAGEMAGICK_COMMIT}
COPY scripts/fetch-imagemagick.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/fetch-imagemagick.sh && /workspace/scripts/fetch-imagemagick.sh

FROM toolchain AS build
ARG BUILDER_VERSION
ARG IMAGEMAGICK_REPOSITORY
ARG IMAGEMAGICK_REF
ARG IMAGEMAGICK_COMMIT
ARG PROFILE=browser-full
ENV BUILDER_VERSION=${BUILDER_VERSION}     IMAGEMAGICK_REPOSITORY=${IMAGEMAGICK_REPOSITORY}     IMAGEMAGICK_REF=${IMAGEMAGICK_REF}     IMAGEMAGICK_COMMIT=${IMAGEMAGICK_COMMIT}     PROFILE=${PROFILE}
COPY --from=source /src/imagemagick /src/imagemagick
COPY profiles /workspace/profiles
COPY scripts/build-full.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/build-full.sh && /workspace/scripts/build-full.sh

FROM toolchain AS package
ARG PROFILE=browser-full
ENV PROFILE=${PROFILE}
COPY --from=build /out/ /out/
COPY runtime/browser-imagemagick.js /out/browser-imagemagick.js
COPY tests/smoke-test.html /out/smoke-test.html
COPY tests/fixtures/smoke-input.png /out/smoke-input.png

FROM scratch AS export
COPY --from=package /out/ /
