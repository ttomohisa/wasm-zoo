import fs from "node:fs/promises";
import path from "node:path";
import { loadPackages, readEnv, readJson, root } from "./lib.mjs";

const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };
const isHttps = (value) => typeof value === "string" && value.startsWith("https://");
const packages = await loadPackages();
const seen = new Set();

for (const pkg of packages) {
  const at = `packages/${pkg.slug || "?"}/package.json`;
  assert(pkg.schemaVersion === 1, `${at}: schemaVersion must be 1`);
  assert(/^[a-z0-9][a-z0-9-]*$/.test(pkg.slug || ""), `${at}: invalid slug`);
  assert(!seen.has(pkg.slug), `${at}: duplicate slug ${pkg.slug}`);
  seen.add(pkg.slug);
  assert(["available", "experimental", "planned", "paused"].includes(pkg.status), `${at}: invalid status`);
  assert(isHttps(pkg.upstream?.homepage), `${at}: upstream.homepage must use https`);
  assert(isHttps(pkg.upstream?.repository), `${at}: upstream.repository must use https`);
  assert(typeof pkg.upstream?.license === "string" && pkg.upstream.license.length > 0, `${at}: upstream.license is required`);
  assert(typeof pkg.tracker?.repository === "string" && pkg.tracker.repository.includes("/"), `${at}: tracker.repository is required`);
  assert(Array.isArray(pkg.profiles), `${at}: profiles must be an array`);

  const profileIds = new Set();
  for (const profile of pkg.profiles || []) {
    assert(profile.id && !profileIds.has(profile.id), `${at}: duplicate/empty profile id ${profile.id || "?"}`);
    profileIds.add(profile.id);
    assert(profile.target === "browser" || profile.target === "wasi", `${at}: profile ${profile.id} has invalid target`);
    assert(typeof profile.binaryLicense === "string" && profile.binaryLicense.length > 0, `${at}: profile ${profile.id} binaryLicense is required`);
  }

  if (pkg.status === "available") {
    assert(Boolean(pkg.upstream.version), `${at}: available package needs upstream.version`);
    assert(Boolean(pkg.zoo?.builderVersion), `${at}: available package needs zoo.builderVersion`);
    assert(pkg.profiles.length > 0, `${at}: available package needs at least one profile`);
    assert(typeof pkg.integration?.summary === "string" && pkg.integration.summary.length > 0, `${at}: available package needs integration.summary`);
    assert(Array.isArray(pkg.integration?.files) && pkg.integration.files.length > 0 && pkg.integration.files.every((file) => typeof file === "string" && file.length > 0), `${at}: available package needs integration.files`);
    assert(typeof pkg.integration?.example === "string" && pkg.integration.example.length > 0, `${at}: available package needs integration.example`);
    if (pkg.integration?.notes !== undefined) assert(Array.isArray(pkg.integration.notes) && pkg.integration.notes.every((note) => typeof note === "string" && note.length > 0), `${at}: integration.notes must be a string array`);
    if (pkg.release) {
      assert(typeof pkg.release.tag === "string" && pkg.release.tag.length > 0, `${at}: release.tag is required when release metadata is present`);
      assert(isHttps(pkg.release.page), `${at}: release.page must use https`);
      assert(isHttps(pkg.release.downloadBase), `${at}: release.downloadBase must use https`);
      assert(typeof pkg.release.sourceAsset === "string" && pkg.release.sourceAsset.length > 0, `${at}: release.sourceAsset is required`);
      assert(typeof pkg.release.checksumsAsset === "string" && pkg.release.checksumsAsset.length > 0, `${at}: release.checksumsAsset is required`);
      for (const profile of pkg.profiles) {
        assert(typeof profile.releaseAsset === "string" && profile.releaseAsset.length > 0, `${at}: profile ${profile.id} needs releaseAsset`);
      }
    }
  }
}

