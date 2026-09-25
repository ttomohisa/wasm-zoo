import fs from "node:fs/promises";
import path from "node:path";
import { compareVersions, readEnv, readJson, root } from "./lib.mjs";
import { automaticCandidateConfig } from "./upstream-config.mjs";

const values = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument near ${key || "<end>"}`);
  values[key.slice(2)] = value;
}
for (const key of ["slug", "version", "ref", "commit"]) if (!values[key]) throw new Error(`Missing --${key}`);
if (!/^[0-9a-f]{40}$/i.test(values.commit)) throw new Error("--commit must be a full 40-character Git commit SHA");

const config = automaticCandidateConfig(values.slug);
if (!config) throw new Error(`${values.slug} does not support automatic promotion PRs`);

const packageFile = path.join(root, "packages", values.slug, "package.json");
const pkg = await readJson(packageFile);
if (pkg.tracker?.candidateMode !== "auto") throw new Error(`${values.slug} is not candidateMode=auto; refusing automatic promotion`);
const versionCmp = compareVersions(values.version, pkg.upstream.version);
if (versionCmp < 0) throw new Error(`Candidate ${values.version} is older than reviewed ${pkg.upstream.version}`);
if (versionCmp === 0) {
  console.log(`[SKIP] ${values.slug} ${values.version} is already the reviewed upstream version`);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `noop=true\n`);
  process.exit(0);
}

const oldVersion = pkg.upstream.version;
const oldRef = pkg.upstream.ref;
const oldBuilder = pkg.zoo?.builderVersion;

function bumpPatchVersion(value, label) {
  if (!/^\d+\.\d+\.\d+$/.test(value || "")) throw new Error(`Unsupported ${label}: ${value || "<missing>"}`);
  const parts = value.split(".").map(Number);
  parts[2] += 1;
  return parts.join(".");
}

const newBuilder = bumpPatchVersion(oldBuilder, "builder version");
const oldNpmVersion = pkg.npm?.version || null;
const newNpmVersion = pkg.npm && !config.keepNpmPinned ? bumpPatchVersion(oldNpmVersion, "npm distribution version") : null;

function envReplace(text, key, value, file) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (!pattern.test(text)) throw new Error(`${key} not found in ${path.relative(root, file)}`);
  return text.replace(pattern, `${key}=${value}`);
}

async function githubJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wasm-zoo-promotion-preparer",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
  };
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

async function resolveReleasedDate() {
  if (values.released) {
    const date = new Date(values.released);
    if (!Number.isFinite(date.getTime())) throw new Error(`Invalid --released value: ${values.released}`);
    return date.toISOString().slice(0, 10);
  }
  const repo = pkg.tracker.repository;
  if (pkg.tracker.type === "github-releases") {
    const releaseRef = values["release-tag"] || values.ref;
    const release = await githubJson(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(releaseRef)}`);
    const date = release.published_at || release.created_at;
    if (!date) throw new Error(`Could not resolve release date for ${repo} ${values.ref}`);
    return new Date(date).toISOString().slice(0, 10);
  }
  const commit = await githubJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(values.ref)}`);
  const date = commit.commit?.committer?.date || commit.commit?.author?.date;
  if (!date) throw new Error(`Could not resolve commit date for ${repo} ${values.ref}`);
  return new Date(date).toISOString().slice(0, 10);
}

async function resolveSubmoduleCommit(submodule) {
  const data = await githubJson(`https://api.github.com/repos/${submodule.repository}/contents/${submodule.path}?ref=${encodeURIComponent(values.commit)}`);
  if (data.type !== "submodule" || !/^[0-9a-f]{40}$/i.test(data.sha || "")) throw new Error(`Invalid submodule metadata for ${submodule.path}`);
  return data.sha;
}

