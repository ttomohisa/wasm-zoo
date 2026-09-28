import assert from "node:assert/strict";
import test from "node:test";
import { npmDistributionSets, registryReadyDistributionSets } from "./npm-package-set.mjs";

function pkg(slug, { threaded = false, version = "1.0.0" } = {}) {
  return {
    slug,
    status: "available",
    profiles: [{ id: "browser-full", sharedArrayBuffer: threaded }],
    npm: {
      status: "published",
      package: `@wasm-zoo/${slug}`,
      version,
      profile: "browser-full"
    }
  };
}

test("Registry-ready PR matrix keeps public exact versions and defers exact 404s", async () => {
  const reviewed = npmDistributionSets([
    pkg("jq", { version: "0.9.1" }),
    pkg("qpdf", { version: "0.1.1" }),
    pkg("libvips", { threaded: true, version: "0.5.3" })
  ]);
  const seen = [];
  const result = await registryReadyDistributionSets(reviewed, async (url) => {
    seen.push(url);
    if (url.endsWith("%40wasm-zoo%2Fqpdf/0.1.1")) return { ok: false, status: 404, statusText: "Not Found" };
    return { ok: true, status: 200, statusText: "OK" };
  });

  assert.deepEqual(result.single, ["jq"]);
  assert.deepEqual(result.threaded, ["libvips"]);
  assert.deepEqual(result.all, ["jq", "libvips"]);
  assert.deepEqual(result.deferred.map((entry) => entry.slug), ["qpdf"]);
  assert.equal(seen.length, 3);
});

test("Registry-ready PR matrix fails closed on non-404 Registry errors", async () => {
  const reviewed = npmDistributionSets([pkg("qpdf", { version: "0.1.1" })]);
  await assert.rejects(
    registryReadyDistributionSets(reviewed, async () => ({ ok: false, status: 503, statusText: "Unavailable" })),
    /npm Registry preflight failed for @wasm-zoo\/qpdf@0\.1\.1: 503 Unavailable/
  );
});

test("Normal reviewed matrix remains complete without Registry filtering", () => {
  const reviewed = npmDistributionSets([
    pkg("jq"),
    pkg("qpdf"),
    pkg("libvips", { threaded: true })
  ]);
  assert.deepEqual(reviewed.all, ["jq", "qpdf", "libvips"]);
  assert.deepEqual(reviewed.single, ["jq", "qpdf"]);
  assert.deepEqual(reviewed.threaded, ["libvips"]);
});
