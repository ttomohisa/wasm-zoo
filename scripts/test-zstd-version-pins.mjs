import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { root } from "./lib.mjs";
import { refreshZstdVersionPins, zstdVersionNumber } from "./zstd-version-pins.mjs";

const pkg = JSON.parse(await fs.readFile(path.join(root, "packages/zstd/package.json"), "utf8"));
const reviewed = pkg.upstream.version;
const workerRel = "builders/zstd/runtime/browser-zstd-worker.js";
const fixtures = [
  "scripts/prepare-candidate.mjs", "scripts/lib.mjs", "scripts/upstream-config.mjs", "scripts/zstd-version-pins.mjs",
  "packages/zstd/package.json", "builders/zstd/versions.env", workerRel,
  "builders/zstd/tests/smoke-test.html", "builders/zstd/tests/smoke-test-cli.html", "builders/zstd/scripts/build-cli.sh"
];
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-zoo-zstd-version-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const rel of fixtures) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.copyFile(path.join(root, rel), path.join(dir, rel));
  }
  return dir;
}
async function runWorker(source, actualVersion, operation = "version") {
  const messages = [];
  const self = { postMessage(message) { messages.push(message); } };
  const context = vm.createContext({
    self, URL, Uint8Array, importScripts() {},
    createZstdCore: async () => ({ _zoo_version_number: () => actualVersion })
  });
  vm.runInContext(source, context, { filename: workerRel });
  await self.onmessage({ data: { operation, coreJsUrl: "https://example.invalid/zstd-core.js", wasmBytes: new Uint8Array() } });
  assert.equal(messages.length, 1);
  return messages[0];
}
async function assertWorker(source, version) {
  const expected = zstdVersionNumber(version);
  const good = await runWorker(source, expected);
  assert.equal(good.type, "done");
  assert.equal(good.versionNumber, expected);
  for (const operation of ["version", "compress", "decompress"]) {
    const bad = await runWorker(source, expected + 1, operation);
    assert.equal(bad.type, "error");
    assert.equal(bad.message, `Unexpected libzstd version: ${expected + 1} (expected ${expected})`);
  }
}

test("reviewed Worker checks the exact reviewed upstream version", async () => {
  await assertWorker(await fs.readFile(path.join(root, workerRel), "utf8"), reviewed);
});
const [major, minor, patch] = reviewed.split(".").map(Number);
const future = [...new Set([`${major}.${minor + 1}.0`, `${major + 1}.0.0`, `${major}.${minor}.${patch + 1}`])];
for (const version of future) {
  test(`isolated candidate ${version} updates every runtime and smoke version pin`, async (t) => {
    const dir = await fixture(t);
    execFileSync(process.execPath, ["scripts/prepare-candidate.mjs", "--slug", "zstd", "--version", version, "--ref", `v${version}`, "--commit", "a".repeat(40)], { cwd: dir, encoding: "utf8" });
    const read = (rel) => fs.readFile(path.join(dir, rel), "utf8");
    assert.match(await read("builders/zstd/versions.env"), new RegExp(`^ZSTD_REF=v${version.replaceAll(".", "\\.")}$`, "m"));
    assert.deepEqual(JSON.parse(await read("packages/zstd/package.json")), pkg);
    await assertWorker(await read(workerRel), version);
    const smoke = await read("builders/zstd/tests/smoke-test.html");
    assert.ok(smoke.includes(`version !== ${zstdVersionNumber(version)}`));
    assert.ok(smoke.includes(`SMOKE_TEST_PASS_zstd_${version}_roundtrip_and_invalid_frame`));
    assert.ok((await read("builders/zstd/tests/smoke-test-cli.html")).includes(`SMOKE_TEST_PASS_zstd_${version}_upstream_cli`));
    assert.ok((await read("builders/zstd/scripts/build-cli.sh")).includes(`zstd --version displays ${version}`));
  });
}
test("shared updater refuses stale or duplicate Worker pin and mismatched tag", async (t) => {
  const dir = await fixture(t);
  const file = path.join(dir, workerRel);
  const version = future[0];
  const pin = `const EXPECTED_VERSION_NUMBER = ${zstdVersionNumber(reviewed)};`;
  const source = await fs.readFile(file, "utf8");
  const smokeFile = path.join(dir, "builders/zstd/tests/smoke-test.html");
  const smokeBefore = await fs.readFile(smokeFile, "utf8");
  await assert.rejects(refreshZstdVersionPins(dir, reviewed, version, `v${reviewed}`), /does not match version/);
  for (const changed of [source.replace(pin, "const EXPECTED_VERSION_NUMBER = 1;"), source + "\n" + pin]) {
    await fs.writeFile(file, changed);
    await assert.rejects(refreshZstdVersionPins(dir, reviewed, version, `v${version}`), /Expected exactly one Zstandard version pin/);
    assert.equal(await fs.readFile(smokeFile, "utf8"), smokeBefore);
  }
});
