# syntax=docker/dockerfile:1.7
ARG EMSDK_VERSION=6.0.7
FROM emscripten/emsdk:${EMSDK_VERSION} AS toolchain
ARG EMSDK_VERSION
ARG EMSCRIPTEN_COMMIT
ENV DEBIAN_FRONTEND=noninteractive EMSDK_VERSION=${EMSDK_VERSION} EMSCRIPTEN_COMMIT=${EMSCRIPTEN_COMMIT}
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git autoconf automake libtool pkg-config make gzip && \
    rm -rf /var/lib/apt/lists/*
RUN test "$(emcc -dumpversion)" = "$EMSDK_VERSION" && emcc --version | grep -q "$EMSCRIPTEN_COMMIT"
WORKDIR /workspace

FROM toolchain AS source
ARG JQ_REPOSITORY
ARG JQ_REF
ARG JQ_COMMIT
ARG ONIGURUMA_REPOSITORY
ARG ONIGURUMA_VERSION
ARG ONIGURUMA_COMMIT
ENV JQ_REPOSITORY=${JQ_REPOSITORY} JQ_REF=${JQ_REF} JQ_COMMIT=${JQ_COMMIT} \
    ONIGURUMA_REPOSITORY=${ONIGURUMA_REPOSITORY} ONIGURUMA_VERSION=${ONIGURUMA_VERSION} ONIGURUMA_COMMIT=${ONIGURUMA_COMMIT}
COPY scripts/fetch-jq.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/fetch-jq.sh && /workspace/scripts/fetch-jq.sh

FROM toolchain AS build
ARG BUILDER_VERSION
ARG JQ_REPOSITORY
ARG JQ_REF
ARG JQ_COMMIT
ARG ONIGURUMA_REPOSITORY
ARG ONIGURUMA_VERSION
ARG ONIGURUMA_COMMIT
ARG PROFILE=browser-full
ENV BUILDER_VERSION=${BUILDER_VERSION} JQ_REPOSITORY=${JQ_REPOSITORY} JQ_REF=${JQ_REF} JQ_COMMIT=${JQ_COMMIT} \
    ONIGURUMA_REPOSITORY=${ONIGURUMA_REPOSITORY} ONIGURUMA_VERSION=${ONIGURUMA_VERSION} ONIGURUMA_COMMIT=${ONIGURUMA_COMMIT} PROFILE=${PROFILE}
COPY --from=source /src/jq /src/jq
COPY profiles /workspace/profiles
COPY scripts/build-full.sh /workspace/scripts/
RUN chmod +x /workspace/scripts/build-full.sh && /workspace/scripts/build-full.sh

FROM toolchain AS package
COPY --from=build /out/ /out/
COPY runtime/browser-jq.js /out/browser-jq.js
COPY tests/smoke-test.html /out/smoke-test.html
COPY tests/fixtures/smoke-input.json /out/smoke-input.json

FROM scratch AS export
COPY --from=package /out/ /
