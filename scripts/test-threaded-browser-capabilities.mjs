import assert from "node:assert/strict";
import { test } from "node:test";
import { assessThreadedRuntime } from "./threaded-browser-capabilities.mjs";

const headers = Object.freeze({
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin"
});
const capabilities = Object.freeze({
  secureContext: true,
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  worker: true,
  webAssembly: true,
  wasmSharedMemory: true
});

test("healthy threaded browser can run real smoke fixture", () => {
  assert.deepEqual(assessThreadedRuntime({ headers, capabilities }), {
    status: "pass", phase: "runtime-preflight", reason: null
  });
});

test("missing harness COEP cannot be mislabeled unsupported", () => {
  const result = assessThreadedRuntime({
    headers: { ...headers, "cross-origin-embedder-policy": undefined },
    capabilities: { ...capabilities, sharedArrayBuffer: false }
  });
  assert.equal(result.status, "fail");
  assert.match(result.reason, /cross-origin-embedder-policy/);
});

test("missing harness COOP and CORP also fail", () => {
  for (const header of ["cross-origin-opener-policy", "cross-origin-resource-policy"]) {
    assert.equal(assessThreadedRuntime({
      headers: { ...headers, [header]: "" }, capabilities
    }).status, "fail");
  }
});

test("observed lack of isolation or SAB is unsupported with intact headers", () => {
  for (const property of ["secureContext", "crossOriginIsolated", "sharedArrayBuffer", "worker", "webAssembly", "wasmSharedMemory"]) {
    const result = assessThreadedRuntime({ headers, capabilities: { ...capabilities, [property]: false } });
    assert.equal(result.status, "unsupported", property);
    assert.ok(result.reason.includes("lacks required threaded runtime features"), property);
  }
});

test("missing or malformed browser probe is failure, not unsupported", () => {
  assert.equal(assessThreadedRuntime({ headers, capabilities: null }).status, "fail");
  assert.equal(assessThreadedRuntime({ headers, capabilities: { ...capabilities, wasmSharedMemory: null } }).status, "fail");
});

test("HTTP header casing/whitespace is normalized for values", () => {
  const result = assessThreadedRuntime({
    headers: {
      "cross-origin-opener-policy": " Same-Origin ",
      "cross-origin-embedder-policy": " REQUIRE-CORP ",
      "cross-origin-resource-policy": "same-origin"
    }, capabilities
  });
  assert.equal(result.status, "pass");
});
