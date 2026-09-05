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
if (!/^\d+\.\d+\.\d+$/.test(oldBuilder || "")) throw new Error(`Unsupported builder version: ${oldBuilder || "<missing>"}`);
const builderParts = oldBuilder.split(".").map(Number);
builderParts[2] += 1;
const newBuilder = builderParts.join(".");

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
    const release = await githubJson(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(values.ref)}`);
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
versionsText = envReplace(versionsText, "BUILDER_VERSION", newBuilder, versionsFile);
versionsText = envReplace(versionsText, config.refKey, values.ref, versionsFile);
versionsText = envReplace(versionsText, config.commitKey, values.commit, versionsFile);

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
  text = requireReplace(text, `## ${pkg.name} ${oldVersion}`, `## ${pkg.name} ${values.version}`, "README package heading");
  text = text.replaceAll(`/assets/${values.slug}/${oldVersion}/`, `/assets/${values.slug}/${values.version}/`);
  text = text.replaceAll(`${oldVersion}-zoo-${oldBuilder}`, `${values.version}-zoo-${newBuilder}`);
  text = text.replaceAll(`git tag -a ${values.slug}-v${oldBuilder} -m "WASM Zoo ${pkg.name} v${oldBuilder}"`, `git tag -a ${values.slug}-v${newBuilder} -m "WASM Zoo ${pkg.name} v${newBuilder}"`);
  text = text.replaceAll(`git push origin ${values.slug}-v${oldBuilder}`, `git push origin ${values.slug}-v${newBuilder}`);
  // FFmpeg currently documents the tag as a standalone line rather than git commands.
  text = text.replace(new RegExp(`(^|\\n)${values.slug}-v${oldBuilder.replaceAll(".", "\\.")}($|\\n)`), `$1${values.slug}-v${newBuilder}$2`);
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
    `release_tag=${pkg.release.tag}`,
    `released=${released}`,
    ...(submoduleCommit ? [`submodule_commit=${submoduleCommit}`] : [])
  ].join("\n") + "\n");
}

const refreshedEnv = await readEnv(versionsFile);
if (refreshedEnv.BUILDER_VERSION !== newBuilder || refreshedEnv[config.refKey] !== values.ref || refreshedEnv[config.commitKey] !== values.commit) {
  throw new Error("Promotion pin verification failed after writing versions.env");
}

console.log(`[OK] prepared promotion ${values.slug} ${oldVersion} -> ${values.version}; builder ${oldBuilder} -> ${newBuilder}`);
console.log(`[OK] reviewed ref ${oldRef} -> ${values.ref}; commit ${values.commit}`);
