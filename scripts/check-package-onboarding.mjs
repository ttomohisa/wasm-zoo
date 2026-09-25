import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, readEnv } from "./lib.mjs";
import { automaticCandidateConfig } from "./upstream-config.mjs";

const errors = [];
const need = (ok, message) => { if (!ok) errors.push(message); };
const activeStatuses = new Set(["experimental", "available"]);
const validStatuses = new Set(["planned", "experimental", "available", "paused"]);
const validCandidateModes = new Set(["auto", "adapter-gated", "none"]);

async function exists(rel) {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

async function read(rel) {
  return (await fs.readFile(path.join(root, rel), "utf8")).replace(/\r\n/g, "\n");
}

function hasSlug(text, slug) {
  const escaped = slug.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9-])" + escaped + "([^a-z0-9-]|$)", "i").test(text);
}

const [upstreamWorkflow, crossBrowserWorkflow, publishNpmWorkflow, pagesWorkflow, smokeNpm] = await Promise.all([
  read(".github/workflows/upstream-candidate.yml"),
  read(".github/workflows/cross-browser-compat.yml"),
  read(".github/workflows/publish-npm.yml"),
  read(".github/workflows/pages.yml"),
  read("scripts/smoke-npm-package.mjs")
]);

need(crossBrowserWorkflow.includes("node scripts/npm-package-set.mjs --github-output") &&
  crossBrowserWorkflow.includes("fromJSON(needs.package-set.outputs.single)") &&
  crossBrowserWorkflow.includes("fromJSON(needs.package-set.outputs.threaded)"),
  "Cross-browser Lab must derive published npm package matrices from manifests");
need(publishNpmWorkflow.includes("slug:\n        description: npm distribution package\n        required: true\n        type: string"),
  "publish-npm.yml slug input must accept manifest-validated package names without a static choice allowlist");

const packageBase = path.join(root, "packages");
const entries = (await fs.readdir(packageBase, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name));

const seenSlugs = new Set();
const seenOrders = new Map();
let checkedBuilders = 0;

