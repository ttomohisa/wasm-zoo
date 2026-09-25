import assert from "node:assert/strict";
import { test } from "node:test";
import { automaticCandidateSlugs } from "./upstream-config.mjs";
import { resolveAutomaticCandidate, selectedCandidateResult } from "./candidate-orchestration.mjs";

test("every configured automatic package resolves through the shared orchestration contract", async () => {
  for (const slug of automaticCandidateSlugs) {
    const resolved = await resolveAutomaticCandidate(slug);
    assert.equal(resolved.slug, slug);
    assert.ok(resolved.profiles.length > 0);
    assert.equal(resolved.checker, `builders/${slug}/scripts/check-repository.mjs`);
  }
});

test("unknown or non-automatic candidates fail closed", async () => {
  await assert.rejects(() => resolveAutomaticCandidate("not-a-zoo-package"), /Unknown package slug/);
});

test("selected candidate result is taken from the matching needs entry", () => {
  const needs = {
    ffmpeg: { result: "skipped" },
    qpdf: { result: "success" },
    zstd: { result: "failure" }
  };
  assert.equal(selectedCandidateResult("qpdf", needs), "success");
  assert.equal(selectedCandidateResult("zstd", needs), "failure");
  assert.throws(() => selectedCandidateResult("libvips", needs), /missing from workflow needs/);
  assert.throws(() => selectedCandidateResult("qpdf", { qpdf: { result: "waiting" } }), /Unexpected candidate result/);
});
