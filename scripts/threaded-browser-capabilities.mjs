// Classify only observable browser capabilities after checking that our own
// server delivered the required COOP/COEP/CORP headers. Do not turn an
// incorrectly configured server (or a missing probe) into "unsupported".
const expectedHeaders = {
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin"
};

const runtimeChecks = [
  ["secureContext", "secure context"],
  ["crossOriginIsolated", "cross-origin isolation"],
  ["sharedArrayBuffer", "SharedArrayBuffer"],
  ["worker", "Web Worker"],
  ["webAssembly", "WebAssembly"],
  ["wasmSharedMemory", "WebAssembly shared memory"]
];

export function assessThreadedRuntime({ headers, capabilities }) {
  if (!headers || typeof headers !== "object") {
    return { status: "fail", phase: "runtime-preflight", reason: "Missing HTTP response headers" };
  }
  for (const [key, value] of Object.entries(expectedHeaders)) {
    const observed = String(headers[key] || "").trim().toLowerCase();
    if (observed !== value) {
      return {
        status: "fail",
        phase: "runtime-preflight",
        reason: `Harness HTTP header ${key}: expected ${value}, got ${observed || "(missing)"}`
      };
    }
  }
  if (!capabilities || typeof capabilities !== "object") {
    return { status: "fail", phase: "runtime-preflight", reason: "Browser capability probe was not recorded" };
  }
  for (const [key] of runtimeChecks) {
    if (typeof capabilities[key] !== "boolean") {
      return { status: "fail", phase: "runtime-preflight", reason: `Invalid capability probe field: ${key}` };
    }
  }
  const missing = runtimeChecks.filter(([key]) => !capabilities[key]).map(([, label]) => label);
  if (missing.length) {
    return {
      status: "unsupported",
      phase: "runtime-preflight",
      reason: `Browser environment lacks required threaded runtime features: ${missing.join(", ")}`
    };
  }
  return { status: "pass", phase: "runtime-preflight", reason: null };
}
