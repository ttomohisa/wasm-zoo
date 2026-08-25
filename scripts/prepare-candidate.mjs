import fs from "node:fs/promises";
import path from "node:path";
import { root } from "./lib.mjs";

const values = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument near ${key || "<end>"}`);
  values[key.slice(2)] = value;
}
for (const key of ["slug", "version", "ref", "commit"]) if (!values[key]) throw new Error(`Missing --${key}`);

const configs = {
  ffmpeg: { dir: "ffmpeg", refKey: "FFMPEG_REF", commitKey: "FFMPEG_COMMIT" },
  libarchive: { dir: "libarchive", refKey: "LIBARCHIVE_REF", commitKey: "LIBARCHIVE_COMMIT" },
  imagemagick: { dir: "imagemagick", refKey: "IMAGEMAGICK_REF", commitKey: "IMAGEMAGICK_COMMIT" },
  jq: { dir: "jq", refKey: "JQ_REF", commitKey: "JQ_COMMIT", submodule: { repository: "jqlang/jq", path: "vendor/oniguruma", commitKey: "ONIGURUMA_COMMIT" } }
};
const config = configs[values.slug];
if (!config) throw new Error(`${values.slug} does not support automatic candidate builds`);
const file = path.join(root, "builders", config.dir, "versions.env");
let text = await fs.readFile(file, "utf8");
function replaceEnv(key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (!pattern.test(text)) throw new Error(`${key} not found in ${path.relative(root, file)}`);
  text = text.replace(pattern, `${key}=${value}`);
}
replaceEnv(config.refKey, values.ref);
replaceEnv(config.commitKey, values.commit);
let submoduleCommit = null;
if (config.submodule) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "wasm-zoo-candidate-preparer", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const url = `https://api.github.com/repos/${config.submodule.repository}/contents/${config.submodule.path}?ref=${encodeURIComponent(values.commit)}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Could not resolve ${config.submodule.path} for ${values.commit}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  if (data.type !== "submodule" || !/^[0-9a-f]{40}$/i.test(data.sha || "")) throw new Error(`Invalid submodule metadata for ${config.submodule.path}`);
  submoduleCommit = data.sha;
  replaceEnv(config.submodule.commitKey, submoduleCommit);
}
await fs.writeFile(file, text);
const info = {
  schemaVersion: 1,
  slug: values.slug,
  version: values.version,
  ref: values.ref,
  commit: values.commit,
  preparedAt: new Date().toISOString(),
  versionsFile: path.relative(root, file).replaceAll(path.sep, "/"),
  ...(submoduleCommit ? { submoduleCommit } : {})
};
await fs.writeFile(path.join(root, "candidate-info.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(`[OK] prepared ${values.slug} upstream candidate ${values.version} (${values.ref} @ ${values.commit.slice(0, 12)})`);