const released = await resolveReleasedDate();
const versionsFile = path.join(root, "builders", config.dir, "versions.env");
let versionsText = await fs.readFile(versionsFile, "utf8");
const oldEnv = Object.fromEntries(versionsText.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const i = line.indexOf("=");
    return [line.slice(0, i), line.slice(i + 1).replace(/^[\"']|[\"']$/g, "")];
  }));
function validateLibvipsAdapterArgs() {
  if (values.slug !== "libvips") return;
  for (const key of ["emscripten-commit", "wasm-vips-commit", "libvips-patch-commit", "emscripten-patch-commit"]) {
    if (!/^[0-9a-f]{40}$/i.test(values[key] || "")) throw new Error(`--${key} must be a full 40-character Git commit SHA`);
  }
  for (const key of ["emsdk-version", "emscripten-ref", "wasm-vips-version"]) {
    if (!/^\d+\.\d+\.\d+$/.test(values[key] || "")) throw new Error(`--${key} must be x.y.z`);
  }
  if (values["emscripten-ref"] !== values["emsdk-version"]) {
    throw new Error("--emscripten-ref must match --emsdk-version for the pinned emsdk image");
  }
}
validateLibvipsAdapterArgs();
versionsText = envReplace(versionsText, "BUILDER_VERSION", newBuilder, versionsFile);
versionsText = envReplace(versionsText, config.refKey, values.ref, versionsFile);
versionsText = envReplace(versionsText, config.commitKey, values.commit, versionsFile);

if (config.extraEnv) {
  for (const [argKey, envKey] of Object.entries(config.extraEnv)) {
    const value = values[argKey];
    if (!value) throw new Error(`Missing --${argKey} for ${values.slug} automatic promotion`);
    if (argKey === "source-sha256" && !/^[0-9a-f]{64}$/i.test(value)) throw new Error("--source-sha256 must be a 64-character SHA-256 digest");
    versionsText = envReplace(versionsText, envKey, value, versionsFile);
  }
}

let submoduleCommit = null;
if (config.submodule) {
  if (values["submodule-commit"]) {
    if (!/^[0-9a-f]{40}$/i.test(values["submodule-commit"])) throw new Error("--submodule-commit must be a full 40-character Git commit SHA");
    submoduleCommit = values["submodule-commit"];
  } else {
    submoduleCommit = await resolveSubmoduleCommit(config.submodule);
  }
  versionsText = envReplace(versionsText, config.submodule.commitKey, submoduleCommit, versionsFile);
}
await fs.writeFile(versionsFile, versionsText);

pkg.upstream.version = values.version;
pkg.upstream.ref = values.ref;
pkg.upstream.released = released;
pkg.zoo.builderVersion = newBuilder;
if (pkg.npm && newNpmVersion) pkg.npm.version = newNpmVersion;
for (const profile of pkg.profiles || []) {
  profile.releaseAsset = `${values.slug}-${profile.id}-${values.version}-zoo-${newBuilder}.zip`;
}
for (const item of pkg.comparison || []) {
  if (item.version === oldVersion || ["Upstream native", "WASM Zoo"].includes(item.name)) item.version = values.version;
}
pkg.release.tag = `${values.slug}-v${newBuilder}`;
pkg.release.page = `https://github.com/ttomohisa/wasm-zoo/releases/tag/${pkg.release.tag}`;
pkg.release.downloadBase = `https://github.com/ttomohisa/wasm-zoo/releases/download/${pkg.release.tag}/`;
pkg.release.sourceAsset = `${values.slug}-sources-${values.version}-zoo-${newBuilder}.tar.gz`;

if (values.slug === "zstd") {
  const oldReleaseTag = `zstd-v${oldBuilder}`;
  const newReleaseTag = `zstd-v${newBuilder}`;
  const rewrite = (value) => {
    if (typeof value === "string") return value.replaceAll(oldVersion, values.version).replaceAll(oldReleaseTag, newReleaseTag);
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewrite(child)]));
    return value;
  };
  pkg.summary = rewrite(pkg.summary);
  pkg.profiles = rewrite(pkg.profiles);
  pkg.comparison = rewrite(pkg.comparison);
  pkg.notes = (pkg.notes || []).map((note) => note.includes("@wasm-zoo/zstd") ? note : rewrite(note));
  pkg.capabilityMatrix = rewrite(pkg.capabilityMatrix);
  pkg.integration = rewrite(pkg.integration);
}

