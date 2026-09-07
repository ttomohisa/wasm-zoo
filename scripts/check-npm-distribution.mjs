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
    need(pkg.version === zoo.npm.version, "jq npm package version must match packages/jq npm.version");
    need(pkg.wasmZoo?.builderVersion === zoo.zoo.builderVersion, "jq npm metadata must retain the source Zoo builder version");
    need(pkg.wasmZoo?.npmVersion === zoo.npm.version, "jq npm metadata must record the npm distribution version");
    need(pkg.publishConfig?.access === "public", "scoped npm package must publish with public access");
    need(pkg.publishConfig?.provenance === true, "npm package must request provenance for Trusted Publisher staging/publishing");
    need(pkg.wasmZoo?.releaseTag === zoo.release.tag && pkg.wasmZoo?.releaseAsset === zoo.profiles[0].releaseAsset, "npm metadata must identify the immutable source release asset");
    need(pkg.exports?.["."] === "./index.mjs" && pkg.exports?.["./self-hosted"] === "./wasm-zoo.mjs", "npm exports must expose bundler and self-hosted entries");
    const entry = await fs.readFile(path.join(output, "index.mjs"), "utf8");
    const npmWrapper = await fs.readFile(path.join(output, "browser-jq.js"), "utf8");
    const reviewedWrapper = await fs.readFile(path.join(root, "builders", "jq", "runtime", "browser-jq.js"), "utf8");
    need(npmWrapper === reviewedWrapper, "npm package must overlay the current reviewed browser-jq.js instead of shipping the historical Release wrapper");
    need(npmWrapper.includes("constructor({ baseUrl, coreJsUrl, wasmUrl })") && npmWrapper.includes("this.coreJsUrl") && npmWrapper.includes("this.wasmUrl"), "npm browser wrapper must honor bundler-emitted core JS/Wasm URLs");
    need(entry.includes('import "./browser-jq.js"'), "npm entry must bundle the legacy runtime as a side effect");
    need(entry.includes('new URL("./jq-core.js", import.meta.url)') && entry.includes('new URL("./jq-core.wasm", import.meta.url)'), "npm entry must statically reference jq core assets for bundlers");
    need(entry.includes("coreJsUrl: options.coreJsUrl || assets.coreJsUrl") && entry.includes("wasmUrl: options.wasmUrl || assets.wasmUrl"), "npm entry must forward emitted asset URLs to Consumer API v1");
    const packDir = path.join(temp, "pack");
    await fs.mkdir(packDir);
    const pack = spawnSync("npm", ["pack", output, "--ignore-scripts", "--pack-destination", packDir], { encoding: "utf8", shell: process.platform === "win32" });
    need(pack.status === 0, `npm pack failed: ${pack.stderr || pack.stdout}`);
    if (pack.status === 0) {
      const tarballs = (await fs.readdir(packDir)).filter((name) => name.endsWith(".tgz"));
      need(tarballs.length === 1, `npm pack must create exactly one tarball, got ${tarballs.length}`);
      if (tarballs.length === 1) {
        const installDir = path.join(temp, "install-check");
        await fs.mkdir(installDir);
        await fs.writeFile(path.join(installDir, "package.json"), '{"private":true}\n');
        const tarball = path.join(packDir, tarballs[0]);
        const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarball], { cwd: installDir, encoding: "utf8", shell: process.platform === "win32" });
        need(install.status === 0, `npm install tarball verification failed: ${install.stderr || install.stdout}`);
        if (install.status === 0) {
          const installed = path.join(installDir, "node_modules", "@wasm-zoo", "jq");
          for (const rel of ["index.mjs", "wasm-zoo.mjs", "browser-jq.js", "jq-core.js", "jq-core.wasm", "manifest.json", "features.json", "provenance.json", "sbom.cdx.json", "LICENSE", "README.md"]) {
            const stat = await fs.stat(path.join(installed, rel)).catch(() => null);
            need(stat?.isFile(), `installed npm package must include ${rel}`);
          }
        }
      }
    }
  }

  const workflow = await fs.readFile(path.join(root, ".github", "workflows", "publish-npm.yml"), "utf8");
  need(workflow.includes("id-token: write"), "npm stage workflow must request OIDC id-token permission");
  need(workflow.includes("options: [pack, stage]"), "npm workflow must expose only pack and stage modes after bootstrap");
  need(workflow.includes("npm stage publish"), "npm workflow must stage new versions for maintainer approval");
  need(!workflow.includes("npm publish --access public"), "npm workflow must not allow direct publish after Trusted Publisher bootstrap");
  need(!workflow.includes("secrets.NPM_TOKEN") && !workflow.includes("NODE_AUTH_TOKEN"), "npm workflow must not depend on a long-lived npm token");
  need(workflow.includes("gh release download"), "npm workflow must package the immutable GitHub Release asset");

  const smoke = await fs.readFile(path.join(root, "scripts", "smoke-npm-jq.mjs"), "utf8");
  need(smoke.includes("@wasm-zoo/jq") && smoke.includes("vite") && smoke.includes("playwright"), "published npm smoke must install jq and exercise Vite/Playwright");
  need(smoke.includes("vite\", \"build") && smoke.includes("chromium.launch") && smoke.includes("jq.exec"), "published npm smoke must test a production Vite build in Chromium with a real jq invocation");
  const smokeWorkflow = await fs.readFile(path.join(root, ".github", "workflows", "npm-jq-smoke.yml"), "utf8");
  need(smokeWorkflow.includes("scripts/smoke-npm-jq.mjs") && smokeWorkflow.includes("workflow_dispatch") && smokeWorkflow.includes("schedule:"), "published npm smoke workflow must be manually runnable and periodically scheduled");

  const promotion = await fs.readFile(path.join(root, "scripts", "prepare-promotion.mjs"), "utf8");
  need(!promotion.includes("pkg.npm.version = newBuilder"), "promotion must not couple npm package versions back to builder versions");
  need(promotion.includes("npm distribution version") && promotion.includes("pkg.npm.version = newNpmVersion"), "promotion must independently patch-bump npm distribution versions");

  const doc = await fs.readFile(path.join(root, "docs", "NPM_DISTRIBUTION.md"), "utf8");
  need(doc.includes("@wasm-zoo/jq") && doc.includes("bootstrap is complete") && doc.includes("stage-only") && doc.includes("Vite") && doc.includes("Chromium") && doc.includes("independent distribution version"), "npm distribution docs must cover independent npm versioning, stage-only Trusted Publisher operation, and live Vite/Chromium validation");
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
