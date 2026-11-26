import fs from "node:fs/promises";
import path from "node:path";

export function zstdVersionNumber(version) {
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]?)\.(0|[1-9][0-9]?)$/.test(version)) {
    throw new Error(`Unsupported Zstandard version: ${version}`);
  }
  const [major, minor, release] = version.split(".").map(Number);
  const number = major * 10000 + minor * 100 + release;
  if (!Number.isSafeInteger(number) || number > 0xffffffff) throw new Error(`Unsupported Zstandard version number: ${version}`);
  return number;
}

// Both candidate and promotion workspaces must update the entire exact-version contract.
// Keep the Worker guard pinned to the reviewed (or isolated candidate) version, not to the
// version reported by the potentially mismatched WASM binary itself.
export async function refreshZstdVersionPins(root, oldVersion, newVersion, newRef) {
  if (newRef !== `v${newVersion}`) throw new Error(`Zstandard tag ${newRef} does not match version ${newVersion}`);
  const oldNumber = zstdVersionNumber(oldVersion);
  const newNumber = zstdVersionNumber(newVersion);
  const changes = [
    ["runtime/browser-zstd-worker.js", `const EXPECTED_VERSION_NUMBER = ${oldNumber};`, `const EXPECTED_VERSION_NUMBER = ${newNumber};`],
    ["tests/smoke-test.html", `version !== ${oldNumber}`, `version !== ${newNumber}`],
    ["tests/smoke-test-cli.html", `SMOKE_TEST_PASS_zstd_${oldVersion}_upstream_cli`, `SMOKE_TEST_PASS_zstd_${newVersion}_upstream_cli`],
    ["scripts/build-cli.sh", `zstd --version displays ${oldVersion}`, `zstd --version displays ${newVersion}`]
  ];
  const pending = [];
  for (const [rel, expected, replacement] of changes) {
    const file = path.join(root, "builders/zstd", rel);
    let body = await fs.readFile(file, "utf8");
    if (body.split(expected).length !== 2) throw new Error(`Expected exactly one Zstandard version pin ${expected} in ${rel}`);
    body = body.replace(expected, replacement);
    if (!rel.startsWith("runtime/")) {
      body = body.replaceAll(oldVersion, newVersion);
    }
    pending.push([file, body]);
  }
  for (const [file, body] of pending) await fs.writeFile(file, body);
}