const ffmpeg = packages.find((pkg) => pkg.slug === "ffmpeg");
if (ffmpeg) {
  const env = await readEnv(path.join(root, "builders", "ffmpeg", "versions.env"));
  assert(env.FFMPEG_REF === `n${ffmpeg.upstream.version}`, `FFmpeg catalog version ${ffmpeg.upstream.version} does not match builders/ffmpeg FFMPEG_REF=${env.FFMPEG_REF}`);
  assert(env.BUILDER_VERSION === ffmpeg.zoo.builderVersion, `FFmpeg builderVersion ${ffmpeg.zoo.builderVersion} does not match versions.env ${env.BUILDER_VERSION}`);
  assert(Boolean(env.FFMPEG_COMMIT), "builders/ffmpeg/versions.env: FFMPEG_COMMIT is missing");
  assert(Boolean(env.EMSCRIPTEN_COMMIT), "builders/ffmpeg/versions.env: EMSCRIPTEN_COMMIT is missing");
  const ids = new Set(ffmpeg.profiles.map((profile) => profile.id));
  assert(ids.has("browser-full"), "FFmpeg catalog must publish browser-full");
  assert(ids.has("browser-full-gpl"), "FFmpeg catalog must publish browser-full-gpl");
  for (const profile of ffmpeg.profiles) {
    assert(profile.arbitraryCli === true, `FFmpeg profile ${profile.id} must expose the generic upstream CLI`);
    assert(profile.threads === true && profile.sharedArrayBuffer === true, `FFmpeg profile ${profile.id} must declare pthread/SAB requirements`);
    assert(profile.simd === true, `FFmpeg profile ${profile.id} must declare WASM SIMD`);
    assert(profile.playground === true, `FFmpeg profile ${profile.id} must be enabled in the Playground`);
    assert(profile.playgroundPath === "./ffmpeg-playground/", `FFmpeg profile ${profile.id} must link to the FFmpeg Playground`);
  }
  assert(ffmpeg.release?.tag === `ffmpeg-v${ffmpeg.zoo.builderVersion}`, `FFmpeg release tag must match builderVersion ${ffmpeg.zoo.builderVersion}`);
  assert(ffmpeg.release?.page?.includes(ffmpeg.release.tag), "FFmpeg release.page must point at the declared tag");
  assert(ffmpeg.release?.downloadBase?.includes(ffmpeg.release.tag), "FFmpeg release.downloadBase must point at the declared tag");
  for (const profile of ffmpeg.profiles) {
    const expectedAsset = `ffmpeg-${profile.id}-${ffmpeg.upstream.version}-zoo-${ffmpeg.zoo.builderVersion}.zip`;
    assert(profile.releaseAsset === expectedAsset, `FFmpeg profile ${profile.id} releaseAsset must be ${expectedAsset}`);
  }
  const expectedSource = `ffmpeg-sources-${ffmpeg.upstream.version}-zoo-${ffmpeg.zoo.builderVersion}.tar.gz`;
  assert(ffmpeg.release?.sourceAsset === expectedSource, `FFmpeg release.sourceAsset must be ${expectedSource}`);
  assert(ffmpeg.release?.checksumsAsset === "SHA256SUMS.txt", "FFmpeg release.checksumsAsset must be SHA256SUMS.txt");
  assert(ffmpeg.integration?.example?.includes("WasmZooFFmpeg.loadHosted"), "FFmpeg integration example must use the public runtime wrapper");
  assert(ffmpeg.integration?.example?.includes("ffmpeg.dispose()"), "FFmpeg integration example must dispose the runner");
}

const libarchive = packages.find((pkg) => pkg.slug === "libarchive");
if (libarchive) {
  const env = await readEnv(path.join(root, "builders", "libarchive", "versions.env"));
  assert(env.LIBARCHIVE_REF === `v${libarchive.upstream.version}`, `libarchive catalog version ${libarchive.upstream.version} does not match LIBARCHIVE_REF=${env.LIBARCHIVE_REF}`);
  assert(env.BUILDER_VERSION === libarchive.zoo.builderVersion, `libarchive builderVersion ${libarchive.zoo.builderVersion} does not match versions.env ${env.BUILDER_VERSION}`);
  assert(env.LIBARCHIVE_COMMIT === "27cbc7827172698143e440801fc0ba39ccb4f1f5", "libarchive exact v3.8.9 commit pin is missing");
  const ids = new Set(libarchive.profiles.map((profile) => profile.id));
  assert(ids.has("browser-full"), "libarchive catalog must publish browser-full");
  for (const profile of libarchive.profiles) {
    assert(profile.arbitraryCli === true, `libarchive profile ${profile.id} must expose upstream CLI arguments`);
    assert(profile.threads === false && profile.sharedArrayBuffer === false, `libarchive profile ${profile.id} must remain single-threaded/no-SAB in v0.3.0`);
    assert(profile.playground === true, `libarchive profile ${profile.id} must be enabled in the Playground`);
    assert(profile.playgroundPath === "./libarchive-playground/", `libarchive profile ${profile.id} must link to libarchive Playground`);
  }
  assert(libarchive.release?.tag === `libarchive-v${libarchive.zoo.builderVersion}`, `libarchive release tag must match builderVersion ${libarchive.zoo.builderVersion}`);
  const expectedAsset = `libarchive-browser-full-${libarchive.upstream.version}-zoo-${libarchive.zoo.builderVersion}.zip`;
  assert(libarchive.profiles[0]?.releaseAsset === expectedAsset, `libarchive browser-full releaseAsset must be ${expectedAsset}`);
  const expectedSource = `libarchive-sources-${libarchive.upstream.version}-zoo-${libarchive.zoo.builderVersion}.tar.gz`;
  assert(libarchive.release?.sourceAsset === expectedSource, `libarchive release.sourceAsset must be ${expectedSource}`);
  assert(libarchive.integration?.example?.includes("WasmZooLibarchive.loadHosted"), "libarchive integration example must use the public runtime wrapper");
  assert(libarchive.integration?.example?.includes("archive.dispose()"), "libarchive integration example must dispose the runner");
}


