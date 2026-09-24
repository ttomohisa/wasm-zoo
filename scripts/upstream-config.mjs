export const automaticCandidateConfigs = {
  ffmpeg: {
    dir: "ffmpeg",
    refKey: "FFMPEG_REF",
    commitKey: "FFMPEG_COMMIT",
    buildWorkflow: "build-ffmpeg.yml",
    displayName: "FFmpeg"
  },
  libarchive: {
    dir: "libarchive",
    refKey: "LIBARCHIVE_REF",
    commitKey: "LIBARCHIVE_COMMIT",
    buildWorkflow: "build-libarchive.yml",
    displayName: "libarchive"
  },
  imagemagick: {
    dir: "imagemagick",
    refKey: "IMAGEMAGICK_REF",
    commitKey: "IMAGEMAGICK_COMMIT",
    buildWorkflow: "build-imagemagick.yml",
    displayName: "ImageMagick"
  },
  libvips: {
    dir: "libvips",
    refKey: "LIBVIPS_REF",
    commitKey: "LIBVIPS_COMMIT",
    buildWorkflow: "build-libvips.yml",
    displayName: "libvips",
    extraEnv: {
      "emsdk-version": "EMSDK_VERSION",
      "emscripten-ref": "EMSCRIPTEN_REF",
      "emscripten-commit": "EMSCRIPTEN_COMMIT",
      "wasm-vips-commit": "WASM_VIPS_COMMIT",
      "wasm-vips-version": "WASM_VIPS_VERSION",
      "libvips-patch-commit": "WASM_VIPS_LIBVIPS_PATCH_COMMIT",
      "emscripten-patch-commit": "WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT"
    }
  },
  ghostscript: {
    dir: "ghostscript",
    refKey: "GHOSTSCRIPT_REF",
    commitKey: "GHOSTSCRIPT_COMMIT",
    buildWorkflow: "build-ghostscript.yml",
    displayName: "Ghostscript",
    extraEnv: {
      version: "GHOSTSCRIPT_VERSION",
      "release-tag": "GHOSTSCRIPT_RELEASE_TAG",
      "source-url": "GHOSTSCRIPT_SOURCE_URL",
      "source-sha256": "GHOSTSCRIPT_SOURCE_SHA256"
    }
  },
  zstd: {
    dir: "zstd",
    refKey: "ZSTD_REF",
    commitKey: "ZSTD_COMMIT",
    buildWorkflow: "build-zstd.yml",
    displayName: "Zstandard",
    keepNpmPinned: true
  },
  jq: {
    dir: "jq",
    refKey: "JQ_REF",
    commitKey: "JQ_COMMIT",
    buildWorkflow: "build-jq.yml",
    displayName: "jq",
    submodule: {
      repository: "jqlang/jq",
      path: "vendor/oniguruma",
      commitKey: "ONIGURUMA_COMMIT"
    }
  }
};

export const automaticCandidateSlugs = Object.freeze(Object.keys(automaticCandidateConfigs));

export function automaticCandidateConfig(slug) {
  return automaticCandidateConfigs[slug] || null;
}