for (const entry of entries) {
  const dirSlug = entry.name;
  const manifestRel = "packages/" + dirSlug + "/package.json";
  let pkg;
  try {
    pkg = JSON.parse(await read(manifestRel));
  } catch (error) {
    errors.push(manifestRel + ": " + error.message);
    continue;
  }

  need(pkg.schemaVersion === 2, dirSlug + ": schemaVersion must be 2");
  need(pkg.slug === dirSlug, dirSlug + ": manifest slug must match package directory");
  need(/^[a-z0-9][a-z0-9-]*$/.test(pkg.slug || ""), dirSlug + ": slug must be lowercase URL-safe text");
  need(!seenSlugs.has(pkg.slug), dirSlug + ": duplicate package slug " + pkg.slug);
  seenSlugs.add(pkg.slug);
  need(validStatuses.has(pkg.status), dirSlug + ": unsupported status " + pkg.status);
  need(typeof pkg.name === "string" && pkg.name.length > 0, dirSlug + ": name is required");
  need(typeof pkg.summary === "string" && pkg.summary.length > 0, dirSlug + ": summary is required");
  need(typeof pkg.category === "string" && pkg.category.length > 0, dirSlug + ": category is required");

  if (pkg.order != null) {
    need(Number.isInteger(pkg.order), dirSlug + ": order must be an integer");
    if (seenOrders.has(pkg.order)) errors.push(dirSlug + ": order " + pkg.order + " duplicates " + seenOrders.get(pkg.order));
    else seenOrders.set(pkg.order, dirSlug);
  }

  for (const key of ["version", "ref", "released", "homepage", "repository", "license"]) {
    need(typeof pkg.upstream?.[key] === "string" && pkg.upstream[key].length > 0, dirSlug + ": upstream." + key + " is required");
  }
  need(typeof pkg.tracker?.type === "string" && pkg.tracker.type.length > 0, dirSlug + ": tracker.type is required");
  need(typeof pkg.tracker?.repository === "string" && pkg.tracker.repository.length > 0, dirSlug + ": tracker.repository is required");

  const mode = pkg.tracker?.candidateMode ?? "none";
  need(validCandidateModes.has(mode), dirSlug + ": tracker.candidateMode must be auto, adapter-gated, or none");

  const profiles = Array.isArray(pkg.profiles) ? pkg.profiles : [];
  const profileIds = profiles.map((profile) => profile?.id).filter(Boolean);
  need(new Set(profileIds).size === profileIds.length, dirSlug + ": profile ids must be unique");

  if (activeStatuses.has(pkg.status)) {
    need(profiles.length > 0, dirSlug + ": " + pkg.status + " package must declare at least one profile");
    for (const profile of profiles) {
      need(typeof profile.id === "string" && profile.id.length > 0, dirSlug + ": every profile needs an id");
      need(profile.target === "browser", dirSlug + "/" + profile.id + ": onboarding contract currently requires target=browser");
      need(typeof profile.releaseAsset === "string" && profile.releaseAsset.length > 0, dirSlug + "/" + profile.id + ": releaseAsset is required");
    }

    for (const key of ["builderVersion", "toolchain", "buildModel"]) {
      need(typeof pkg.zoo?.[key] === "string" && pkg.zoo[key].length > 0, dirSlug + ": zoo." + key + " is required");
    }
    for (const key of ["reproducible", "sourceBundle", "checksums", "browserSmokeTest", "featureInventory", "supplyChainMetadata"]) {
      need(pkg.zoo?.[key] === true, dirSlug + ": zoo." + key + " must be true for active packages");
    }

    const requiredBuilderFiles = [
      "README.md",
      "build.sh",
      "build.bat",
      "versions.env",
      "docker/Dockerfile",
      "runtime/wasm-zoo.mjs",
      "scripts/build.ps1",
      "scripts/check-repository.mjs",
      "scripts/prepare-release.sh",
      "scripts/smoke-test.mjs",
      "tests/smoke-test.html"
    ];
    for (const rel of requiredBuilderFiles) {
      need(await exists("builders/" + dirSlug + "/" + rel), dirSlug + ": missing builder contract file builders/" + dirSlug + "/" + rel);
    }
    for (const profileId of profileIds) {
      need(await exists("builders/" + dirSlug + "/profiles/" + profileId + "/profile.env"), dirSlug + ": missing profile.env for " + profileId);
    }

    if (await exists("builders/" + dirSlug + "/versions.env")) {
      const env = await readEnv(path.join(root, "builders", dirSlug, "versions.env"));
      need(env.BUILDER_VERSION === pkg.zoo?.builderVersion, dirSlug + ": versions.env BUILDER_VERSION must match manifest zoo.builderVersion");
    }

    const buildWorkflowRel = ".github/workflows/build-" + dirSlug + ".yml";
    need(await exists(buildWorkflowRel), dirSlug + ": missing " + buildWorkflowRel);
    if (await exists(buildWorkflowRel)) {
      const workflow = await read(buildWorkflowRel);
      for (const marker of ["builders/" + dirSlug, "scripts/check-repository.mjs", "./build.sh"]) {
        need(workflow.includes(marker), dirSlug + ": build workflow missing contract marker " + marker);
      }
    }

    const checkerRel = "builders/" + dirSlug + "/scripts/check-repository.mjs";
    if (await exists(checkerRel)) {
      const result = spawnSync(process.execPath, [checkerRel], { cwd: root, encoding: "utf8" });
      checkedBuilders += 1;
      if (result.status !== 0) {
        errors.push((dirSlug + ": package repository checker failed\n" + (result.stdout || "") + (result.stderr || "")).trimEnd());
      }
    }
  }

  if (pkg.status === "available") {
    for (const key of ["tag", "page", "downloadBase", "sourceAsset", "checksumsAsset"]) {
      need(typeof pkg.release?.[key] === "string" && pkg.release[key].length > 0, dirSlug + ": available package requires release." + key);
    }
    need(typeof pkg.integration?.summary === "string" && pkg.integration.summary.length > 0, dirSlug + ": available package requires integration.summary");
    need(Array.isArray(pkg.integration?.files) && pkg.integration.files.length > 0, dirSlug + ": available package requires integration.files");
    need(typeof pkg.integration?.example === "string" && pkg.integration.example.length > 0, dirSlug + ": available package requires integration.example");
    need(Array.isArray(pkg.capabilityMatrix) && pkg.capabilityMatrix.length > 0, dirSlug + ": available package requires a capabilityMatrix");

    const releaseWorkflowRel = ".github/workflows/release-" + dirSlug + ".yml";
    need(await exists(releaseWorkflowRel), dirSlug + ": missing " + releaseWorkflowRel);
    if (await exists(releaseWorkflowRel)) {
      const workflow = await read(releaseWorkflowRel);
      for (const marker of ["builders/" + dirSlug, "scripts/prepare-release.sh", "gh release create"]) {
        need(workflow.includes(marker), dirSlug + ": release workflow missing contract marker " + marker);
      }
    }

    const playgroundProfiles = profiles.filter((profile) => profile.playground === true);
    need(playgroundProfiles.length > 0, dirSlug + ": available package must expose at least one Playground profile");
    if (playgroundProfiles.length) {
      for (const rel of ["index.html", "app.js"]) {
        need(await exists("site/" + dirSlug + "-playground/" + rel), dirSlug + ": missing Playground file site/" + dirSlug + "-playground/" + rel);
      }
      need(pagesWorkflow.includes("builders/" + dirSlug + "/"), dirSlug + ": Pages workflow must stage the package builder/runtime");
      need(pagesWorkflow.includes("site/assets/" + dirSlug + "/"), dirSlug + ": Pages workflow must stage published assets under site/assets/" + dirSlug + "/");
    }
  }

  const candidateProfiles = Array.isArray(pkg.tracker?.candidateProfiles) ? pkg.tracker.candidateProfiles : [];
  for (const profileId of candidateProfiles) {
    need(profileIds.includes(profileId), dirSlug + ": candidate profile " + profileId + " is not a declared package profile");
  }
  if (mode === "auto") {
    need(candidateProfiles.length > 0, dirSlug + ": automatic package requires tracker.candidateProfiles");
    const config = automaticCandidateConfig(dirSlug);
    need(Boolean(config), dirSlug + ": automatic package missing scripts/upstream-config.mjs entry");
    if (config) {
      need(config.dir === dirSlug, dirSlug + ": automatic candidate dir must match slug");
      need(config.buildWorkflow === "build-" + dirSlug + ".yml", dirSlug + ": automatic candidate buildWorkflow must be build-" + dirSlug + ".yml");
    }
    need(upstreamWorkflow.includes("inputs.slug == '" + dirSlug + "'"), dirSlug + ": upstream-candidate.yml missing candidate job");
    need(upstreamWorkflow.includes(dirSlug + ") result='"), dirSlug + ": upstream-candidate.yml report job missing result mapping");
    need(upstreamWorkflow.includes(dirSlug + ") node builders/" + dirSlug + "/scripts/check-repository.mjs ;;"), dirSlug + ": promotion validation missing package checker");
  }

  if (pkg.npm?.status === "published") {
    need(pkg.npm.package === "@wasm-zoo/" + dirSlug, dirSlug + ": published npm package must be @wasm-zoo/" + dirSlug);
    need(profileIds.includes(pkg.npm.profile), dirSlug + ": npm.profile must reference a declared profile");
    need(pkg.npm.publishWorkflow === "publish-npm.yml", dirSlug + ": npm.publishWorkflow must remain publish-npm.yml");
    need(Array.isArray(pkg.npm.packageFiles?.required) && pkg.npm.packageFiles.required.length > 0, dirSlug + ": published npm package requires packageFiles.required");
    need(Array.isArray(pkg.npm.runtime?.assets) && pkg.npm.runtime.assets.length > 0, dirSlug + ": published npm package requires runtime.assets");
    need(hasSlug(smokeNpm, dirSlug), dirSlug + ": shared npm smoke runner has no package-specific fixture/operation");
  }
}

if (errors.length) {
  console.error("[NG] " + errors.length + " package onboarding contract check(s)");
  for (const error of errors) console.error(" - " + error.replace(/\n/g, "\n   "));
  process.exit(1);
}

console.log("[OK] package onboarding contract passed for " + entries.length + " package manifests; " + checkedBuilders + " active builder checker(s) passed");