if (values.slug === "libvips") {
  const rewriteCurrent = (value) => {
    if (typeof value === "string") return value.replaceAll(oldVersion, values.version);
    if (Array.isArray(value)) return value.map(rewriteCurrent);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteCurrent(child)]));
    return value;
  };
  pkg.summary = rewriteCurrent(pkg.summary);
  pkg.profiles = rewriteCurrent(pkg.profiles);
  pkg.capabilityMatrix = rewriteCurrent(pkg.capabilityMatrix);
  pkg.integration = rewriteCurrent(pkg.integration);
  pkg.zoo.toolchain = `Emscripten ${values["emsdk-version"]}`;
  const adapterRow = (pkg.comparison || []).find((item) => item.name === "wasm-vips adapter");
  if (!adapterRow) throw new Error("libvips comparison metadata is missing the wasm-vips adapter row");
  adapterRow.version = `${values["wasm-vips-version"]} / pinned commit`;
  if (pkg.referenceWasm) {
    pkg.referenceWasm.packageVersion = values["wasm-vips-version"];
    pkg.referenceWasm.upstreamVersion = values.version;
    pkg.referenceWasm.checkedAt = new Date().toISOString().slice(0, 10);
  }
}

if (values.slug === "ghostscript") {
  for (const profile of pkg.profiles || []) {
    profile.externalLibraries = (profile.externalLibraries || []).map((text) =>
      text.replaceAll(oldVersion, values.version)
    );
  }
  pkg.notes = (pkg.notes || []).map((note) =>
    note.startsWith(`Official Ghostscript ${oldVersion} release source archive is pinned by SHA-256`)
      ? note.replace(oldVersion, values.version)
      : note
  );
}

if (values.slug === "qpdf") {
  pkg.notes = (pkg.notes || []).map((note) => {
    if (note.includes("@wasm-zoo/qpdf")) return note;
    let next = note.replaceAll(oldVersion, values.version);
    if (oldEnv.QPDF_COMMIT) next = next.replaceAll(oldEnv.QPDF_COMMIT, values.commit);
    if (oldEnv.QPDF_SOURCE_SHA256 && values["source-sha256"]) next = next.replaceAll(oldEnv.QPDF_SOURCE_SHA256, values["source-sha256"]);
    return next;
  });
}

if (values.slug === "jq") {
  pkg.notes = (pkg.notes || []).map((note) => {
    let next = note.replaceAll(oldVersion, values.version).replaceAll(pkg.upstream?.commit || "__never__", values.commit);
    // jq's package notes currently record the reviewed source/submodule pins directly.
    next = next.replace(/exact commit [0-9a-f]{40}/i, `exact commit ${values.commit}`);
    if (submoduleCommit) next = next.replace(/submodule is pinned to [0-9a-f]{40}/i, `submodule is pinned to ${submoduleCommit}`);
    return next;
  });
}
const promotionNote = values.slug === "libvips"
  ? `v${newBuilder} promotes libvips ${values.version} with wasm-vips ${values["wasm-vips-version"]} at exact commit \`${values["wasm-vips-commit"]}\`, Emscripten ${values["emsdk-version"]}, and immutable libvips/Emscripten compatibility patch commits after both browser profiles passed the isolated candidate build and smoke tests.`
  : `v${newBuilder} promotes ${pkg.name} ${values.version} after the isolated upstream candidate build and browser smoke test passed; the reviewed upstream ref/commit and release metadata move to the candidate-tested exact pins.`;
pkg.notes = [promotionNote, ...(pkg.notes || [])];
await fs.writeFile(packageFile, `${JSON.stringify(pkg, null, 2)}\n`);

