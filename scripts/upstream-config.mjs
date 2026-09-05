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

export function automaticCandidateConfig(slug) {
  return automaticCandidateConfigs[slug] || null;
}
