import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadPackages, root, readJson } from "./lib.mjs";
import { npmDistributionSets } from "./npm-package-set.mjs";

const errors = [];
const need = (condition, message) => { if (!condition) errors.push(message); };
const normalizeLf = (text) => text.replace(/\r\n?/g, "\n");
const npmPackages = await loadPackages();
const npmSlugs = npmDistributionSets(npmPackages).all;

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
    const npmSource = npm.source || {};
    need(pkg.wasmZoo?.upstreamVersion === (npmSource.upstreamVersion || zoo.upstream.version), `${slug} npm metadata must retain the source upstream version`);
    need(pkg.wasmZoo?.builderVersion === (npmSource.builderVersion || zoo.zoo.builderVersion), `${slug} npm metadata must retain the source Zoo builder version`);
    need(pkg.wasmZoo?.npmVersion === npm.version, `${slug} npm metadata must record the npm distribution version`);
    need(pkg.publishConfig?.access === "public", `${slug} scoped npm package must publish with public access`);
    need(pkg.publishConfig?.provenance === true, `${slug} npm package must request provenance`);
    if (npm.registryShasum != null) {
      need(npm.status === "published", `${slug} registryShasum is only valid for a published npm package`);
      need(/^[a-f0-9]{40}$/.test(npm.registryShasum), `${slug} registryShasum must be a lowercase SHA-1`);
    }
    need(pkg.wasmZoo?.releaseTag === (npmSource.releaseTag || zoo.release.tag), `${slug} npm metadata must identify the immutable source release tag`);
    const profile = zoo.profiles.find((entry) => entry.id === npm.profile);
    need(pkg.wasmZoo?.releaseAsset === (npmSource.releaseAsset || profile?.releaseAsset), `${slug} npm metadata must identify the immutable source release asset`);
    need(pkg.exports?.["."] === `./${npm.entry}` && pkg.exports?.["./self-hosted"] === "./wasm-zoo.mjs", `${slug} npm exports must expose bundler and self-hosted entries`);

    const entry = await fs.readFile(path.join(output, npm.entry), "utf8");
    if (npm.runtime.consumerScript) {
      const consumer = await fs.readFile(path.join(output,"wasm-zoo.mjs"),"utf8");
      const reviewed = await fs.readFile(path.join(root,"builders",slug,"runtime",npm.runtime.consumerScript),"utf8");
      need(consumer===reviewed,`${slug} npm must install the reviewed CLI-specific Consumer API under its stable export`);
    }
    if (npm.runtime.workerScript) {
      const worker = await fs.readFile(path.join(output,npm.runtime.workerScript),"utf8");
      const reviewed = await fs.readFile(path.join(root,"builders",slug,"runtime",npm.runtime.workerScript),"utf8");
      need(worker===reviewed,`${slug} npm must overlay the reviewed dedicated Worker script`);
      need(entry.includes(`workerUrl: new URL("./${npm.runtime.workerScript}", import.meta.url)`) &&
        entry.includes("workerUrl: options.workerUrl || assets.workerUrl"),
        `${slug} Vite npm entry must emit/forward the classic Worker URL`);
    }
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

  const workflow = normalizeLf(await fs.readFile(path.join(root, ".github", "workflows", "publish-npm.yml"), "utf8"));
  need(workflow.includes("slug:\n        description: npm distribution package\n        required: true\n        type: string"),
    "npm distribution workflow must accept manifest-validated package slugs without a static package allowlist");
  need(workflow.includes("pkg.npm.status !== 'published'"), "npm distribution workflow must require published npm packages after v0.13 rollout");
  need(workflow.includes("options: [pack, stage]"), "npm distribution workflow must expose only pack/stage after the v0.13 rollout");
  need(workflow.includes("id-token: write"), "npm distribution workflow must request OIDC id-token permission");
  need(workflow.includes("npm stage publish"), "npm distribution workflow must support staged publishing for existing packages");
  const retiredBootstrapSecret = ["NPM", "BOOTSTRAP", "TOKEN"].join("_");
  const retiredDirectPublish = ["npm", "publish", "--access", "public"].join(" ");
  need(!workflow.includes(retiredBootstrapSecret) && !workflow.includes(retiredDirectPublish) && !workflow.includes("bootstrap"), "npm workflow must not retain temporary bootstrap/token/direct-publish paths after v0.13");
  need(workflow.includes("gh release download"), "npm workflow must package immutable GitHub Release assets");
  need(workflow.includes("pkg.npm.source?.releaseTag") && workflow.includes("pkg.npm.source?.releaseAsset"),
    "npm workflow must honor an independently pinned immutable npm source release");

  const smoke = await fs.readFile(path.join(root, "scripts", "smoke-npm-package.mjs"), "utf8");
  for (const slug of npmSlugs) need(smoke.includes(`${slug}:`), `generic npm smoke must have a real-operation fixture for published package ${slug}`);
  need(
    smoke.includes("vite") &&
    smoke.includes("playwright") &&
    smoke.includes('process.env.WASM_ZOO_NPM_BROWSER || "chromium"') &&
    smoke.includes('requireFromFixture("playwright")[selectedBrowser]') &&
    smoke.includes("browserType.launch("),
    "generic npm smoke must exercise Vite/Playwright and default to Chromium"
  );
  need(
    !smoke.includes("crossBrowserSlugs") &&
    smoke.includes('const localCanary = Boolean(localPackageSpec) && npmMeta?.status === "canary"') &&
    smoke.includes('npmMeta?.status !== "published" && !localCanary') &&
    smoke.includes("No published npm smoke fixture for") &&
    smoke.includes('assessThreadedRuntime') &&
    smoke.includes('if (requiresIsolation)') &&
    smoke.includes('selectedBrowser === "chromium" && onUnsupported === "record"') &&
    smoke.includes('compatibility.runtimeCapabilities') &&
    smoke.includes('compatibility.responseHeaders'),
    "cross-browser smoke runner must validate published manifests, require package-specific fixtures and rigorously preflight threaded browsers"
  );
  const compatWorkflow = normalizeLf(await fs.readFile(path.join(root, ".github", "workflows", "cross-browser-compat.yml"), "utf8"));
  need(
    compatWorkflow.includes("node scripts/npm-package-set.mjs --github-output") &&
    compatWorkflow.includes("all: ${{ steps.packages.outputs.all }}") &&
    compatWorkflow.includes("needs.package-set.outputs.all") &&
    compatWorkflow.includes("browser: [chromium, firefox, webkit]") &&
    compatWorkflow.includes("scripts/run-browser-compatibility-batch.mjs") &&
    compatWorkflow.includes("Install Playwright browser once for this job") &&
    !compatWorkflow.includes("matrix.slug") &&
    compatWorkflow.includes("matrix.browser") &&
    compatWorkflow.includes("upload-artifact@v4"),
    "cross-browser workflow must derive all published npm packages from reviewed manifests and batch them by browser"
  );
  const packageSetResolver = normalizeLf(await fs.readFile(path.join(root, "scripts", "npm-package-set.mjs"), "utf8"));
  need(
    compatWorkflow.includes("github.event_name") &&
    compatWorkflow.includes("--registry-ready") &&
    compatWorkflow.includes("steps.packages.outputs.deferred") &&
    packageSetResolver.includes("response.status === 404") &&
    packageSetResolver.includes("npm Registry preflight failed"),
    "pull-request compatibility matrices must defer only exact-version npm Registry 404s while non-404 Registry failures fail closed"
  );
  const compatBatch = normalizeLf(await fs.readFile(path.join(root, "scripts", "run-browser-compatibility-batch.mjs"), "utf8"));
  need(
    compatWorkflow.includes("name: Enforce observed threaded compatibility classifications") &&
    compatWorkflow.includes("node scripts/report-threaded-compatibility.mjs") &&
    compatWorkflow.includes("THREADED_TARGETS: ${{ needs.package-set.outputs.threaded }}") &&
    compatWorkflow.includes("--targets-json \"$THREADED_TARGETS\"") &&
    compatWorkflow.includes("pattern: browser-*-compatibility") &&
    compatWorkflow.includes("needs: [package-set, browser]") &&
    compatBatch.includes("--on-unsupported") &&
    compatBatch.includes('browser === "chromium" ? "error" : "record"') &&
    compatWorkflow.includes("upload-artifact@v4"),
    "browser-batched Lab must preserve independent threaded per-browser records and aggregate exactly the resolver-selected threaded package set"
  );
  const threadedReport = normalizeLf(await fs.readFile(path.join(root, "scripts", "report-threaded-compatibility.mjs"), "utf8"));
  need(
    threadedReport.includes('process.argv.indexOf("--targets-json")') &&
    threadedReport.includes("non-reviewed threaded package(s)") &&
    threadedReport.includes("new Set(parsed)"),
    "threaded aggregate reporter must accept only a deduplicated subset of reviewed threaded packages from the current matrix"
  );
  need(smoke.includes("http.createServer") && smoke.includes("cleanup complete"), "generic npm smoke must serve dist in-process and explicitly complete cleanup");
  need(!smoke.includes('"vite", "preview"') && !smoke.includes("preview.kill("), "generic npm smoke must not use a Vite preview child process");
  need(smoke.includes("makeTar") && smoke.includes('tool: "bsdtar"'), "libarchive live smoke must perform a real bsdtar archive operation");
  need(smoke.includes("output.png") && smoke.includes("PNG signature") && smoke.includes("readU32BE"), "ImageMagick live smoke must perform a real resize and validate emitted PNG bytes");
  need(smoke.includes("output.pdf") && smoke.includes("%PDF-") && smoke.includes("%%EOF"), "Ghostscript live smoke must convert PostScript to a PDF and validate its PDF framing");
  need(smoke.includes("qpdf:") && smoke.includes("makeQpdfOnePagePdf") && smoke.includes("--linearize") && smoke.includes("--encrypt") && smoke.includes("--decrypt"), "QPDF npm smoke must validate a real PDF through check/linearize/AES-256 encrypt/decrypt");
  need(smoke.includes("brotli:") && smoke.includes('["-q", "11"') && smoke.includes('["-t", "/payload.br"]') && smoke.includes('["-d", "-o", "/roundtrip.txt"'), "Brotli npm smoke must validate a real quality-11 compress/integrity/decompress byte-identical round trip");
  need(smoke.includes("libvips:") && smoke.includes("Image.newFromBuffer") && smoke.includes("writeToBuffer") && smoke.includes("crossOriginIsolated"), "libvips live smoke must exercise the library API under cross-origin isolation");
  need(smoke.includes("ffmpeg:") && smoke.includes("input.pcm") && smoke.includes("/output.wav") && smoke.includes("RIFF") && smoke.includes("WAVE"), "FFmpeg live smoke must convert raw PCM to WAV and validate RIFF/WAVE framing");
  need(smoke.includes("cross-origin-opener-policy") && smoke.includes("cross-origin-embedder-policy"), "generic npm smoke server must provide COOP/COEP for pthread packages");
  const smokeWorkflow = normalizeLf(await fs.readFile(path.join(root, ".github", "workflows", "npm-package-smoke.yml"), "utf8"));
  need(smokeWorkflow.includes("type: string") &&
    smokeWorkflow.includes("scripts/npm-package-set.mjs --baseline") &&
    smokeWorkflow.includes("scripts/npm-package-set.mjs --registry-ready --baseline") &&
    smokeWorkflow.includes("github.event_name") &&
    smokeWorkflow.includes("pull_request") &&
    smokeWorkflow.includes("scripts/smoke-npm-package.mjs") &&
    !smokeWorkflow.includes("echo 'slug=qpdf'"),
    "generic Registry smoke workflow must use a manifest-derived baseline, defer exact-version 404s only on pull requests, and avoid rollout-specific package targeting");

  const promotion = await fs.readFile(path.join(root, "scripts", "prepare-promotion.mjs"), "utf8");
  need(!promotion.includes("pkg.npm.version = newBuilder"), "promotion must not couple npm package versions back to builder versions");
  need(promotion.includes('note.includes("@wasm-zoo/qpdf")') && (await fs.readFile(path.join(root, "scripts", "upstream-config.mjs"), "utf8")).includes("qpdf:") && (await fs.readFile(path.join(root, "scripts", "upstream-config.mjs"), "utf8")).includes("keepNpmPinned: true"), "QPDF package promotion must keep the independently reviewed npm source identity pinned");
  need(promotion.includes("pkg.npm.version = newNpmVersion"), "promotion must independently patch-bump npm distribution versions");

  const doc = await fs.readFile(path.join(root, "docs", "NPM_DISTRIBUTION.md"), "utf8");
  for (const pkg of npmPackages.filter((item) => item.status === "available" && item.npm?.status === "published")) {
    need(doc.includes(pkg.npm.package), `npm distribution docs must cover published package ${pkg.npm.package}`);
  }
  const ghostscriptMeta = await readJson(path.join(root, "packages", "ghostscript", "package.json"));
  const libvipsMeta = await readJson(path.join(root, "packages", "libvips", "package.json"));
  const ffmpegMeta = await readJson(path.join(root, "packages", "ffmpeg", "package.json"));
  need(libvipsMeta.npm?.profile === "browser-core", "libvips npm distribution must pin browser-core");
  need(ffmpegMeta.npm?.profile === "browser-full", "FFmpeg npm distribution must pin the LGPL browser-full profile");
  need(ffmpegMeta.npm?.packageFiles?.required?.includes("LICENSES/FFmpeg-COPYING.LGPLv2.1"), "FFmpeg npm package must retain the LGPL license copy");
  need(!(ffmpegMeta.npm?.packageFiles?.required || []).some((rel) => rel.endsWith("/x264-COPYING") || rel.endsWith("/FFmpeg-COPYING.GPLv2")), "FFmpeg npm browser-full package must not accidentally include GPL/x264-only release files");
  const brotliMeta=await readJson(path.join(root,"packages/brotli/package.json"));
  need(brotliMeta.status==="available" && brotliMeta.npm?.status==="published" &&
    brotliMeta.npm?.package==="@wasm-zoo/brotli" && brotliMeta.npm?.version==="0.1.0" &&
    brotliMeta.npm?.profile==="browser-full" &&
    brotliMeta.npm?.source?.upstreamVersion==="1.2.0" &&
    brotliMeta.npm?.source?.builderVersion==="0.1.0" &&
    brotliMeta.npm?.source?.releaseTag==="brotli-v0.1.0" &&
    brotliMeta.npm?.source?.releaseAsset==="brotli-browser-full-1.2.0-zoo-0.1.0.zip" &&
    brotliMeta.npm?.source?.commit==="028fb5a23661f123017c060daa546b55cf4bde29" &&
    brotliMeta.npm?.registryShasum==="6d66df90e8d472e5f2e24e1c1c1ec547ea6923a7",
    "Published Brotli npm 0.1.0 must stay bound to the exact three-browser-verified brotli-v0.1.0 tarball and reviewed Registry SHA-1");
  need(brotliMeta.npm?.packageFiles?.requiredDirs?.includes("LICENSES"),
    "Published Brotli npm must recursively preserve the upstream MIT license notice");
  const brotliCanary=await fs.readFile(path.join(root,".github/workflows/npm-brotli-canary.yml"),"utf8");
  need(brotliCanary.includes("sha256sum -c SHA256SUMS.txt") &&
    brotliCanary.includes("scripts/verify-npm-brotli-release.mjs") &&
    brotliCanary.includes("browser: [chromium, firefox, webkit]") &&
    brotliCanary.includes("WASM_ZOO_NPM_PACKAGE_SPEC") &&
    !brotliCanary.includes("npm publish") && !brotliCanary.includes("npm stage publish"),
    "Brotli immutable Release npm canary must verify checksums, pack only and run all three browsers without Registry writes");
  need(brotliCanary.includes("wasm-zoo-brotli-*.tgz") &&
    brotliCanary.includes("reviewed-brotli-npm-${{ github.sha }}"),
    "Brotli immutable Release npm canary must discover the manifest-versioned reviewed tarball without hardcoding an artifact filename");

  const qpdfMeta=await readJson(path.join(root,"packages/qpdf/package.json"));
  need(qpdfMeta.status==="available" && qpdfMeta.npm?.status==="published" &&
    qpdfMeta.npm?.package==="@wasm-zoo/qpdf" && qpdfMeta.npm?.version==="0.1.1" &&
    qpdfMeta.npm?.profile==="browser-full" && qpdfMeta.npm?.source?.upstreamVersion==="12.4.2" &&
    qpdfMeta.npm?.source?.builderVersion==="0.1.1" &&
    qpdfMeta.npm?.source?.commit==="4eba95899886e851cc41d76886483b347612f2a8" &&
    qpdfMeta.npm?.source?.releaseTag==="qpdf-v0.1.1" &&
    qpdfMeta.npm?.source?.releaseAsset==="qpdf-browser-full-12.4.2-zoo-0.1.1.zip" &&
    qpdfMeta.npm?.registryShasum==="53714e9a98edca7fbe775b5028adde7719e86625",
    "Published QPDF npm 0.1.1 must target immutable qpdf-v0.1.1 browser-full and retain the exact reviewed Registry SHA-1");
  need(qpdfMeta.npm?.packageFiles?.requiredDirs?.includes("LICENSES"),
    "Published QPDF npm must recursively preserve QPDF/zlib/libjpeg release notices");
  need(smoke.includes("npmMeta.registryShasum") && smoke.includes("dist.shasum"),
    "Live Registry-backed smokes must verify recorded reviewed tarball SHA-1 identities");

  const qpdfCanary=await fs.readFile(path.join(root,".github/workflows/npm-qpdf-canary.yml"),"utf8");
  need(qpdfCanary.includes("sha256sum -c SHA256SUMS.txt") &&
    qpdfCanary.includes("scripts/verify-npm-qpdf-release.mjs") &&
    qpdfCanary.includes("browser: [chromium, firefox, webkit]") &&
    qpdfCanary.includes("WASM_ZOO_NPM_PACKAGE_SPEC") &&
    !qpdfCanary.includes("npm publish") && !qpdfCanary.includes("npm stage publish"),
    "QPDF immutable Release npm canary must verify checksums, pack only and run all three browsers without Registry writes");
  need(qpdfCanary.includes("wasm-zoo-qpdf-*.tgz") &&
    qpdfCanary.includes("reviewed-qpdf-npm-${{ github.sha }}") &&
    !qpdfCanary.includes("wasm-zoo-qpdf-0.1.0.tgz") &&
    !qpdfCanary.includes("reviewed-qpdf-npm-0.1.0-"),
    "QPDF immutable Release npm canary must discover the reviewed tarball from manifest-driven npm versioning instead of hardcoding a historical npm version");

  const zstdMeta=await readJson(path.join(root,"packages/zstd/package.json"));
  need(zstdMeta.status==="available" && zstdMeta.npm?.status==="published" &&
    zstdMeta.npm?.package==="@wasm-zoo/zstd" && zstdMeta.npm?.version==="0.3.0" &&
    zstdMeta.npm?.profile==="browser-full" && zstdMeta.tracker?.candidateMode==="auto" &&
    zstdMeta.npm?.source?.upstreamVersion==="1.5.7" &&
    zstdMeta.npm?.source?.builderVersion==="0.3.0" &&
    zstdMeta.npm?.source?.commit==="f8745da6ff1ad1e7bab384bd1f9d742439278e99" &&
    zstdMeta.npm?.source?.releaseTag==="zstd-v0.3.0" &&
    zstdMeta.npm?.source?.releaseAsset==="zstd-browser-full-1.5.7-zoo-0.3.0.zip",
    "Published Zstandard npm must retain its immutable source release while package updates use review-only candidate automation");
  need(zstdMeta.npm?.registryShasum==="29add1aaf6ab0c3e9a3d538166a51a3f70cefa99",
    "Published Zstandard npm metadata must retain the exact reviewed Registry SHA-1");
  need(zstdMeta.npm.runtime.consumerScript==="wasm-zoo-cli.mjs" &&
    zstdMeta.npm.runtime.workerScript==="browser-zstd-cli-worker.js",
    "Zstandard npm must use the published CLI, not the separately published browser-core library API");
  const zstdCanary=await fs.readFile(path.join(root,".github/workflows/npm-zstd-canary.yml"),"utf8");
  need(zstdCanary.includes("sha256sum -c SHA256SUMS.txt") &&
    zstdCanary.includes("scripts/verify-npm-zstd-release.mjs") &&
    zstdCanary.includes("matrix:") && zstdCanary.includes("browser: [chromium, firefox, webkit]") &&
    zstdCanary.includes("WASM_ZOO_NPM_PACKAGE_SPEC") &&
    !zstdCanary.includes("npm publish") && !zstdCanary.includes("npm stage publish"),
    "The Zstandard immutable Release tarball regression gate must pack only and run all three browser tests");
  const libvipsConsumer = await fs.readFile(path.join(root, "builders", "libvips", "runtime", "wasm-zoo.mjs"), "utf8");
  need(libvipsConsumer.includes("options.coreJsUrl || options.jsUrl"), "libvips Consumer API must map bundler coreJsUrl to its jsUrl loader option");
  need(ghostscriptMeta.npm?.packageFiles?.requiredDirs?.includes("THIRD-PARTY-LICENSES"), "Ghostscript npm distribution must recursively preserve THIRD-PARTY-LICENSES");
  need(!doc.includes(retiredBootstrapSecret) && doc.includes("Trusted Publisher") && doc.includes("stage"), "npm docs must describe the post-rollout Trusted Publisher/staged-publishing model without bootstrap credentials");
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
