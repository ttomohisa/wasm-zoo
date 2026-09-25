import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPromotionHumanHandoff } from "./promotion-human-handoff.mjs";

function pkg(overrides = {}) {
  return {
    slug: "ffmpeg",
    name: "FFmpeg",
    status: "available",
    upstream: { version: "9.1.0" },
    zoo: { builderVersion: "0.2.9" },
    release: { tag: "ffmpeg-v0.2.9" },
    tracker: { candidateMode: "auto" },
    npm: {
      status: "published",
      package: "@wasm-zoo/ffmpeg",
      version: "0.2.9"
    },
    ...overrides
  };
}

test("normal published package gets reviewed npm pack/stage follow-up", () => {
  const md = buildPromotionHumanHandoff(pkg(), { buildWorkflow: "build-ffmpeg.yml" }, {
    repository: "ttomohisa/wasm-zoo",
    issueNumber: "42"
  });
  assert.match(md, /ffmpeg-v0\.2\.9/);
  assert.match(md, /build-ffmpeg\.yml/);
  assert.match(md, /mode=pack/);
  assert.match(md, /mode=stage/);
  assert.match(md, /@wasm-zoo\/ffmpeg@0\.2\.9/);
  assert.match(md, /gh issue close 42/);
  assert.match(md, /does \*\*not\*\* create the package tag/);
});

test("keepNpmPinned package does not suggest staging", () => {
  const qpdf = pkg({
    slug: "qpdf",
    name: "QPDF",
    upstream: { version: "12.5.0" },
    zoo: { builderVersion: "0.1.1" },
    release: { tag: "qpdf-v0.1.1" },
    npm: {
      status: "published",
      package: "@wasm-zoo/qpdf",
      version: "0.1.0",
      source: { releaseTag: "qpdf-v0.1.0" }
    }
  });
  const md = buildPromotionHumanHandoff(qpdf, { buildWorkflow: "build-qpdf.yml", keepNpmPinned: true });
  assert.match(md, /intentionally separate and pinned/);
  assert.match(md, /@wasm-zoo\/qpdf@0\.1\.0/);
  assert.match(md, /qpdf-v0\.1\.0/);
  assert.doesNotMatch(md, /mode=stage/);
});

test("merged handoff includes ancestor verification for the reviewed merge", () => {
  const sha = "1234567890abcdef1234567890abcdef12345678";
  const md = buildPromotionHumanHandoff(pkg(), { buildWorkflow: "build-ffmpeg.yml" }, {
    mergeSha: sha,
    prNumber: "99"
  });
  assert.match(md, /Promotion PR #99 is merged/);
  assert.match(md, new RegExp("git merge-base --is-ancestor " + sha));
});

test("unavailable package fails closed", () => {
  assert.throws(
    () => buildPromotionHumanHandoff(pkg({ status: "experimental" }), { buildWorkflow: "build-ffmpeg.yml" }),
    /not an available package/
  );
});
