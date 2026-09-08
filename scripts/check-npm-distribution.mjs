import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, readJson } from "./lib.mjs";

const errors = [];
const need = (condition, message) => { if (!condition) errors.push(message); };
const npmSlugs = ["jq", "libarchive", "imagemagick", "ghostscript", "libvips"];

function spawnDirect(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    shell: false
  });
}

function run(command, args, options = {}) {
  if (command === process.execPath) return spawnDirect(process.execPath, args, options);
  if (command === "npm") {
    const npmExecPath = process.env.npm_execpath;
    if (npmExecPath) return spawnDirect(process.execPath, [npmExecPath, ...args], options);
    if (process.platform === "win32") {
      return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm.cmd", ...args], {
        cwd: options.cwd,
        encoding: "utf8",
        shell: false
      });
    }
  }
  return spawnDirect(command, args, options);
}

async function createSyntheticRelease(pkg, dir) {
  const required = pkg.npm?.packageFiles?.required || [];
  const optional = pkg.npm?.packageFiles?.optional || [];
  const requiredDirs = pkg.npm?.packageFiles?.requiredDirs || [];
  const optionalDirs = pkg.npm?.packageFiles?.optionalDirs || [];
  await fs.mkdir(dir, { recursive: true });
  for (const rel of [...required, ...optional]) {
    const file = path.join(dir, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const body = rel.endsWith(".wasm") ? new Uint8Array([0, 97, 115, 109]) : `${rel}\n`;
    await fs.writeFile(file, body);
  }
  for (const rel of [...requiredDirs, ...optionalDirs]) {
    const folder = path.join(dir, rel);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, "wasm-zoo-recursive-copy-check.txt"), `${rel} recursive copy\n`);
  }
}

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-zoo-npm-contract-"));
try {
  for (const slug of npmSlugs) {
    const zoo = await readJson(path.join(root, "packages", slug, "package.json"));
    const npm = zoo.npm;
    need(Boolean(npm), `${slug} must declare npm metadata`);
    if (!npm) continue;

    const input = path.join(temp, slug, "release");
    const output = path.join(temp, slug, "package");
    await createSyntheticRelease(zoo, input);
    const prep = run(process.execPath, [path.join(root, "scripts", "prepare-npm-package.mjs"), "--slug", slug, "--input", input, "--output", output]);
    need(prep.status === 0, `${slug} npm preparer failed: ${prep.stderr || prep.stdout}`);
    if (prep.status !== 0) continue;

    const pkg = await readJson(path.join(output, "package.json"));
    need(pkg.name === npm.package, `${slug} npm package name must match metadata`);
    need(pkg.version === npm.version, `${slug} npm package version must match metadata`);
    need(pkg.wasmZoo?.builderVersion === zoo.zoo.builderVersion, `${slug} npm metadata must retain the source Zoo builder version`);
    need(pkg.wasmZoo?.npmVersion === npm.version, `${slug} npm metadata must record the npm distribution version`);
    need(pkg.publishConfig?.access === "public", `${slug} scoped npm package must publish with public access`);
    need(pkg.publishConfig?.provenance === true, `${slug} npm package must request provenance`);
    need(pkg.wasmZoo?.releaseTag === zoo.release.tag, `${slug} npm metadata must identify the immutable source release tag`);
    const profile = zoo.profiles.find((entry) => entry.id === npm.profile);
    need(pkg.wasmZoo?.releaseAsset === profile?.releaseAsset, `${slug} npm metadata must identify the immutable source release asset`);
    need(pkg.exports?.["."] === `./${npm.entry}` && pkg.exports?.["./self-hosted"] === "./wasm-zoo.mjs", `${slug} npm exports must expose bundler and self-hosted entries`);

    const entry = await fs.readFile(path.join(output, npm.entry), "utf8");
    const classic = npm.runtime.classicScript;
    const npmWrapper = await fs.readFile(path.join(output, classic), "utf8");
    const reviewedWrapper = await fs.readFile(path.join(root, "builders", slug, "runtime", classic), "utf8");
    need(npmWrapper === reviewedWrapper, `${slug} npm package must overlay the current reviewed ${classic}`);
    need(entry.includes(`import "./${classic}"`), `${slug} npm entry must import the reviewed browser wrapper`);
    for (const asset of npm.runtime.assets) {
      need(entry.includes(`new URL("./${asset.coreJs}", import.meta.url)`), `${slug} npm entry must statically reference ${asset.coreJs}`);
      need(entry.includes(`new URL("./${asset.wasm}", import.meta.url)`), `${slug} npm entry must statically reference ${asset.wasm}`);
      need(pkg.exports?.[`./${asset.wasm}`] === `./${asset.wasm}`, `${slug} npm exports must expose ${asset.wasm}`);
    }
    if (npm.runtime.assetMode === "single") {
      need(entry.includes("coreJsUrl: options.coreJsUrl || assets.coreJsUrl") && entry.includes("wasmUrl: options.wasmUrl || assets.wasmUrl"), `${slug} single-core entry must forward emitted asset URLs`);
      need(entry.includes(`distributionProfile = ${JSON.stringify(npm.profile)}`) && entry.includes("profile: distributionProfile"), `${slug} npm entry must pin execution to declared npm.profile`);
    } else if (npm.runtime.assetMode === "tool-map") {
      need(entry.includes("toolAssets: options.toolAssets || assets"), `${slug} tool-map entry must forward emitted per-tool assets`);
      need(npmWrapper.includes("toolAssets") && npmWrapper.includes("resolveToolAsset"), `${slug} browser wrapper must honor per-tool emitted asset URLs`);
      const consumer = await fs.readFile(path.join(root, "builders", slug, "runtime", "wasm-zoo.mjs"), "utf8");
      need(consumer.includes("toolAssets: options.toolAssets"), `${slug} Consumer API must forward toolAssets into the browser wrapper`);
    }

    const packDir = path.join(temp, slug, "pack");
    await fs.mkdir(packDir, { recursive: true });
    const pack = run("npm", ["pack", output, "--ignore-scripts", "--pack-destination", packDir]);
    need(pack.status === 0, `${slug} npm pack failed: ${pack.stderr || pack.stdout}`);
    if (pack.status !== 0) continue;
    const tarballs = (await fs.readdir(packDir)).filter((name) => name.endsWith(".tgz"));
    need(tarballs.length === 1, `${slug} npm pack must create exactly one tarball, got ${tarballs.length}`);
    if (tarballs.length !== 1) continue;

    const installDir = path.join(temp, slug, "install-check");
    await fs.mkdir(installDir, { recursive: true });
    await fs.writeFile(path.join(installDir, "package.json"), '{"private":true}\n');
    const install = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", path.join(packDir, tarballs[0])], { cwd: installDir });
    need(install.status === 0, `${slug} npm install tarball verification failed: ${install.stderr || install.stdout}`);
    if (install.status === 0) {
      const installed = path.join(installDir, "node_modules", ...npm.package.split("/"));
      for (const rel of [...new Set([npm.entry, "wasm-zoo.mjs", classic, "manifest.json", "features.json", "provenance.json", "sbom.cdx.json", "LICENSE", "README.md", ...(npm.packageFiles?.required || []), ...npm.runtime.assets.flatMap((asset) => [asset.coreJs, asset.wasm])])]) {
        const stat = await fs.stat(path.join(installed, rel)).catch(() => null);
        need(stat?.isFile(), `${slug} installed npm package must include ${rel}`);
      }
      for (const rel of npm.packageFiles?.requiredDirs || []) {
        const folder = path.join(installed, rel);
        const stat = await fs.stat(folder).catch(() => null);
        const marker = await fs.stat(path.join(folder, "wasm-zoo-recursive-copy-check.txt")).catch(() => null);
        need(stat?.isDirectory() && marker?.isFile(), `${slug} installed npm package must recursively preserve ${rel}`);
        need(pkg.files?.includes(rel), `${slug} npm files list must include required directory ${rel}`);
      }
    }
  }

  const workflow = await fs.readFile(path.join(root, ".github", "workflows", "publish-npm.yml"), "utf8");
  need(workflow.includes("options: [jq, libarchive, imagemagick, ghostscript, libvips]"), "npm distribution workflow must expose jq, libarchive, imagemagick, ghostscript and libvips");
  need(workflow.includes("['canary', 'published'].includes(pkg.npm.status)"), "npm distribution workflow must accept both canary and published npm packages");
  need(workflow.includes("options: [pack, bootstrap, stage]"), "npm distribution workflow must expose pack/bootstrap/stage during package rollout");
  need(workflow.includes("id-token: write"), "npm distribution workflow must request OIDC id-token permission");
  need(workflow.includes("npm stage publish"), "npm distribution workflow must support staged publishing for existing packages");
  need(workflow.includes("NPM_BOOTSTRAP_TOKEN") && workflow.includes("npm publish --access public"), "npm workflow must support explicit token-backed bootstrap for brand-new package names");
  need(workflow.includes("already exists on the npm registry; bootstrap is forbidden"), "npm bootstrap path must refuse package names that already exist");
  need(workflow.includes("staged publishing cannot bootstrap a brand-new npm package"), "npm stage path must refuse brand-new package names");
  need(workflow.includes("gh release download"), "npm workflow must package immutable GitHub Release assets");

  const smoke = await fs.readFile(path.join(root, "scripts", "smoke-npm-package.mjs"), "utf8");
  need(smoke.includes("jq:") && smoke.includes("libarchive:") && smoke.includes("imagemagick:") && smoke.includes("ghostscript:") && smoke.includes("libvips:"), "generic npm smoke must have jq, libarchive, ImageMagick, Ghostscript and libvips fixtures");
  need(smoke.includes("vite") && smoke.includes("playwright") && smoke.includes("chromium.launch"), "generic npm smoke must exercise Vite/Playwright/Chromium");
  need(smoke.includes("http.createServer") && smoke.includes("cleanup complete"), "generic npm smoke must serve dist in-process and explicitly complete cleanup");
  need(!smoke.includes('"vite", "preview"') && !smoke.includes("preview.kill("), "generic npm smoke must not use a Vite preview child process");
  need(smoke.includes("makeTar") && smoke.includes('tool: "bsdtar"'), "libarchive live smoke must perform a real bsdtar archive operation");
  need(smoke.includes("output.png") && smoke.includes("PNG signature") && smoke.includes("readU32BE"), "ImageMagick live smoke must perform a real resize and validate emitted PNG bytes");
  need(smoke.includes("output.pdf") && smoke.includes("%PDF-") && smoke.includes("%%EOF"), "Ghostscript live smoke must convert PostScript to a PDF and validate its PDF framing");
  need(smoke.includes("libvips:") && smoke.includes("Image.newFromBuffer") && smoke.includes("writeToBuffer") && smoke.includes("crossOriginIsolated"), "libvips live smoke must exercise the library API under cross-origin isolation");
  need(smoke.includes("cross-origin-opener-policy") && smoke.includes("cross-origin-embedder-policy"), "generic npm smoke server must provide COOP/COEP for pthread packages");
  const smokeWorkflow = await fs.readFile(path.join(root, ".github", "workflows", "npm-package-smoke.yml"), "utf8");
  need(smokeWorkflow.includes("options: [jq, libarchive, imagemagick, ghostscript, libvips]") && smokeWorkflow.includes("scripts/smoke-npm-package.mjs"), "generic npm smoke workflow must expose jq/libarchive/ImageMagick/Ghostscript/libvips selection");

  const promotion = await fs.readFile(path.join(root, "scripts", "prepare-promotion.mjs"), "utf8");
  need(!promotion.includes("pkg.npm.version = newBuilder"), "promotion must not couple npm package versions back to builder versions");
  need(promotion.includes("pkg.npm.version = newNpmVersion"), "promotion must independently patch-bump npm distribution versions");

  const doc = await fs.readFile(path.join(root, "docs", "NPM_DISTRIBUTION.md"), "utf8");
  need(doc.includes("@wasm-zoo/jq") && doc.includes("@wasm-zoo/libarchive") && doc.includes("@wasm-zoo/imagemagick") && doc.includes("@wasm-zoo/ghostscript") && doc.includes("@wasm-zoo/libvips"), "npm distribution docs must cover jq, libarchive, ImageMagick, Ghostscript and libvips");
  const jqMeta = await readJson(path.join(root, "packages", "jq", "package.json"));
  const libarchiveMeta = await readJson(path.join(root, "packages", "libarchive", "package.json"));
  const imagemagickMeta = await readJson(path.join(root, "packages", "imagemagick", "package.json"));
  const ghostscriptMeta = await readJson(path.join(root, "packages", "ghostscript", "package.json"));
  const libvipsMeta = await readJson(path.join(root, "packages", "libvips", "package.json"));
  need(jqMeta.npm?.status === "published" && libarchiveMeta.npm?.status === "published" && imagemagickMeta.npm?.status === "published" && ghostscriptMeta.npm?.status === "published", "jq, libarchive, ImageMagick and Ghostscript must be marked published after registry + browser gates pass");
  need(libvipsMeta.npm?.status === "canary", "libvips must remain canary until its bootstrap + live smoke complete");
  need(libvipsMeta.npm?.profile === "browser-core", "libvips npm distribution must pin browser-core");
  const libvipsConsumer = await fs.readFile(path.join(root, "builders", "libvips", "runtime", "wasm-zoo.mjs"), "utf8");
  need(libvipsConsumer.includes("options.coreJsUrl || options.jsUrl"), "libvips Consumer API must map bundler coreJsUrl to its jsUrl loader option");
  need(ghostscriptMeta.npm?.packageFiles?.requiredDirs?.includes("THIRD-PARTY-LICENSES"), "Ghostscript npm distribution must recursively preserve THIRD-PARTY-LICENSES");
  need(doc.includes("NPM_BOOTSTRAP_TOKEN") && doc.includes("brand-new"), "npm docs must explain temporary brand-new-package bootstrap credentials");
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
console.log(`[OK] WASM Zoo npm distribution contract checks passed for ${npmSlugs.join(", ")}`);
