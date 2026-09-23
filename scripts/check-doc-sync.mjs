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
      const npmUpstream = pkg.slug === "zstd" ? pkg.npm.publishedSource?.upstreamVersion : pkg.upstream.version;
      need(npmRow.includes("| " + pkg.name + " " + npmUpstream + " |"), "npm distribution upstream version is stale for " + pkg.npm.package);
      const npmBuilder = pkg.slug === "zstd" ? pkg.npm.publishedSource?.builderVersion : pkg.zoo.builderVersion;
      const npmSourceTag = pkg.slug === "zstd" ? pkg.npm.publishedSource?.releaseTag : pkg.release.tag;
      need(npmRow.includes("| `" + npmBuilder + "` |"), "npm distribution builder version is stale for " + pkg.npm.package);
      need(npmRow.includes("`" + npmSourceTag + "`"), "npm distribution release tag is stale for " + pkg.npm.package);
      need(npmRow.includes("| " + pkg.npm.status + " |"), "npm distribution status is stale for " + pkg.npm.package);
    }
  }
}

const ghost = packages.find((pkg) => pkg.slug === "ghostscript");
if (ghost) {
  need(readme.includes("ghostscript-" + ghost.upstream.version + ".tar.xz"), "README Ghostscript official source archive version is stale");
  need(readme.includes("gs" + ghost.upstream.version), "README Ghostscript source ref version is stale");
  need(!readme.includes("Automatic candidate builds are source-digest gated and therefore remain disabled"), "README must not claim Ghostscript automatic candidates are disabled");
  need(readme.includes("For FFmpeg, libarchive, ImageMagick, Ghostscript and jq"), "README automatic package list must include Ghostscript");
}

if (errors.length) {
  console.error("[NG] " + errors.length + " release documentation sync check(s)");
  for (const error of errors) console.error(" - " + error);
  process.exit(1);
}
console.log("[OK] release documentation matches current package metadata");
