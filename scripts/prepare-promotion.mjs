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
// An upstream promotion is NOT an npm publication: Zstandard's already public
// npm 0.3.0 stays pinned to zstd-v0.3.0 until a separate reviewed npm rollout.
const newNpmVersion = pkg.npm
  ? (values.slug === "zstd" ? oldNpmVersion : bumpPatchVersion(oldNpmVersion, "npm distribution version"))
  : null;

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

// Defense in depth: the watched tag and exact commit must still be the official
// stable Facebook/Zstandard Release when the bot actually prepares a PR.
if (values.slug === "zstd") {
  if (values.ref !== "v"+values.version || !/^\\d+\\.\\d+\\.\\d+$/.test(values.version)) {
    throw new Error("Refusing promotion of a noncanonical Zstandard release tag");
  }
  const official = await githubJson(`https://api.github.com/repos/facebook/zstd/releases/tags/${encodeURIComponent(values.ref)}`);
  const target = await githubJson(`https://api.github.com/repos/facebook/zstd/commits/${encodeURIComponent(values.ref)}`);
  if (official.draft || official.prerelease || official.tag_name !== values.ref || target.sha !== values.commit) {
    throw new Error("Zstandard promotion ref/commit is not the exact official stable Release");
  }
}
const released = await resolveReleasedDate();
const versionsFile = path.join(root, "builders", config.dir, "versions.env");
let versionsText = await fs.readFile(versionsFile, "utf8");
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
if (pkg.npm) pkg.npm.version = newNpmVersion;
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
  if (!pkg.npm?.publishedSource ||
      pkg.npm.publishedSource.releaseTag !== "zstd-v0.3.0" ||
      pkg.npm.publishedSource.registryShasum !== "29add1aaf6ab0c3e9a3d538166a51a3f70cefa99") {
    throw new Error("Refusing to overwrite independently published Zstandard npm provenance");
  }
  pkg.summary = `Official-source Zstandard ${values.version} WebAssembly, release-gated in browser-core and browser-full; publication remains manual. The independently published npm CLI retains its immutable source until a separate reviewed npm rollout.`;
  for (const profile of pkg.profiles || []) {
    profile.features = profile.features.map((value) => value.replaceAll(oldVersion, values.version));
    profile.output = profile.output.replaceAll(oldVersion, values.version);
  }
  for (const item of pkg.comparison || []) item.note = item.note?.replaceAll(oldVersion, values.version);
  for (const feature of pkg.capabilityMatrix || []) {
    if (feature.note) feature.note = feature.note.replaceAll(oldVersion, values.version);
  }
  pkg.integration.notes = pkg.integration.notes.map((note) =>
    note.startsWith("Use the immutable zstd-v")
      ? `After manual publication use the immutable ${pkg.release.tag} GitHub Release; existing npm ${pkg.npm.version} independently retains ${pkg.npm.publishedSource.releaseTag}.`
      : note);
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

if (values.slug === "jq") {
  pkg.notes = (pkg.notes || []).map((note) => {
    let next = note.replaceAll(oldVersion, values.version).replaceAll(pkg.upstream?.commit || "__never__", values.commit);
    // jq's package notes currently record the reviewed source/submodule pins directly.
    next = next.replace(/exact commit [0-9a-f]{40}/i, `exact commit ${values.commit}`);
    if (submoduleCommit) next = next.replace(/submodule is pinned to [0-9a-f]{40}/i, `submodule is pinned to ${submoduleCommit}`);
    return next;
  });
}
const promotionNote = `v${newBuilder} promotes ${pkg.name} ${values.version} after the isolated upstream candidate build and browser smoke test passed; the reviewed upstream ref/commit and release metadata move to the candidate-tested exact pins.`;
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
  if (values.slug !== "zstd") {
    text = requireReplace(text, `## ${pkg.name} ${oldVersion}`, `## ${pkg.name} ${values.version}`, "README package heading");
  }
  text = text.replaceAll(`/assets/${values.slug}/${oldVersion}/`, `/assets/${values.slug}/${values.version}/`);
  if (values.slug !== "zstd") text = text.replaceAll(`${oldVersion}-zoo-${oldBuilder}`, `${values.version}-zoo-${newBuilder}`);
  text = text.replaceAll(`git tag -a ${values.slug}-v${oldBuilder} -m "WASM Zoo ${pkg.name} v${oldBuilder}"`, `git tag -a ${values.slug}-v${newBuilder} -m "WASM Zoo ${pkg.name} v${newBuilder}"`);
  text = text.replaceAll(`git push origin ${values.slug}-v${oldBuilder}`, `git push origin ${values.slug}-v${newBuilder}`);
  // FFmpeg currently documents the tag as a standalone line rather than git commands.
  text = text.replace(new RegExp(`(^|\\n)${values.slug}-v${oldBuilder.replaceAll(".", "\\.")}($|\\n)`), `$1${values.slug}-v${newBuilder}$2`);
  if (values.slug === "ghostscript") {
    const start = text.indexOf("## Ghostscript " + values.version);
    const end = start >= 0 ? text.indexOf("\n## ", start + 4) : -1;
    if (start < 0) throw new Error("Could not locate current Ghostscript README section");
    const stop = end >= 0 ? end : text.length;
    text = text.slice(0, start) + text.slice(start, stop).replaceAll(oldVersion, values.version) + text.slice(stop);
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
  // Zstandard's published npm row truthfully stays on its immutable old source.
  if (values.slug === "zstd" || !pkg.npm || !oldNpmVersion || !newNpmVersion) return input;
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
if (values.slug === "zstd") {
  await replaceFile("site/zstd-playground/release-status.json", () => JSON.stringify({
    schemaVersion: 1, state: "not-published", tag: pkg.release.tag,
    upstreamCommit: values.commit
  }, null, 2) + "\n");
}

if (values.slug === "libarchive") {
  await replaceFile("builders/libarchive/README.md", (text) => text.replace(`Pinned release: **libarchive ${oldVersion}**`, `Pinned release: **libarchive ${values.version}**`));
  await replaceFile("builders/libarchive/docs/ARCHITECTURE.md", (text) => text.replace(`libarchive ${oldVersion}`, `libarchive ${values.version}`));
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
