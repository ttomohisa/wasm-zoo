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
  assert(!ids.has("video-compressor") && !ids.has("lossless-video-cutter"), "App-specific FFmpeg profiles do not belong in WASM Zoo");
  for (const profile of ffmpeg.profiles) {
    assert(profile.arbitraryCli === true, `FFmpeg profile ${profile.id} must expose the generic upstream CLI`);
    assert(profile.threads === true && profile.sharedArrayBuffer === true, `FFmpeg profile ${profile.id} must declare pthread/SAB requirements`);
    assert(profile.simd === true, `FFmpeg profile ${profile.id} must declare WASM SIMD`);
  }
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