const imagemagick = packages.find((pkg) => pkg.slug === "imagemagick");
if (imagemagick) {
  const env = await readEnv(path.join(root, "builders", "imagemagick", "versions.env"));
  assert(env.IMAGEMAGICK_REF === imagemagick.upstream.version, `ImageMagick catalog version ${imagemagick.upstream.version} does not match IMAGEMAGICK_REF=${env.IMAGEMAGICK_REF}`);
  assert(env.BUILDER_VERSION === imagemagick.zoo.builderVersion, `ImageMagick builderVersion ${imagemagick.zoo.builderVersion} does not match versions.env ${env.BUILDER_VERSION}`);
  const ids = new Set(imagemagick.profiles.map((profile) => profile.id));
  assert(ids.has("browser-full"), "ImageMagick catalog must publish browser-full");
  for (const profile of imagemagick.profiles) {
    assert(profile.arbitraryCli === true, `ImageMagick profile ${profile.id} must expose upstream CLI arguments`);
    assert(profile.threads === false && profile.sharedArrayBuffer === false, `ImageMagick profile ${profile.id} must remain single-threaded/no-SAB in v0.4.0`);
    assert(profile.playground === true, `ImageMagick profile ${profile.id} must be enabled in the Playground`);
    assert(profile.playgroundPath === "./imagemagick-playground/", `ImageMagick profile ${profile.id} must link to the ImageMagick Playground`);
  }
  assert(imagemagick.release?.tag === `imagemagick-v${imagemagick.zoo.builderVersion}`, `ImageMagick release tag must match builderVersion ${imagemagick.zoo.builderVersion}`);
  const expectedAsset = `imagemagick-browser-full-${imagemagick.upstream.version}-zoo-${imagemagick.zoo.builderVersion}.zip`;
  assert(imagemagick.profiles[0]?.releaseAsset === expectedAsset, `ImageMagick browser-full releaseAsset must be ${expectedAsset}`);
  const expectedSource = `imagemagick-sources-${imagemagick.upstream.version}-zoo-${imagemagick.zoo.builderVersion}.tar.gz`;
  assert(imagemagick.release?.sourceAsset === expectedSource, `ImageMagick release.sourceAsset must be ${expectedSource}`);
  assert(imagemagick.integration?.example?.includes("WasmZooImageMagick.loadHosted"), "ImageMagick integration example must use the public runtime wrapper");
  assert(imagemagick.integration?.example?.includes("magick.dispose()"), "ImageMagick integration example must dispose the runner");
}