async function replaceFile(rel, transform, { optional = false } = {}) {
  const file = path.join(root, rel);
  let text;
  try { text = await fs.readFile(file, "utf8"); }
  catch (error) {
    if (optional && error.code === "ENOENT") return false;
    throw error;
  }
  const next = transform(text);
  if (next !== text) await fs.writeFile(file, next);
  return next !== text;
}

function requireReplace(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Could not update ${label}: missing ${search}`);
  return text.replace(search, replacement);
}

await replaceFile("README.md", (input) => {
  let text = input;
  const tableOld = `| ${pkg.name} | ${oldVersion} | ${oldBuilder} |`;
  const tableNew = `| ${pkg.name} | ${values.version} | ${newBuilder} |`;
  text = requireReplace(text, tableOld, tableNew, "README package table");
  if (pkg.npm && oldNpmVersion && newNpmVersion) {
    text = requireReplace(text, "`" + pkg.npm.package + "@" + oldNpmVersion + "`", "`" + pkg.npm.package + "@" + newNpmVersion + "`", "README npm version");
  }
  if (["zstd", "qpdf"].includes(values.slug) && !text.includes(`## ${pkg.name} ${oldVersion}`)) {
    // Zstandard and QPDF are documented through the package table / dedicated builder docs,
    // not a legacy per-package README heading.
  } else {
    text = requireReplace(text, `## ${pkg.name} ${oldVersion}`, `## ${pkg.name} ${values.version}`, "README package heading");
  }
  text = text.replaceAll(`/assets/${values.slug}/${oldVersion}/`, `/assets/${values.slug}/${values.version}/`);
  text = text.replaceAll(`${oldVersion}-zoo-${oldBuilder}`, `${values.version}-zoo-${newBuilder}`);
  text = text.replaceAll(`git tag -a ${values.slug}-v${oldBuilder} -m "WASM Zoo ${pkg.name} v${oldBuilder}"`, `git tag -a ${values.slug}-v${newBuilder} -m "WASM Zoo ${pkg.name} v${newBuilder}"`);
  text = text.replaceAll(`git push origin ${values.slug}-v${oldBuilder}`, `git push origin ${values.slug}-v${newBuilder}`);
  // FFmpeg currently documents the tag as a standalone line rather than git commands.
  text = text.replace(new RegExp(`(^|\\n)${values.slug}-v${oldBuilder.replaceAll(".", "\\.")}($|\\n)`), `$1${values.slug}-v${newBuilder}$2`);
  if (values.slug === "libvips") {
    const start = text.indexOf("## libvips " + values.version);
    const end = start >= 0 ? text.indexOf("\n## ", start + 4) : -1;
    if (start < 0) throw new Error("Could not locate current libvips README section");
    const stop = end >= 0 ? end : text.length;
    let section = text.slice(start, stop).replaceAll(oldVersion, values.version);
    if (oldEnv.EMSDK_VERSION) section = section.replaceAll(oldEnv.EMSDK_VERSION, values["emsdk-version"]);
    if (oldEnv.WASM_VIPS_VERSION) section = section.replaceAll(oldEnv.WASM_VIPS_VERSION, values["wasm-vips-version"]);
    text = text.slice(0, start) + section + text.slice(stop);
  }
  if (values.slug === "ghostscript") {
    const start = text.indexOf("## Ghostscript " + values.version);
    const end = start >= 0 ? text.indexOf("\n## ", start + 4) : -1;
    if (start < 0) throw new Error("Could not locate current Ghostscript README section");
    const stop = end >= 0 ? end : text.length;
    text = text.slice(0, start) + text.slice(start, stop).replaceAll(oldVersion, values.version) + text.slice(stop);
  }
  if (values.slug === "zstd") {
    const start = text.indexOf(`## Zstandard ${values.version}`);
    const end = start >= 0 ? text.indexOf("\n## ", start + 4) : -1;
    if (start >= 0) {
      const stop = end >= 0 ? end : text.length;
      text = text.slice(0, start) + text.slice(start, stop).replaceAll(oldVersion, values.version) + text.slice(stop);
    }
  }
  if (values.slug === "jq") {
    const start = text.indexOf(`## jq ${values.version}`);
    const end = start >= 0 ? text.indexOf("\n## ", start + 4) : -1;
    if (start >= 0) {
      const stop = end >= 0 ? end : text.length;
      text = text.slice(0, start) + text.slice(start, stop).replaceAll(oldVersion, values.version) + text.slice(stop);
    }
  }
  return text;
});

