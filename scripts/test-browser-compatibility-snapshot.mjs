import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseSnapshot, browsers, packageSlugs, selectMainRun, buildVerifiedSnapshot
} from "./browser-compatibility-snapshot.mjs";

const now = "2026-09-23T09:03:00.000Z";
const run = {
  id: 35837953654,
  head_branch: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  html_url: "https://github.com/ttomohisa/wasm-zoo/actions/runs/35837953654",
  head_sha: "a".repeat(40),
  created_at: "2026-09-23T08:34:00.000Z",
  updated_at: "2026-09-23T09:02:00.000Z"
};
const packages = packageSlugs.map((slug) => ({
  slug,
  npm: { status: "published", package: `@wasm-zoo/${slug}`, version: "1.2.3", profile: "browser-full" },
  profiles: [{ id: "browser-full", sharedArrayBuffer: slug === "ffmpeg" || slug === "libvips" }]
}));
const headers = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin"
};
const caps = {
  secureContext: true,
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  worker: true,
  webAssembly: true,
  wasmSharedMemory: true
};
function makeRecords() {
  return packageSlugs.flatMap((slug) => browsers.map((browser) => ({
    schemaVersion: 1,
    package: slug,
    npmPackage: `@wasm-zoo/${slug}`,
    npmVersion: "1.2.3",
    profile: "browser-full",
    browser,
    browserVersion: "1.0",
    status: "pass",
    testedAt: "2026-09-23T08:55:00.000Z",
    phase: "complete",
    detail: "real-operation validated",
    reason: null,
    responseHeaders: headers,
    runtimeCapabilities: caps
  })));
}
function build(records, overrides = {}) {
  return buildVerifiedSnapshot({
    packages, records, run: { ...run, ...(overrides.run || {}) },
    generatedAt: overrides.generatedAt || now
  });
}

test("latest eligible main run wins even if newer run failed", () => {
  const failed = { ...run, id: 35837960000, conclusion: "failure", created_at: "2026-09-23T09:00:00.000Z" };
  const pr = { ...run, id: 35837970000, head_branch: "feat/compat", event: "pull_request", created_at: "2026-09-23T09:01:00.000Z" };
  assert.equal(selectMainRun([run, pr, failed])?.id, failed.id);
});

test("no main run never advertises a pass", () => {
  const snapshot = baseSnapshot(packages, now);
  assert.equal(snapshot.state, "unavailable");
  assert.equal(snapshot.results.length, 21);
  assert.ok(snapshot.results.every((record) => record.status === "not-tested"));
});

test("only exact-version evidence from a successful main run produces 21 observed passes", () => {
  const snapshot = build(makeRecords());
  assert.equal(snapshot.state, "verified");
  assert.equal(snapshot.source.headBranch, "main");
  assert.equal(snapshot.source.runId, run.id);
  assert.equal(snapshot.results.length, 21);
  assert.ok(snapshot.results.every((item) => item.status === "pass" && item.npmVersion === "1.2.3"));
});

test("Zstandard requires the exact published npm profile and real browser operations", () => {
  const records = makeRecords();
  const zstd = records.filter((r) => r.package === "zstd");
  assert.equal(zstd.length, 3);
  assert.deepEqual(zstd.map((r) => r.browser), browsers);
  const forged = makeRecords();
  forged.find((r) => r.package === "zstd").profile = "browser-core";
  assert.throws(() => build(forged), /identity\/version/);
  const missing = makeRecords().filter((r) => !(r.package === "zstd" && r.browser === "webkit"));
  assert.throws(() => build(missing), /21 distinct/);
});

test("missing, duplicated or wrong-version cells reject the entire snapshot", () => {
  assert.throws(() => build(makeRecords().slice(1)), /21 distinct/);
  const duplicates = makeRecords();
  duplicates[0] = { ...duplicates[1] };
  assert.throws(() => build(duplicates), /21 distinct/);
  const mismatch = makeRecords();
  mismatch[0].npmVersion = "0.0.1";
  assert.throws(() => build(mismatch), /identity\/version/);
});

test("bad main-run provenance or stale success cannot be used", () => {
  assert.throws(() => build(makeRecords(), { run: { head_branch: "feat/test" } }), /verifiable main/);
  assert.throws(() => build(makeRecords(), { run: { conclusion: "failure" } }), /Latest main-branch/);
  assert.throws(() => build(makeRecords(), { generatedAt: "2026-10-10T00:00:00.000Z" }), /older than 14 days/);
});

test("a failed package operation or unverified threaded pass is never published as pass", () => {
  const failed = makeRecords();
  failed[0].status = "fail";
  assert.throws(() => build(failed), /Unverified result/);
  const missingEvidence = makeRecords();
  const ffmpeg = missingEvidence.find((r) => r.package === "ffmpeg");
  ffmpeg.runtimeCapabilities = null;
  assert.throws(() => build(missingEvidence), /capability preflight/);
});

test("unsupported only reflects measured non-Chromium threaded capability loss", () => {
  const observed = makeRecords();
  const firefox = observed.find((r) => r.package === "libvips" && r.browser === "firefox");
  firefox.status = "unsupported";
  firefox.phase = "runtime-preflight";
  firefox.detail = null;
  firefox.runtimeCapabilities = { ...caps, sharedArrayBuffer: false };
  firefox.reason = "Browser environment lacks required threaded runtime features: SharedArrayBuffer";
  const result = build(observed);
  assert.equal(result.results.find((r) => r.package === "libvips" && r.browser === "firefox").status, "unsupported");
  firefox.responseHeaders = { ...headers, "cross-origin-embedder-policy": "" };
  assert.throws(() => build(observed), /Unsupported lacks specific observed evidence/);
  firefox.responseHeaders = headers;
  firefox.browser = "chromium";
  // Duplicating Chromium also invalidates the complete 21-cell set.
  assert.throws(() => build(observed), /21 distinct/);
});

test("synthetic older package reports cannot silently survive reviewed version updates", () => {
  const records = makeRecords();
  const otherPackages = packages.map((pkg) => pkg.slug === "jq"
    ? { ...pkg, npm: { ...pkg.npm, version: "1.2.4" } }
    : pkg);
  assert.throws(() => buildVerifiedSnapshot({ packages: otherPackages, run, records, generatedAt: now }), /identity\/version/);
});
