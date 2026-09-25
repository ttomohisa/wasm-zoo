import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyNpmDistribution, npmSourceIdentity } from "./release-health-npm.mjs";

function pkg(overrides = {}) {
  return {
    slug: "ffmpeg",
    name: "FFmpeg",
    status: "available",
    upstream: { version: "9.1.0" },
    zoo: { builderVersion: "0.2.9" },
    release: { tag: "ffmpeg-v0.2.9" },
    profiles: [{ id: "browser-full", releaseAsset: "ffmpeg-browser-full-9.1.0-zoo-0.2.9.zip" }],
    npm: {
      status: "published",
      package: "@wasm-zoo/ffmpeg",
      version: "0.2.9",
      profile: "browser-full"
    },
    ...overrides
  };
}

test("source identity falls back to current package release and profile asset", () => {
  const identity = npmSourceIdentity(pkg());
  assert.equal(identity.releaseTag, "ffmpeg-v0.2.9");
  assert.equal(identity.releaseAsset, "ffmpeg-browser-full-9.1.0-zoo-0.2.9.zip");
  assert.equal(identity.upstreamVersion, "9.1.0");
  assert.equal(identity.builderVersion, "0.2.9");
});

test("current published Registry version is healthy", () => {
  const health = classifyNpmDistribution(pkg(), {}, {
    available: true,
    expectedVersion: "0.2.9",
    latestVersion: "0.2.9",
    shasum: "abc"
  });
  assert.equal(health.state, "ok");
  assert.equal(health.updatePending, false);
  assert.equal(health.sourceCurrent, true);
  assert.equal(health.registryShasum, "abc");
});

test("missing expected Registry version is a visible publication follow-up", () => {
  const health = classifyNpmDistribution(pkg(), {}, {
    available: true,
    expectedVersion: null,
    latestVersion: "0.2.8"
  });
  assert.equal(health.state, "pending");
  assert.equal(health.updatePending, true);
  assert.match(health.label, /Registry update pending/);
});

test("recorded Registry SHA-1 mismatch is an error", () => {
  const health = classifyNpmDistribution(pkg({
    npm: {
      status: "published",
      package: "@wasm-zoo/ffmpeg",
      version: "0.2.9",
      profile: "browser-full",
      registryShasum: "expected"
    }
  }), {}, {
    available: true,
    expectedVersion: "0.2.9",
    latestVersion: "0.2.9",
    shasum: "different"
  });
  assert.equal(health.state, "error");
  assert.equal(health.shasumMatch, false);
});

test("keepNpmPinned source drift is warning, not broken release", () => {
  const qpdf = pkg({
    slug: "qpdf",
    name: "QPDF",
    release: { tag: "qpdf-v0.1.1" },
    profiles: [{ id: "browser-full", releaseAsset: "qpdf-browser-full-12.5.0-zoo-0.1.1.zip" }],
    npm: {
      status: "published",
      package: "@wasm-zoo/qpdf",
      version: "0.1.0",
      profile: "browser-full",
      source: {
        releaseTag: "qpdf-v0.1.0",
        releaseAsset: "qpdf-browser-full-12.4.1-zoo-0.1.0.zip"
      }
    }
  });
  const health = classifyNpmDistribution(qpdf, { keepNpmPinned: true }, {
    available: true,
    expectedVersion: "0.1.0",
    latestVersion: "0.1.0",
    shasum: "abc"
  });
  assert.equal(health.state, "warn");
  assert.equal(health.intentionalPin, true);
  assert.equal(health.review, "separate-npm-review");
  assert.equal(health.updatePending, true);
});

test("unreviewed source drift is an error", () => {
  const drift = pkg({
    release: { tag: "ffmpeg-v0.2.9" },
    npm: {
      status: "published",
      package: "@wasm-zoo/ffmpeg",
      version: "0.2.9",
      profile: "browser-full",
      source: { releaseTag: "ffmpeg-v0.2.8" }
    }
  });
  const health = classifyNpmDistribution(drift, {}, {
    available: true,
    expectedVersion: "0.2.9",
    latestVersion: "0.2.9"
  });
  assert.equal(health.state, "error");
  assert.equal(health.intentionalPin, false);
});
