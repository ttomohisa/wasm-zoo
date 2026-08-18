# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.6
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
ENV DEBIAN_FRONTEND=noninteractive \
    EMSDK_VERSION=${EMSDK_VERSION} \
    EMSCRIPTEN_COMMIT=${EMSCRIPTEN_COMMIT} \
    INSTALL_DIR=/opt/wasm-zoo \
    SRC_DIR=/src \
    OUT_DIR=/out
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates pkg-config make autoconf automake libtool && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

FROM toolchain AS ffmpeg-source
ARG FFMPEG_REPOSITORY
ARG FFMPEG_REF
ARG FFMPEG_COMMIT
ENV FFMPEG_REPOSITORY=${FFMPEG_REPOSITORY} FFMPEG_REF=${FFMPEG_REF} FFMPEG_COMMIT=${FFMPEG_COMMIT}
COPY scripts/docker-common.sh scripts/fetch-ffmpeg.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/*.sh && /workspace/scripts/fetch-ffmpeg.sh

FROM toolchain AS x264-builder
ARG BUILDER_VERSION
ARG X264_REPOSITORY
ARG X264_FALLBACK_REPOSITORY
ARG X264_REF
ARG X264_COMMIT
ENV BUILDER_VERSION=${BUILDER_VERSION} \
    X264_REPOSITORY=${X264_REPOSITORY} X264_FALLBACK_REPOSITORY=${X264_FALLBACK_REPOSITORY} \
    X264_REF=${X264_REF} X264_COMMIT=${X264_COMMIT}
COPY scripts/docker-common.sh scripts/build-x264.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/*.sh && /workspace/scripts/build-x264.sh

FROM toolchain AS full-common
ARG BUILDER_VERSION
ARG FFMPEG_REPOSITORY
ARG FFMPEG_REF
ARG FFMPEG_COMMIT
ARG X264_REPOSITORY
ARG X264_FALLBACK_REPOSITORY
ARG X264_REF
ARG X264_COMMIT
ARG PROFILE=browser-full
ENV BUILDER_VERSION=${BUILDER_VERSION} \
    FFMPEG_REPOSITORY=${FFMPEG_REPOSITORY} FFMPEG_REF=${FFMPEG_REF} FFMPEG_COMMIT=${FFMPEG_COMMIT} \
    X264_REPOSITORY=${X264_REPOSITORY} X264_FALLBACK_REPOSITORY=${X264_FALLBACK_REPOSITORY} \
    X264_REF=${X264_REF} X264_COMMIT=${X264_COMMIT} PROFILE=${PROFILE}
COPY --from=ffmpeg-source /src/ffmpeg /src/ffmpeg
COPY profiles /workspace/profiles
COPY scripts/docker-common.sh scripts/build-full.sh /workspace/scripts/

FROM full-common AS full-no-x264
RUN chmod +x /workspace/scripts/*.sh && /workspace/scripts/build-full.sh

FROM full-common AS full-with-x264
COPY --from=x264-builder /opt/wasm-zoo /opt/wasm-zoo
RUN chmod +x /workspace/scripts/*.sh && /workspace/scripts/build-full.sh

FROM toolchain AS package-no-x264
ARG PROFILE=browser-full
ENV PROFILE=${PROFILE} OUT_DIR=/out
COPY --from=full-no-x264 /out/ /out/
COPY runtime/browser-ffmpeg.js /out/browser-ffmpeg.js
COPY tests/smoke-test.html /out/smoke-test.html
COPY tests/fixtures/smoke-input.mp4 /out/smoke-input.mp4

FROM toolchain AS package-with-x264
ARG PROFILE=browser-full-gpl
ENV PROFILE=${PROFILE} OUT_DIR=/out
COPY --from=full-with-x264 /out/ /out/
COPY runtime/browser-ffmpeg.js /out/browser-ffmpeg.js
COPY tests/smoke-test.html /out/smoke-test.html
COPY tests/fixtures/smoke-input.mp4 /out/smoke-input.mp4

FROM scratch AS export-no-x264
COPY --from=package-no-x264 /out/ /

FROM scratch AS export-with-x264
COPY --from=package-with-x264 /out/ /