await replaceFile("docs/NPM_DISTRIBUTION.md", (input) => {
  if (!pkg.npm || !oldNpmVersion || !newNpmVersion) return input;
  const lines = input.split("\n");
  const prefix = "| `" + pkg.npm.package + "` |";
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index < 0) throw new Error("Could not update npm distribution row for " + pkg.npm.package);

  let row = lines[index];
  row = requireReplace(row, "`" + oldNpmVersion + "`", "`" + newNpmVersion + "`", "npm distribution version");
  row = requireReplace(row, pkg.name + " " + oldVersion, pkg.name + " " + values.version, "npm distribution upstream version");
  row = requireReplace(row, "`" + oldBuilder + "`", "`" + newBuilder + "`", "npm distribution builder version");
  row = requireReplace(row, "`" + values.slug + "-v" + oldBuilder + "`", "`" + pkg.release.tag + "`", "npm distribution release tag");
  lines[index] = row;
  return lines.join("\n");
});

await replaceFile("CHANGELOG.md", (text) => {
  const marker = "## Unreleased\n";
  if (!text.includes(marker)) throw new Error("CHANGELOG.md is missing ## Unreleased");
  const line = `- promote ${pkg.name} ${values.version} to builder ${newBuilder} after the isolated upstream candidate build and browser smoke test passed, moving the reviewed source pin to exact commit \`${values.commit}\`;\n`;
  return text.replace(marker, `${marker}\n${line}`);
});

await replaceFile(`site/${values.slug}-playground/index.html`, (text) => text.replaceAll(oldVersion, values.version), { optional: true });

if (values.slug === "libarchive") {
  await replaceFile("builders/libarchive/README.md", (text) => text.replace(`Pinned release: **libarchive ${oldVersion}**`, `Pinned release: **libarchive ${values.version}**`));
  await replaceFile("builders/libarchive/docs/ARCHITECTURE.md", (text) => text.replace(`libarchive ${oldVersion}`, `libarchive ${values.version}`));
}
if (values.slug === "libvips") {
  const refresh = (text) => {
    let next = text.replaceAll(oldVersion, values.version);
    if (oldEnv.EMSDK_VERSION) next = next.replaceAll(oldEnv.EMSDK_VERSION, values["emsdk-version"]);
    if (oldEnv.WASM_VIPS_VERSION) next = next.replaceAll(oldEnv.WASM_VIPS_VERSION, values["wasm-vips-version"]);
    return next;
  };
  await replaceFile("builders/libvips/README.md", refresh);
  await replaceFile("builders/libvips/docs/ARCHITECTURE.md", refresh);
}
if (values.slug === "zstd") {
  const versionNumber = (version) => {
    const parts = String(version).split(".").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
      throw new Error(`Unsupported Zstandard version: ${version}`);
    }
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  };
  const oldNumber = versionNumber(oldVersion);
  const newNumber = versionNumber(values.version);
  for (const rel of [
    "builders/zstd/tests/smoke-test.html",
    "builders/zstd/tests/smoke-test-cli.html",
    "builders/zstd/scripts/build-cli.sh"
  ]) {
    await replaceFile(rel, (text) => {
      let next = text.replaceAll(oldVersion, values.version);
      if (rel.endsWith("tests/smoke-test.html")) next = next.replaceAll(String(oldNumber), String(newNumber));
      return next;
    });
  }
  await replaceFile("site/zstd-playground/app.js", (text) =>
    text.replaceAll(oldVersion, values.version)
      .replace(/const UPSTREAM_SHA = "[0-9a-f]{40}";/, `const UPSTREAM_SHA = "${values.commit}";`)
  );
  await replaceFile("site/zstd-playground/release-status.json", (text) => {
    const state = JSON.parse(text);
    state.state = "not-published";
    state.tag = `zstd-v${newBuilder}`;
    state.upstreamCommit = values.commit;
    return JSON.stringify(state, null, 2) + "\n";
  });
}

