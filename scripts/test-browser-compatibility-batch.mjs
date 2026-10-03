import assert from "node:assert/strict";
import { test } from "node:test";
import { runCompatibilityBatch, smokeArgs } from "./run-browser-compatibility-batch.mjs";

const packages = [
  {
    slug: "jq",
    status: "available",
    npm: { status: "published", package: "@wasm-zoo/jq", version: "1.0.0", profile: "browser-full" },
    profiles: [{ id: "browser-full", sharedArrayBuffer: false }]
  },
  {
    slug: "ffmpeg",
    status: "available",
    npm: { status: "published", package: "@wasm-zoo/ffmpeg", version: "1.0.0", profile: "browser-full" },
    profiles: [{ id: "browser-full", sharedArrayBuffer: true }]
  }
];

test("batch continues after an individual failure and fails closed after all slugs", async () => {
  const calls = [];
  await assert.rejects(
    runCompatibilityBatch({
      slugs: ["jq", "ffmpeg"],
      browser: "firefox",
      packages,
      runOne: ({ slug, args, env }) => {
        calls.push({ slug, args, env });
        return slug === "jq" ? 1 : 0;
      }
    }),
    /jq/
  );
  assert.deepEqual(calls.map((item) => item.slug), ["jq", "ffmpeg"]);
  assert.ok(calls.every((item) => item.env.WASM_ZOO_PLAYWRIGHT_PREINSTALLED === "1"));
  assert.equal(calls[0].args.includes("--on-unsupported"), false);
  const flag = calls[1].args.indexOf("--on-unsupported");
  assert.equal(calls[1].args[flag + 1], "record");
});

test("Chromium keeps threaded capability absence as an error", () => {
  const args = smokeArgs({ slug: "ffmpeg", browser: "chromium", threaded: true });
  const flag = args.indexOf("--on-unsupported");
  assert.equal(args[flag + 1], "error");
});

test("batch rejects unknown or duplicate slugs", async () => {
  await assert.rejects(
    runCompatibilityBatch({ slugs: ["missing"], browser: "chromium", packages, runOne: () => 0 }),
    /non-reviewed/
  );
  await assert.rejects(
    runCompatibilityBatch({ slugs: ["jq", "jq"], browser: "chromium", packages, runOne: () => 0 }),
    /duplicate/
  );
});
