ARG EMSDK_VERSION=6.0.7
FROM emscripten/emsdk:${EMSDK_VERSION} AS build

ARG BUILDER_VERSION
ARG EMSDK_VERSION
ARG EMSCRIPTEN_REF
ARG EMSCRIPTEN_COMMIT
ARG LIBVIPS_REF
ARG LIBVIPS_COMMIT
ARG WASM_VIPS_REPOSITORY
ARG WASM_VIPS_COMMIT
ARG WASM_VIPS_VERSION
ARG WASM_VIPS_LIBVIPS_PATCH_REPOSITORY
ARG WASM_VIPS_LIBVIPS_PATCH_COMMIT
ARG WASM_VIPS_EMSCRIPTEN_PATCH_REPOSITORY
ARG WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT
ARG PROFILE=browser-full

RUN apt-get update && apt-get install -y --no-install-recommends \
      autoconf automake build-essential ccache curl git libglib2.0-dev libtool \
      ninja-build patch pipx pkgconf xz-utils ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    pipx install meson
ENV PATH="/root/.local/bin:${PATH}"

# The emsdk image is version-pinned. Verify the compiler version and the exact
# official source ref independently, then reconstruct the wasm-vips
# compatibility patch from immutable Git commits.
RUN set -eux; \
    test "$(emcc -dumpversion)" = "$EMSDK_VERSION"; \
    git init -q /tmp/emscripten-patch; \
    git -C /tmp/emscripten-patch remote add upstream https://github.com/emscripten-core/emscripten.git; \
    git -C /tmp/emscripten-patch remote add fork "$WASM_VIPS_EMSCRIPTEN_PATCH_REPOSITORY"; \
    git -C /tmp/emscripten-patch fetch -q --depth 1 upstream "$EMSCRIPTEN_REF":refs/remotes/upstream/base; \
    test "$(git -C /tmp/emscripten-patch rev-parse refs/remotes/upstream/base)" = "$EMSCRIPTEN_COMMIT"; \
    git -C /tmp/emscripten-patch fetch -q --depth 1 fork "$WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT":refs/remotes/fork/patched; \
    git -C /tmp/emscripten-patch diff --binary refs/remotes/upstream/base refs/remotes/fork/patched > /tmp/emscripten-wasm-vips.patch; \
    test -s /tmp/emscripten-wasm-vips.patch; \
    patch -p1 -d "$EMSDK/upstream/emscripten" < /tmp/emscripten-wasm-vips.patch; \
    emcc --clear-cache; \
    embuilder build sysroot --force; \
    rm -rf /tmp/emscripten-patch /tmp/emscripten-wasm-vips.patch

COPY profiles /builder-profiles
COPY scripts/build-full.sh /usr/local/bin/wasm-zoo-build-libvips
COPY runtime/browser-libvips.js /runtime/browser-libvips.js
COPY tests/fixtures/smoke-input.png /fixture/smoke-input.png
RUN chmod +x /usr/local/bin/wasm-zoo-build-libvips && /usr/local/bin/wasm-zoo-build-libvips

FROM scratch AS export
COPY --from=build /out/ /