const libvips = packages.find((pkg) => pkg.slug === "libvips");
if (libvips) {
  const env = await readEnv(path.join(root, "builders", "libvips", "versions.env"));
  assert(env.LIBVIPS_REF === `v${libvips.upstream.version}`, `libvips catalog version ${libvips.upstream.version} does not match LIBVIPS_REF=${env.LIBVIPS_REF}`);
  assert(env.BUILDER_VERSION === libvips.zoo.builderVersion, `libvips builderVersion ${libvips.zoo.builderVersion} does not match versions.env ${env.BUILDER_VERSION}`);
  assert(env.LIBVIPS_COMMIT === "7c28da9c2b8b5b8defe54f2ae92ee474c0e2d6e4", "libvips exact v8.18.5 commit pin is missing");
  assert(env.EMSCRIPTEN_COMMIT === "4483d70a78098ed5d860dff2dc21f3025b2da2ee", "libvips exact Emscripten 6.0.7 commit pin is missing");
  assert(env.WASM_VIPS_COMMIT === "ec8ead9f9c7cf2b08025736d76d10505984daf77", "libvips wasm-vips adapter commit pin is missing");
  const ids = new Set(libvips.profiles.map((profile) => profile.id));
  assert(ids.has("browser-core"), "libvips catalog must publish browser-core");
  assert(ids.has("browser-full"), "libvips catalog must publish browser-full");
  for (const profile of libvips.profiles) {
    assert(profile.arbitraryCli === false, `libvips profile ${profile.id} must publish the library API rather than a synthetic CLI`);
    assert(profile.threads === true && profile.sharedArrayBuffer === true, `libvips profile ${profile.id} must declare pthread/SAB requirements`);
    assert(profile.simd === true, `libvips profile ${profile.id} must declare WASM SIMD`);
    assert(profile.playground === true, `libvips profile ${profile.id} must be enabled in the Playground`);
    assert(profile.playgroundPath === "./libvips-playground/", `libvips profile ${profile.id} must link to the libvips Playground`);
  }
  assert(libvips.release?.tag === `libvips-v${libvips.zoo.builderVersion}`, `libvips release tag must match builderVersion ${libvips.zoo.builderVersion}`);
  for (const profileId of ["browser-core", "browser-full"]) {
    const profile = libvips.profiles.find((entry) => entry.id === profileId);
    const expectedAsset = `libvips-${profileId}-${libvips.upstream.version}-zoo-${libvips.zoo.builderVersion}.zip`;
    assert(profile?.releaseAsset === expectedAsset, `libvips ${profileId} releaseAsset must be ${expectedAsset}`);
  }
  const core = libvips.profiles.find((entry) => entry.id === "browser-core");
  assert(core?.features?.some((feature) => feature.includes("JPEG / PNG / WebP")), "libvips browser-core must declare JPEG/PNG/WebP support");
  assert(core?.features?.some((feature) => feature.includes("TIFF / GIF") && feature.includes("removed")), "libvips browser-core must declare TIFF/GIF removal");
  const expectedSource = `libvips-sources-${libvips.upstream.version}-zoo-${libvips.zoo.builderVersion}.tar.gz`;
  assert(libvips.release?.sourceAsset === expectedSource, `libvips release.sourceAsset must be ${expectedSource}`);
  assert(libvips.integration?.example?.includes("WasmZooLibvips.loadHosted"), "libvips integration example must use the public runtime loader");
  assert(libvips.integration?.example?.includes("Image.newFromBuffer"), "libvips integration example must exercise the image library API");
}

