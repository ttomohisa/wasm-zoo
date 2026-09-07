import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, readJson } from "./lib.mjs";

const errors = [];
const need = (condition, message) => { if (!condition) errors.push(message); };
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-zoo-npm-"));
try {
  const input = path.join(temp, "release");
  const output = path.join(temp, "package");
  await fs.mkdir(path.join(input, "LICENSES"), { recursive: true });
  for (const rel of [
    "browser-jq.js", "jq-core.js", "jq-core.wasm", "manifest.json", "features.json",
    "provenance.json", "sbom.cdx.json", "BUILDINFO.txt", "jq-config.txt",
    "LICENSES/jq-COPYING.txt", "LICENSES/oniguruma-COPYING.txt"
  ]) {
    const file = path.join(input, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, rel.endsWith(".wasm") ? new Uint8Array([0, 97, 115, 109]) : `${rel}\n`);
  }

  const prep = spawnSync(process.execPath, [path.join(root, "scripts", "prepare-npm-package.mjs"), "--slug", "jq", "--input", input, "--output", output], { encoding: "utf8" });
  need(prep.status === 0, `npm preparer failed: ${prep.stderr || prep.stdout}`);
  if (prep.status === 0) {
    const pkg = await readJson(path.join(output, "package.json"));
    const zoo = await readJson(path.join(root, "packages", "jq", "package.json"));
    need(pkg.name === "@wasm-zoo/jq", "jq npm package name must be @wasm-zoo/jq");
    need(pkg.version === zoo.zoo.builderVersion, "jq npm version must match the Zoo builder version");
    need(pkg.publishConfig?.access === "public", "scoped npm package must publish with public access");
    need(pkg.publishConfig?.provenance === true, "npm package must request provenance when token publishing is used");
    need(pkg.wasmZoo?.releaseTag === zoo.release.tag && pkg.wasmZoo?.releaseAsset === zoo.profiles[0].releaseAsset, "npm metadata must identify the immutable source release asset");
    need(pkg.exports?.["."] === "./index.mjs" && pkg.exports?.["./self-hosted"] === "./wasm-zoo.mjs", "npm exports must expose bundler and self-hosted entries");
    const entry = await fs.readFile(path.join(output, "index.mjs"), "utf8");
    need(entry.includes('import "./browser-jq.js"'), "npm entry must bundle the legacy runtime as a side effect");
    need(entry.includes('new URL("./jq-core.js", import.meta.url)') && entry.includes('new URL("./jq-core.wasm", import.meta.url)'), "npm entry must statically reference jq core assets for bundlers");
    need(entry.includes("coreJsUrl: options.coreJsUrl || assets.coreJsUrl") && entry.includes("wasmUrl: options.wasmUrl || assets.wasmUrl"), "npm entry must forward emitted asset URLs to Consumer API v1");
    const packDir = path.join(temp, "pack");
    await fs.mkdir(packDir);
    const pack = spawnSync("npm", ["pack", output, "--dry-run", "--json", "--ignore-scripts", "--pack-destination", packDir], { encoding: "utf8", shell: process.platform === "win32" });
    need(pack.status === 0, `npm pack --dry-run failed: ${pack.stderr || pack.stdout}`);
    if (pack.status === 0) {
      const report = JSON.parse(pack.stdout || "[]")[0];
      const names = new Set((report?.files || []).map((file) => file.path));
      for (const rel of ["index.mjs", "wasm-zoo.mjs", "browser-jq.js", "jq-core.js", "jq-core.wasm", "manifest.json", "features.json", "provenance.json", "sbom.cdx.json", "LICENSE", "README.md"]) {
        need(names.has(rel), `npm tarball must include ${rel}`);
      }
    }
  }

  const workflow = await fs.readFile(path.join(root, ".github", "workflows", "publish-npm.yml"), "utf8");
  need(workflow.includes("id-token: write"), "npm publish workflow must request OIDC id-token permission");
  need(workflow.includes("npm publish --access public"), "npm workflow must support first/public direct publish");
  need(workflow.includes("npm stage publish"), "npm workflow must support staged publishing after bootstrap");
  need(workflow.includes("gh release download"), "npm workflow must package the immutable GitHub Release asset");
  const doc = await fs.readFile(path.join(root, "docs", "NPM_DISTRIBUTION.md"), "utf8");
  need(doc.includes("@wasm-zoo/jq") && doc.toLowerCase().includes("first publish") && doc.includes("Trusted Publisher"), "npm distribution docs must cover canary/bootstrap/trusted publishing");
} catch (error) {
  errors.push(error?.stack || String(error));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}

if (errors.length) {
  console.error(`[NG] ${errors.length} npm distribution contract check(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log("[OK] WASM Zoo npm distribution contract checks passed for @wasm-zoo/jq canary");
