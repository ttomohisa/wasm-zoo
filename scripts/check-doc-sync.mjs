import fs from "node:fs/promises";
import path from "node:path";
import { loadPackages, root } from "./lib.mjs";

const errors = [];
const need = (ok, message) => { if (!ok) errors.push(message); };
const read = async (rel) => (await fs.readFile(path.join(root, rel), "utf8")).replace(/\r\n/g, "\n");

const packages = (await loadPackages()).filter((pkg) => pkg.status === "available");
const readme = await read("README.md");
const npmDoc = await read("docs/NPM_DISTRIBUTION.md");
const changelog = await read("CHANGELOG.md");
const projectVersion = (await read("VERSION")).trim();
const projectManifest = JSON.parse(await read("package.json"));

need(projectVersion === projectManifest.version, "Project VERSION must match root package.json");
need(readme.includes(`The project version is **WASM Zoo v${projectVersion}**`), "README project version must match VERSION");
need(changelog.includes(`## v${projectVersion}\n`), "CHANGELOG must contain the current reviewed project version");
need(changelog.startsWith("# Changelog\n\n## Unreleased\n"), "CHANGELOG must retain a separate Unreleased section");

const [projectMajor, projectMinor, projectPatch] = projectVersion.split(".").map(Number);
const releaseReviewStem = `V${projectMajor}${String(projectMinor).padStart(2, "0")}${projectPatch > 0 ? projectPatch : ""}`;
const releaseReviewPath = `docs/${releaseReviewStem}_RELEASE.md`;
let releaseReview = "";
try { releaseReview = await read(releaseReviewPath); } catch {}
need(Boolean(releaseReview), `${releaseReviewPath} must exist for the current reviewed project version`);
if (releaseReview) {
  need(releaseReview.startsWith(`# WASM Zoo v${projectVersion} — project release review\n`), `${releaseReviewPath} heading must match v${projectVersion}`);
  const releaseLibvips = packages.find((pkg) => pkg.slug === "libvips");
  need(releaseReview.includes("libvips"), `${releaseReviewPath} must describe the libvips candidate contract`);
  if (releaseLibvips?.tracker?.candidateMode === "auto") {
    need(releaseReview.includes("fail-closed") && releaseReview.includes("adapter"), `${releaseReviewPath} must describe libvips fail-closed adapter automation`);
  } else if (releaseLibvips?.tracker?.candidateMode === "adapter-gated") {
    need(releaseReview.includes("adapter-gated"), `${releaseReviewPath} must preserve the libvips adapter gate`);
  }
  need(releaseReview.includes("never automatically merges, tags, creates a GitHub Release or publishes npm"), `${releaseReviewPath} must preserve the human release boundary`);
}

function rowByPrefix(text, prefix) {
  return text.split("\n").find((line) => line.startsWith(prefix)) || "";
}

for (const pkg of packages) {
  const row = rowByPrefix(readme, "| " + pkg.name + " |");
  need(Boolean(row), "README package row missing for " + pkg.name);
  if (row) {
    need(row.includes("| " + pkg.upstream.version + " |"), "README upstream version is stale for " + pkg.name);
    need(row.includes("| " + pkg.zoo.builderVersion + " |"), "README builder version is stale for " + pkg.name);
    for (const profile of pkg.profiles || []) {
      need(row.includes("`" + profile.id + "`"), "README profile " + profile.id + " missing for " + pkg.name);
    }
    if (pkg.npm) {
      need(row.includes("`" + pkg.npm.package + "@" + pkg.npm.version + "`"), "README npm version is stale for " + pkg.name);
    }
  }

  if (pkg.npm) {
    const npmRow = rowByPrefix(npmDoc, "| `" + pkg.npm.package + "` |");
    need(Boolean(npmRow), "npm distribution row missing for " + pkg.npm.package);
    if (npmRow) {
      need(npmRow.includes("| `" + pkg.npm.version + "` |"), "npm distribution version is stale for " + pkg.npm.package);
      const npmSource = pkg.npm.source || {};
      need(npmRow.includes("| " + pkg.name + " " + (npmSource.upstreamVersion || pkg.upstream.version) + " |"), "npm distribution upstream version is stale for " + pkg.npm.package);
      need(npmRow.includes("| `" + (npmSource.builderVersion || pkg.zoo.builderVersion) + "` |"), "npm distribution builder version is stale for " + pkg.npm.package);
      need(npmRow.includes("`" + (npmSource.releaseTag || pkg.release.tag) + "`"), "npm distribution release tag is stale for " + pkg.npm.package);
      need(npmRow.includes("| " + pkg.npm.status + " |"), "npm distribution status is stale for " + pkg.npm.package);
    }
  }
}

const ghost = packages.find((pkg) => pkg.slug === "ghostscript");
if (ghost) {
  need(readme.includes("ghostscript-" + ghost.upstream.version + ".tar.xz"), "README Ghostscript official source archive version is stale");
  need(readme.includes("gs" + ghost.upstream.version), "README Ghostscript source ref version is stale");
  need(!readme.includes("Automatic candidate builds are source-digest gated and therefore remain disabled"), "README must not claim Ghostscript automatic candidates are disabled");
  need(readme.includes("For FFmpeg, libarchive, ImageMagick, libvips, Ghostscript, jq and Zstandard"), "README automatic package list must include all reviewed automatic packages");
}

if (errors.length) {
  console.error("[NG] " + errors.length + " release documentation sync check(s)");
  for (const error of errors) console.error(" - " + error);
  process.exit(1);
}
console.log("[OK] release documentation matches current package metadata");