const requiredSiteFiles = [
  "site/ffmpeg-playground/index.html",
  "site/ffmpeg-playground/app.js",
  "site/ffmpeg-playground/coi-bootstrap.js",
  "site/playground.css",
  "site/coi-serviceworker.js",
  "site/playground/index.html",
  "site/playground/coi-serviceworker.js",
  "site/libarchive-playground/index.html",
  "site/libarchive-playground/app.js",
  "site/libarchive-playground/playground.css",
  "site/imagemagick-playground/index.html",
  "site/imagemagick-playground/app.js",
  "site/imagemagick-playground/playground.css",
  "site/libvips-playground/index.html",
  "site/libvips-playground/app.js",
  "site/libvips-playground/playground.css",
];
for (const rel of requiredSiteFiles) {
  try { await fs.access(path.join(root, rel)); } catch { errors.push(`${rel} is missing`); }
}
try {
  const sw = await fs.readFile(path.join(root, "site/coi-serviceworker.js"), "utf8");
  assert(sw.includes("Cross-Origin-Opener-Policy") && sw.includes("same-origin"), "Site-root Service Worker must add COOP");
  assert(sw.includes("Cross-Origin-Embedder-Policy") && sw.includes("require-corp"), "Site-root Service Worker must add COEP");
  const bootstrap = await fs.readFile(path.join(root, "site/ffmpeg-playground/coi-bootstrap.js"), "utf8");
  assert(bootstrap.includes("../coi-serviceworker.js"), "Playground must register the isolation Service Worker from the site root");
  assert(bootstrap.includes("scope: rootScopeUrl"), "Playground isolation Service Worker must use the WASM Zoo site-root scope");
  assert(bootstrap.includes("getRegistrations") && bootstrap.includes("unregister"), "FFmpeg Playground must migrate legacy scoped Service Worker registrations");
  const legacyPlayground = await fs.readFile(path.join(root, "site/playground/index.html"), "utf8");
  assert(legacyPlayground.includes("../ffmpeg-playground/"), "Legacy /playground/ URL must redirect to /ffmpeg-playground/");
  const pages = await fs.readFile(path.join(root, ".github/workflows/pages.yml"), "utf8");
  assert(pages.includes("gh release download"), "Pages workflow must stage the published release, not rebuild a separate Playground core");
  assert(pages.includes("site/assets/ffmpeg"), "Pages workflow must stage FFmpeg cores under site/assets/ffmpeg");
  assert(pages.includes("cp builders/ffmpeg/runtime/browser-ffmpeg.js"), "Pages workflow must use the current runtime wrapper with the published core");
  assert(pages.includes('"builders/ffmpeg/runtime/browser-ffmpeg.js"'), "Pages workflow must redeploy when the FFmpeg runtime wrapper changes");
  assert(pages.includes("site/assets/libarchive"), "Pages workflow must stage libarchive cores under site/assets/libarchive");
  assert(pages.includes("cp builders/libarchive/runtime/browser-libarchive.js"), "Pages workflow must use the current libarchive runtime wrapper");
  assert(pages.includes('"builders/libarchive/runtime/browser-libarchive.js"'), "Pages workflow must redeploy when the libarchive runtime wrapper changes");
  assert(pages.includes("site/assets/imagemagick"), "Pages workflow must stage ImageMagick cores under site/assets/imagemagick");
  assert(pages.includes("cp builders/imagemagick/runtime/browser-imagemagick.js"), "Pages workflow must use the current ImageMagick runtime wrapper");
  assert(pages.includes('"builders/imagemagick/runtime/browser-imagemagick.js"'), "Pages workflow must redeploy when the ImageMagick runtime wrapper changes");
  assert(pages.includes("site/assets/libvips"), "Pages workflow must stage libvips cores under site/assets/libvips");
  assert(pages.includes("cp builders/libvips/runtime/browser-libvips.js"), "Pages workflow must use the current libvips runtime wrapper");
  assert(pages.includes('"builders/libvips/runtime/browser-libvips.js"'), "Pages workflow must redeploy when the libvips runtime wrapper changes");
  const runtime = await fs.readFile(path.join(root, "builders/ffmpeg/runtime/browser-ffmpeg.js"), "utf8");
  assert(runtime.includes('self.addEventListener("error"'), "FFmpeg runtime wrapper must surface asynchronous pthread worker errors");
  const imageRuntime = await fs.readFile(path.join(root, "builders/imagemagick/runtime/browser-imagemagick.js"), "utf8");
  assert(!imageRuntime.includes("mainScriptUrlOrBlob") && !imageRuntime.includes("SharedArrayBuffer"), "ImageMagick runtime must stay single-threaded and must not require pthread bootstrap/SAB support");
  const vipsRuntime = await fs.readFile(path.join(root, "builders/libvips/runtime/browser-libvips.js"), "utf8");
  assert(vipsRuntime.includes("crossOriginIsolated") && vipsRuntime.includes("SharedArrayBuffer"), "libvips runtime must enforce cross-origin isolation for pthreads");
  const siteApp = await fs.readFile(path.join(root, "site/app.js"), "utf8");
  assert(siteApp.includes("Use in your app") && siteApp.includes("data-copy-code"), "Package details must render integration guidance with copyable examples");
  const readme = await fs.readFile(path.join(root, "README.md"), "utf8");
  assert(!readme.includes('ffmpeg-v0.2.6 -m "WASM Zoo FFmpeg v0.2.5"'), "README release tag example has a stale v0.2.5 message");
} catch (error) {
  errors.push(`site/release validation failed: ${error.message}`);
}

const catalogPath = path.join(root, "site", "catalog.json");
try {
  const catalog = await readJson(catalogPath);
  assert(catalog.stats?.packages === packages.length, "site/catalog.json is stale; run npm run catalog");
  assert(catalog.project?.name === "WASM Zoo", "site/catalog.json project metadata is invalid");
} catch {
  errors.push("site/catalog.json is missing or invalid; run npm run catalog");
}

const forbidden = ["/mnt" + "/data/", "C:" + "\\\\Users\\\\"];
async function scan(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist", "build", "release"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (/\.(?:md|json|mjs|js|html|css|yml|yaml|sh|ps1|bat|env|txt)$/.test(entry.name)) {
      const text = await fs.readFile(full, "utf8").catch(() => "");
      for (const marker of forbidden) assert(!text.includes(marker), `${path.relative(root, full)} contains local path ${marker}`);
    }
  }
}
await scan(root);

if (errors.length) {
  console.error(`\n[NG] ${errors.length} validation error(s):`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[OK] validated ${packages.length} package definitions`);
