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
  assert(pkg.schemaVersion === 2, `${at}: schemaVersion must be 2`);
  assert(/^[a-z0-9][a-z0-9-]*$/.test(pkg.slug || ""), `${at}: invalid slug`);
  assert(!seen.has(pkg.slug), `${at}: duplicate slug ${pkg.slug}`);
  seen.add(pkg.slug);
  assert(["available", "experimental", "planned", "paused"].includes(pkg.status), `${at}: invalid status`);
  assert(isHttps(pkg.upstream?.homepage), `${at}: upstream.homepage must use https`);
  assert(isHttps(pkg.upstream?.repository), `${at}: upstream.repository must use https`);
  assert(typeof pkg.upstream?.license === "string" && pkg.upstream.license.length > 0, `${at}: upstream.license is required`);
  assert(typeof pkg.tracker?.repository === "string" && pkg.tracker.repository.includes("/"), `${at}: tracker.repository is required`);
  assert(["github-releases", "github-tags"].includes(pkg.tracker?.type), `${at}: tracker.type is invalid`);
  assert(["auto", "adapter-gated", "none"].includes(pkg.tracker?.candidateMode), `${at}: tracker.candidateMode is invalid`);
  assert(Array.isArray(pkg.tracker?.candidateProfiles), `${at}: tracker.candidateProfiles must be an array`);
  assert(Array.isArray(pkg.profiles), `${at}: profiles must be an array`);
  if (pkg.referenceWasm) {
    assert(typeof pkg.referenceWasm.name === "string" && pkg.referenceWasm.name.length > 0, `${at}: referenceWasm.name is required`);
    assert(typeof pkg.referenceWasm.packageVersion === "string" && pkg.referenceWasm.packageVersion.length > 0, `${at}: referenceWasm.packageVersion is required`);
    assert(isHttps(pkg.referenceWasm.repository), `${at}: referenceWasm.repository must use https`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(pkg.referenceWasm.checkedAt || ""), `${at}: referenceWasm.checkedAt must be YYYY-MM-DD`);
  }

  const profileIds = new Set();
  for (const profile of pkg.profiles || []) {
    assert(profile.id && !profileIds.has(profile.id), `${at}: duplicate/empty profile id ${profile.id || "?"}`);
    profileIds.add(profile.id);
    assert(profile.target === "browser" || profile.target === "wasi", `${at}: profile ${profile.id} has invalid target`);
    assert(typeof profile.binaryLicense === "string" && profile.binaryLicense.length > 0, `${at}: profile ${profile.id} binaryLicense is required`);
  }

  const matrixStates = new Set(["included", "excluded", "na", "optional", "platform", "unknown"]);
  assert(Array.isArray(pkg.capabilityMatrix), `${at}: capabilityMatrix must be an array`);
  for (const [index, row] of (pkg.capabilityMatrix || []).entries()) {
    assert(typeof row.feature === "string" && row.feature.length > 0, `${at}: capabilityMatrix[${index}].feature is required`);
    assert(matrixStates.has(row.native), `${at}: capabilityMatrix[${index}].native has invalid state ${row.native}`);
    assert(row.profiles && typeof row.profiles === "object" && !Array.isArray(row.profiles), `${at}: capabilityMatrix[${index}].profiles is required`);
    for (const profile of pkg.profiles || []) assert(matrixStates.has(row.profiles?.[profile.id]), `${at}: capabilityMatrix[${index}] missing/invalid state for ${profile.id}`);
    assert(typeof row.note === "string" && row.note.length > 0, `${at}: capabilityMatrix[${index}].note is required`);
  }

  if (pkg.status === "available") {
    assert(Boolean(pkg.upstream.version), `${at}: available package needs upstream.version`);
    assert(Boolean(pkg.zoo?.builderVersion), `${at}: available package needs zoo.builderVersion`);
    assert(pkg.zoo?.supplyChainMetadata === true, `${at}: available package must enable supply-chain metadata`);
    assert(String(pkg.zoo?.provenance || "").includes("SLSA Provenance v1"), `${at}: available package must declare SLSA provenance`);
    assert(String(pkg.zoo?.sbom || "").includes("CycloneDX 1.6"), `${at}: available package must declare CycloneDX 1.6 SBOM`);
    assert(pkg.profiles.length > 0, `${at}: available package needs at least one profile`);
    assert(pkg.capabilityMatrix.length > 0, `${at}: available package needs a capabilityMatrix`);
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
  assert(/^[0-9a-f]{40}$/i.test(env.LIBARCHIVE_COMMIT || ""), "libarchive exact 40-character commit pin is missing");
  const ids = new Set(libarchive.profiles.map((profile) => profile.id));
  assert(ids.has("browser-full"), "libarchive catalog must publish browser-full");
  for (const profile of libarchive.profiles) {
    assert(profile.arbitraryCli === true, `libarchive profile ${profile.id} must expose upstream CLI arguments`);
    assert(profile.threads === false && profile.sharedArrayBuffer === false, `libarchive profile ${profile.id} must remain single-threaded/no-SAB in browser-full`);
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
    assert(profile.threads === false && profile.sharedArrayBuffer === false, `ImageMagick profile ${profile.id} must remain single-threaded/no-SAB`);
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
  assert(env.LIBVIPS_COMMIT === "426af3f44246fce9cfa8dd51a353aa4dfd48c553", "libvips exact v8.18.6 commit pin is missing");
  assert(env.EMSCRIPTEN_COMMIT === "aeb67926e7de656da38bc807d83050af93578758", "libvips exact Emscripten 6.0.8 commit pin is missing");
  assert(env.WASM_VIPS_COMMIT === "79103664d21ce00982e80571cf12f58bd3dcc5f3", "libvips wasm-vips 8.18.6 adapter commit pin is missing");
  assert(env.WASM_VIPS_VERSION === "0.0.18", "libvips wasm-vips adapter version pin is missing");
  assert(env.WASM_VIPS_LIBVIPS_PATCH_COMMIT === "13e85e04f69050fe634fa24539a045be731838fd", "libvips wasm-vips compatibility patch commit pin is missing");
  assert(env.WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT === "4bc39ffdd215e69e29d1b01c93217334cc732bd4", "libvips Emscripten compatibility patch commit pin is missing");
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

const ghostscript = packages.find((pkg) => pkg.slug === "ghostscript");
if (ghostscript) {
  const env = await readEnv(path.join(root, "builders", "ghostscript", "versions.env"));
  assert(env.GHOSTSCRIPT_VERSION === ghostscript.upstream.version, `Ghostscript catalog version ${ghostscript.upstream.version} does not match GHOSTSCRIPT_VERSION=${env.GHOSTSCRIPT_VERSION}`);
  assert(env.GHOSTSCRIPT_REF === ghostscript.upstream.ref, `Ghostscript upstream ref ${ghostscript.upstream.ref} does not match GHOSTSCRIPT_REF=${env.GHOSTSCRIPT_REF}`);
  assert(env.BUILDER_VERSION === ghostscript.zoo.builderVersion, `Ghostscript builderVersion ${ghostscript.zoo.builderVersion} does not match versions.env ${env.BUILDER_VERSION}`);
  assert(env.GHOSTSCRIPT_COMMIT === "053fa3f79d74e774b11fbf399495d4ec65bb33e7", "Ghostscript exact gs10.07.1 source commit pin is missing");
  assert(env.GHOSTSCRIPT_SOURCE_SHA256 === "1cdb766de8db8f1e589c817f09c5855ea5f65dfc8540e465a69ac14c18416025", "Ghostscript exact official source SHA-256 pin is missing");
  assert(env.EMSCRIPTEN_COMMIT === "4483d70a78098ed5d860dff2dc21f3025b2da2ee", "Ghostscript exact Emscripten 6.0.7 commit pin is missing");
  const ids = new Set(ghostscript.profiles.map((profile) => profile.id));
  assert(ids.has("browser-full"), "Ghostscript catalog must publish browser-full");
  const profile = ghostscript.profiles.find((entry) => entry.id === "browser-full");
  assert(profile?.arbitraryCli === true, "Ghostscript browser-full must expose the upstream gs CLI");
  assert(profile?.threads === false && profile?.sharedArrayBuffer === false, "Ghostscript browser-full must remain single-threaded/no-SAB");
  assert(profile?.worker === true, "Ghostscript browser-full must run commands in a Worker");
  assert(profile?.playground === true && profile?.playgroundPath === "./ghostscript-playground/", "Ghostscript browser-full must link to the Ghostscript Playground");
  assert(ghostscript.release?.tag === `ghostscript-v${ghostscript.zoo.builderVersion}`, `Ghostscript release tag must match builderVersion ${ghostscript.zoo.builderVersion}`);
  const expectedAsset = `ghostscript-browser-full-${ghostscript.upstream.version}-zoo-${ghostscript.zoo.builderVersion}.zip`;
  assert(profile?.releaseAsset === expectedAsset, `Ghostscript browser-full releaseAsset must be ${expectedAsset}`);
  const expectedSource = `ghostscript-sources-${ghostscript.upstream.version}-zoo-${ghostscript.zoo.builderVersion}.tar.gz`;
  assert(ghostscript.release?.sourceAsset === expectedSource, `Ghostscript release.sourceAsset must be ${expectedSource}`);
  assert(ghostscript.release?.checksumsAsset === "SHA256SUMS.txt", "Ghostscript release.checksumsAsset must be SHA256SUMS.txt");
  assert(ghostscript.integration?.example?.includes("WasmZooGhostscript.loadHosted"), "Ghostscript integration example must use the public runtime wrapper");
  assert(ghostscript.integration?.example?.includes("gs.dispose()"), "Ghostscript integration example must dispose the runner");
  assert(ghostscript.tracker?.candidateMode === "none", "Ghostscript automatic candidate substitution must remain source-digest gated");
}

const jq = packages.find((pkg) => pkg.slug === "jq");
if (jq) {
  const env = await readEnv(path.join(root, "builders", "jq", "versions.env"));
  assert(env.JQ_REF === `jq-${jq.upstream.version}`, `jq catalog version ${jq.upstream.version} does not match JQ_REF=${env.JQ_REF}`);
  assert(env.BUILDER_VERSION === jq.zoo.builderVersion, `jq builderVersion ${jq.zoo.builderVersion} does not match versions.env ${env.BUILDER_VERSION}`);
  assert(/^[0-9a-f]{40}$/i.test(env.JQ_COMMIT || ""), "jq exact 40-character upstream commit pin is missing");
  assert(/^[0-9a-f]{40}$/i.test(env.ONIGURUMA_COMMIT || ""), "jq exact 40-character Oniguruma submodule pin is missing");
  assert(env.EMSCRIPTEN_COMMIT === "4483d70a78098ed5d860dff2dc21f3025b2da2ee", "jq exact Emscripten 6.0.7 commit pin is missing");
  const profile = jq.profiles.find((entry) => entry.id === "browser-full");
  assert(profile?.arbitraryCli === true, "jq browser-full must expose the upstream jq CLI");
  assert(profile?.threads === false && profile?.sharedArrayBuffer === false, "jq browser-full must remain single-threaded/no-SAB");
  assert(profile?.worker === true && profile?.playgroundPath === "./jq-playground/", "jq browser-full must use a Worker and link to the jq Playground");
  assert(jq.release?.tag === `jq-v${jq.zoo.builderVersion}`, `jq release tag must match builderVersion ${jq.zoo.builderVersion}`);
  assert(profile?.releaseAsset === `jq-browser-full-${jq.upstream.version}-zoo-${jq.zoo.builderVersion}.zip`, "jq releaseAsset naming mismatch");
  assert(jq.release?.sourceAsset === `jq-sources-${jq.upstream.version}-zoo-${jq.zoo.builderVersion}.tar.gz`, "jq source asset naming mismatch");
  assert(jq.integration?.example?.includes("WasmZooJq.loadHosted") && jq.integration?.example?.includes("result.stdout"), "jq integration example must use the public CLI wrapper and captured stdout");
  assert(jq.referenceWasm?.upstreamVersion === "1.7.1", "jq reference WASM gap must record jq-web's jq 1.7.1 pin");
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
  "site/ghostscript-playground/index.html",
  "site/ghostscript-playground/app.js",
  "site/ghostscript-playground/playground.css",
  "site/jq-playground/index.html",
  "site/jq-playground/app.js",
  "site/jq-playground/playground.css",
  ".github/workflows/build-jq.yml",
  ".github/workflows/release-jq.yml",
  "site/upstream-status.json",
  "site/release-health.json",
  ".github/workflows/check-upstream.yml",
  ".github/workflows/upstream-candidate.yml",
  "scripts/check-upstream.mjs",
  "scripts/check-release-health.mjs",
  "scripts/generate-build-metadata.mjs",
  "scripts/check-metadata-contract.mjs",
  "scripts/prepare-candidate.mjs",
  "scripts/prepare-promotion.mjs",
  "scripts/upstream-config.mjs",
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
  assert(pages.includes("check-release-health.mjs --write-site"), "Pages workflow must publish a live Release Health snapshot");
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
  assert(pages.includes("site/assets/ghostscript"), "Pages workflow must stage Ghostscript cores under site/assets/ghostscript");
  assert(pages.includes("cp builders/ghostscript/runtime/browser-ghostscript.js"), "Pages workflow must use the current Ghostscript runtime wrapper");
  assert(pages.includes('"builders/ghostscript/runtime/browser-ghostscript.js"'), "Pages workflow must redeploy when the Ghostscript runtime wrapper changes");
  assert(pages.includes("site/assets/jq") && pages.includes("cp builders/jq/runtime/browser-jq.js"), "Pages workflow must stage jq release assets and current runtime wrapper");
  assert(pages.includes('"builders/jq/runtime/browser-jq.js"'), "Pages workflow must redeploy when the jq runtime wrapper changes");
  const runtime = await fs.readFile(path.join(root, "builders/ffmpeg/runtime/browser-ffmpeg.js"), "utf8");
  assert(runtime.includes('self.addEventListener("error"'), "FFmpeg runtime wrapper must surface asynchronous pthread worker errors");
  const imageRuntime = await fs.readFile(path.join(root, "builders/imagemagick/runtime/browser-imagemagick.js"), "utf8");
  assert(!imageRuntime.includes("mainScriptUrlOrBlob") && !imageRuntime.includes("SharedArrayBuffer"), "ImageMagick runtime must stay single-threaded and must not require pthread bootstrap/SAB support");
  const vipsRuntime = await fs.readFile(path.join(root, "builders/libvips/runtime/browser-libvips.js"), "utf8");
  assert(vipsRuntime.includes("crossOriginIsolated") && vipsRuntime.includes("SharedArrayBuffer"), "libvips runtime must enforce cross-origin isolation for pthreads");
  const ghostRuntime = await fs.readFile(path.join(root, "builders/ghostscript/runtime/browser-ghostscript.js"), "utf8");
  assert(ghostRuntime.includes("Worker") && ghostRuntime.includes("core.FS"), "Ghostscript runtime must use an isolated Worker with Emscripten FS/MEMFS");
  assert(!ghostRuntime.includes("SharedArrayBuffer"), "Ghostscript runtime must not require SharedArrayBuffer");
  const jqRuntime = await fs.readFile(path.join(root, "builders/jq/runtime/browser-jq.js"), "utf8");
  assert(jqRuntime.includes("core.callMain") && jqRuntime.includes("core.FS.writeFile"), "jq runtime must use upstream CLI callMain with MEMFS");
  assert(!jqRuntime.includes("SharedArrayBuffer"), "jq runtime must not require SharedArrayBuffer");
  const siteApp = await fs.readFile(path.join(root, "site/app.js"), "utf8");
  assert(siteApp.includes("Use in your app") && siteApp.includes("data-copy-code"), "Package details must render integration guidance with copyable examples");
  assert(siteApp.includes("renderVersionGap") && siteApp.includes("renderFeatureMatrix"), "Pages must render Version Gap Dashboard and Feature Matrix");
  assert(siteApp.includes("renderReleaseHealth") && siteApp.includes("release-health.json"), "Pages must render Release Health Dashboard from the live snapshot");
  assert(siteApp.includes("matrix-state") && siteApp.includes("Intentionally excluded"), "Feature Matrix must distinguish excluded vs target-inapplicable states");
  const siteHtml = await fs.readFile(path.join(root, "site/index.html"), "utf8");
  assert(siteHtml.includes('id="health"') && siteHtml.includes("Release Health Dashboard"), "Pages must expose the Release Health Dashboard section");
  assert(siteHtml.includes('id="freshness"') && siteHtml.includes("Version Gap Dashboard"), "Pages must expose the Version Gap Dashboard section");
  assert(siteHtml.includes('id="features"') && siteHtml.includes("Feature Matrix"), "Pages must expose the Feature Matrix section");
  const watcher = await fs.readFile(path.join(root, ".github/workflows/check-upstream.yml"), "utf8");
  assert(watcher.includes('cron: "23 3 * * *"'), "Upstream watcher must run daily");
  assert(watcher.includes("site/upstream-status.json") && watcher.includes("gh issue create") && watcher.includes("upstream-candidate.yml"), "Upstream watcher must publish status, open issues and dispatch candidates");
  assert(watcher.includes('-f released="$released"'), "Upstream watcher must pass the detected release date into candidate/promotion automation");
  assert(watcher.includes("site/release-health.json") && watcher.includes("check-release-health.mjs"), "Daily watcher must refresh Release Health alongside upstream freshness");
  assert(watcher.includes("gh workflow run pages.yml"), "Upstream watcher must explicitly refresh Pages after the bot snapshot commit");
  const upstreamScript = await fs.readFile(path.join(root, "scripts/check-upstream.mjs"), "utf8");
  assert(upstreamScript.includes("refusing to replace the last good Pages snapshot"), "Upstream checker must preserve the last good snapshot when all trackers fail");
  const verifyWorkflow = await fs.readFile(path.join(root, ".github/workflows/verify.yml"), "utf8");
  assert(verifyWorkflow.includes("builders/libvips/scripts/check-repository.mjs"), "Verify workflow must include libvips repository checks");
  assert(verifyWorkflow.includes("builders/ghostscript/scripts/check-repository.mjs"), "Verify workflow must include Ghostscript repository checks");
  assert(verifyWorkflow.includes("builders/jq/scripts/check-repository.mjs"), "Verify workflow must include jq repository checks");
  assert(verifyWorkflow.includes("check-metadata-contract.mjs"), "Verify workflow must validate provenance/SBOM release contracts");
  const candidate = await fs.readFile(path.join(root, ".github/workflows/upstream-candidate.yml"), "utf8");
  assert(candidate.includes("prepare-candidate.mjs") && candidate.includes("browser smoke test"), "Candidate workflow must substitute isolated pins and run browser smoke tests");
  assert(candidate.includes("adapter-gated") && candidate.includes("libvips-readiness"), "libvips candidate workflow must preserve the adapter gate");
  assert(candidate.includes("inputs.slug == 'jq'") && candidate.includes("JQ_WASM_BROWSER"), "Candidate workflow must support isolated jq upstream candidates");
  assert(candidate.includes("prepare-promotion.mjs") && candidate.includes("gh pr create"), "Successful automatic candidates must create review-only promotion PRs");
  assert(candidate.includes("gh workflow run verify.yml") && candidate.includes("build-${{ inputs.slug }}.yml"), "Promotion automation must dispatch repository/build checks explicitly");
  const prepareCandidate = await fs.readFile(path.join(root, "scripts/prepare-candidate.mjs"), "utf8");
  assert(!prepareCandidate.includes("packages/"), "Candidate preparation must not rewrite reviewed package catalog pins");
  const promotion = await fs.readFile(path.join(root, "scripts/prepare-promotion.mjs"), "utf8");
  assert(promotion.includes("candidateMode !== \"auto\"") && promotion.includes("BUILDER_VERSION"), "Promotion preparation must stay limited to auto candidates and bump the builder patch version");
  const readme = await fs.readFile(path.join(root, "README.md"), "utf8");
  assert(readme.includes(ffmpeg.release.tag), `README must show the current FFmpeg release tag ${ffmpeg.release.tag}`);
} catch (error) {
  errors.push(`site/release validation failed: ${error.message}`);
}

const catalogPath = path.join(root, "site", "catalog.json");
try {
  const catalog = await readJson(catalogPath);
  assert(catalog.schemaVersion === 2, "site/catalog.json schemaVersion must be 2");
  assert(catalog.stats?.packages === packages.length, "site/catalog.json is stale; run npm run catalog");
  assert(catalog.stats?.featureMatrices === packages.filter((pkg) => pkg.capabilityMatrix?.length).length, "site/catalog.json featureMatrices stat is stale");
  assert(catalog.stats?.referenceBuilds === packages.filter((pkg) => pkg.referenceWasm).length, "site/catalog.json referenceBuilds stat is stale");
  assert(catalog.stats?.supplyChainProfiles === packages.reduce((sum, pkg) => sum + (pkg.zoo?.supplyChainMetadata ? pkg.profiles.length : 0), 0), "site/catalog.json supplyChainProfiles stat is stale");
  assert(catalog.project?.name === "WASM Zoo", "site/catalog.json project metadata is invalid");
  const status = await readJson(path.join(root, "site", "upstream-status.json"));
  assert(status.schemaVersion === 2 && Array.isArray(status.packages), "site/upstream-status.json schema is invalid");
  for (const pkg of packages) assert(status.packages.some((item) => item.slug === pkg.slug), `site/upstream-status.json missing ${pkg.slug}`);
  const health = await readJson(path.join(root, "site", "release-health.json"));
  assert(health.schemaVersion === 1 && Array.isArray(health.packages), "site/release-health.json schema is invalid");
  for (const pkg of packages.filter((item) => item.status === "available")) assert(health.packages.some((item) => item.slug === pkg.slug), `site/release-health.json missing ${pkg.slug}`);
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
