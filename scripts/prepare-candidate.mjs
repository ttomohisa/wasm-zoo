import fs from "node:fs/promises";
import path from "node:path";
import { root } from "./lib.mjs";
import { automaticCandidateConfig } from "./upstream-config.mjs";

const values = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument near ${key || "<end>"}`);
  values[key.slice(2)] = value;
}
for (const key of ["slug", "version", "ref", "commit"]) if (!values[key]) throw new Error(`Missing --${key}`);

const config = automaticCandidateConfig(values.slug);
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

async function resolveSubmoduleCommit(submodule) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wasm-zoo-candidate-preparer",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
  };
  const url = `https://api.github.com/repos/${submodule.repository}/contents/${submodule.path}?ref=${encodeURIComponent(values.commit)}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Could not resolve ${submodule.path} for ${values.commit}: ${response.status} ${response.statusText}`);
  const data = await response.json();
  if (data.type !== "submodule" || !/^[0-9a-f]{40}$/i.test(data.sha || "")) throw new Error(`Invalid submodule metadata for ${submodule.path}`);
  return data.sha;
}

let submoduleCommit = null;
if (config.submodule) {
  if (values["submodule-commit"]) {
    if (!/^[0-9a-f]{40}$/i.test(values["submodule-commit"])) throw new Error("--submodule-commit must be a full 40-character Git commit SHA");
    submoduleCommit = values["submodule-commit"];
  } else {
    submoduleCommit = await resolveSubmoduleCommit(config.submodule);
  }
  replaceEnv(config.submodule.commitKey, submoduleCommit);
}
await fs.writeFile(file, text);

// jq's browser smoke test intentionally verifies the exact `jq --version` output.
// Candidate preparation updates only the isolated candidate workspace, never the reviewed pin.
if (values.slug === "jq") {
  const smokeFile = path.join(root, "builders", "jq", "tests", "smoke-test.html");
  let smoke = await fs.readFile(smokeFile, "utf8");
  const current = smoke.match(/jq-([0-9]+(?:\.[0-9]+)+)/)?.[1];
  if (!current) throw new Error("Could not locate jq version expectation in smoke-test.html");
  smoke = smoke.replaceAll(`jq-${current}`, `jq-${values.version}`);
  smoke = smoke.replaceAll(`SMOKE_TEST_PASS_jq_${current}`, `SMOKE_TEST_PASS_jq_${values.version}`);
  smoke = smoke.replaceAll(`jq_${current.replaceAll(".", "_")}`, `jq_${values.version.replaceAll(".", "_")}`);
  await fs.writeFile(smokeFile, smoke);
}

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