if (values.slug === "qpdf") {
  const refresh = (text) => {
    let next = text.replaceAll(oldVersion, values.version)
      .replaceAll(`qpdf-v${oldBuilder}`, `qpdf-v${newBuilder}`);
    if (oldEnv.QPDF_COMMIT) next = next.replaceAll(oldEnv.QPDF_COMMIT, values.commit);
    if (oldEnv.QPDF_SOURCE_SHA256 && values["source-sha256"]) next = next.replaceAll(oldEnv.QPDF_SOURCE_SHA256, values["source-sha256"]);
    return next;
  };
  await replaceFile("builders/qpdf/README.md", refresh);
  await replaceFile("builders/qpdf/docs/ARCHITECTURE.md", refresh);
  await replaceFile("builders/qpdf/tests/smoke-test.html", (text) =>
    text.replaceAll(`qpdf version ${oldVersion}`, `qpdf version ${values.version}`)
      .replaceAll(`SMOKE_TEST_PASS_QPDF_${oldVersion.replaceAll(".", "_")}`, `SMOKE_TEST_PASS_QPDF_${values.version.replaceAll(".", "_")}`)
  );
}

if (values.slug === "jq") {
  for (const rel of ["builders/jq/README.md", "builders/jq/docs/ARCHITECTURE.md", "builders/jq/scripts/build-full.sh", "builders/jq/tests/smoke-test.html"]) {
    await replaceFile(rel, (text) => text
      .replaceAll(`jq-${oldVersion}`, `jq-${values.version}`)
      .replaceAll(`SMOKE_TEST_PASS_jq_${oldVersion}`, `SMOKE_TEST_PASS_jq_${values.version}`)
      .replaceAll(`jq_${oldVersion.replaceAll(".", "_")}`, `jq_${values.version.replaceAll(".", "_")}`)
      .replaceAll(`jq ${oldVersion}`, `jq ${values.version}`));
  }
}

if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(process.env.GITHUB_OUTPUT, [
    `old_version=${oldVersion}`,
    `new_version=${values.version}`,
    `old_builder=${oldBuilder}`,
    `builder_version=${newBuilder}`,
    ...(newNpmVersion ? [`npm_version=${newNpmVersion}`] : []),
    `release_tag=${pkg.release.tag}`,
    `released=${released}`,
    ...(submoduleCommit ? [`submodule_commit=${submoduleCommit}`] : [])
  ].join("\n") + "\n");
}

const refreshedEnv = await readEnv(versionsFile);
if (refreshedEnv.BUILDER_VERSION !== newBuilder || refreshedEnv[config.refKey] !== values.ref || refreshedEnv[config.commitKey] !== values.commit) {
  throw new Error("Promotion pin verification failed after writing versions.env");
}
if (config.extraEnv) {
  for (const [argKey, envKey] of Object.entries(config.extraEnv)) {
    if (refreshedEnv[envKey] !== values[argKey]) throw new Error(`Promotion extra pin verification failed for ${envKey}`);
  }
}

console.log(`[OK] prepared promotion ${values.slug} ${oldVersion} -> ${values.version}; builder ${oldBuilder} -> ${newBuilder}`);
if (newNpmVersion) console.log(`[OK] npm distribution version ${oldNpmVersion} -> ${newNpmVersion}`);
console.log(`[OK] reviewed ref ${oldRef} -> ${values.ref}; commit ${values.commit}`);
