import { pathToFileURL } from "node:url";
import { loadPackages } from "./lib.mjs";
import { automaticCandidateConfig } from "./upstream-config.mjs";

function arg(name) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function psSingle(value) {
  return String(value).replaceAll("'", "''");
}

export function buildPromotionHumanHandoff(pkg, config, options = {}) {
  if (!pkg?.slug) throw new Error("Package slug is required");
  if (pkg.status !== "available") throw new Error(pkg.slug + " is not an available package");
  if (!pkg.release?.tag) throw new Error(pkg.slug + " release.tag is required");
  if (!pkg.zoo?.builderVersion) throw new Error(pkg.slug + " zoo.builderVersion is required");
  if (!pkg.upstream?.version) throw new Error(pkg.slug + " upstream.version is required");

  const repository = options.repository || "ttomohisa/wasm-zoo";
  const mergeSha = options.mergeSha || null;
  const prNumber = options.prNumber || null;
  const issueNumber = options.issueNumber || null;
  const releaseTag = pkg.release.tag;
  const releaseWorkflow = "release-" + pkg.slug + ".yml";
  const buildWorkflow = config?.buildWorkflow || ("build-" + pkg.slug + ".yml");
  const npm = pkg.npm || null;
  const keepNpmPinned = Boolean(config?.keepNpmPinned);

  const lines = [
    "<!-- wasm-zoo-human-handoff -->",
    "## After merge — human handoff",
    "",
    mergeSha
      ? "Promotion PR" + (prNumber ? " #" + prNumber : "") + " is merged. The reviewed promotion commit is " + mergeSha + "."
      : "Use these steps only after this review-only promotion PR is merged.",
    "",
    "Automation stops at the reviewed PR. It does **not** create the package tag, GitHub Release, npm publication, or merge any follow-up change.",
    "",
    "### 1. Confirm reviewed main CI",
    "",
    "Verify the normal catalog validation and the package build workflow are green on main:",
    "",
    "~~~powershell",
    "gh run list --repo " + repository + " --workflow verify.yml --branch main --limit 1",
    "gh run list --repo " + repository + " --workflow " + buildWorkflow + " --branch main --limit 1",
    "~~~",
    "",
    "Then sync local main:",
    "",
    "~~~powershell",
    "git switch main",
    "git pull --ff-only origin main",
    "git rev-parse HEAD"
  ];

  if (mergeSha) {
    lines.push(
      "git merge-base --is-ancestor " + mergeSha + " HEAD",
      "if ($LASTEXITCODE -ne 0) { throw 'The reviewed promotion merge is not an ancestor of local HEAD.' }"
    );
  }

  lines.push(
    "~~~",
    "",
    "### 2. Create the package tag manually",
    "",
    "Expected package tag: " + releaseTag,
    "",
    "~~~powershell",
    "git ls-remote --tags origin refs/tags/" + releaseTag,
    "git tag -a " + releaseTag + " -m '" + psSingle(pkg.name + " " + pkg.upstream.version + " — WASM Zoo builder " + pkg.zoo.builderVersion) + "'",
    "git push origin " + releaseTag,
    "git ls-remote --tags origin refs/tags/" + releaseTag,
    "~~~",
    "",
    "Pushing the tag should trigger " + releaseWorkflow + ". Do not recreate or overwrite an existing tag.",
    "",
    "### 3. Confirm the immutable package Release",
    "",
    "~~~powershell",
    "gh run list --repo " + repository + " --workflow " + releaseWorkflow + " --limit 1",
    "gh release view " + releaseTag + " --repo " + repository,
    "~~~",
    "",
    "Confirm the package Release workflow, Release Health, and Pages are healthy before treating the promotion as released.",
    ""
  );

  if (!npm) {
    lines.push(
      "### 4. npm",
      "",
      "This package has no npm distribution metadata. No npm action is part of this promotion.",
      ""
    );
  } else if (keepNpmPinned) {
    const sourceTag = npm.source?.releaseTag || "<separately reviewed source release>";
    lines.push(
      "### 4. npm — intentionally separate and pinned",
      "",
      "No npm publication is required for this package promotion. Keep " + npm.package + "@" + npm.version + " pinned to " + sourceTag + " until a separate npm-only review explicitly changes that identity.",
      "",
      "Do **not** run npm staging merely because the package Release advanced.",
      ""
    );
  } else {
    lines.push(
      "### 4. npm — separate reviewed follow-up",
      "",
      "The promoted manifest expects " + npm.package + "@" + npm.version + ". Only after the immutable package Release above exists, prepare and review the exact npm artifact:",
      "",
      "~~~powershell",
      "gh workflow run publish-npm.yml --repo " + repository + " --ref main -f slug=" + pkg.slug + " -f mode=pack",
      "~~~",
      "",
      "After reviewing the packed artifact, stage the new version for maintainer approval:",
      "",
      "~~~powershell",
      "gh workflow run publish-npm.yml --repo " + repository + " --ref main -f slug=" + pkg.slug + " -f mode=stage",
      "~~~",
      "",
      "The stage workflow does not silently complete publication: maintainer review / npm 2FA approval remains required.",
      ""
    );
  }

  lines.push(
    "### 5. Close the upstream watcher issue",
    "",
    "Close the upstream issue only after the package tag and immutable GitHub Release are confirmed."
  );

  if (issueNumber) {
    lines.push(
      "",
      "~~~powershell",
      "gh issue close " + issueNumber + " --repo " + repository + " --comment 'Released " + releaseTag + " after reviewed promotion and successful package Release workflow.'",
      "~~~"
    );
  }

  lines.push(
    "",
    "**Reviewed boundary:** no step above is performed automatically by this handoff workflow."
  );

  return lines.join("\n") + "\n";
}

async function main() {
  const slug = arg("slug");
  if (!slug) throw new Error("Usage: node scripts/promotion-human-handoff.mjs --slug <slug> [--merge-sha <sha>] [--pr <number>] [--issue <number>]");
  const packages = await loadPackages();
  const pkg = packages.find((entry) => entry.slug === slug);
  if (!pkg) throw new Error("Unknown package slug: " + slug);
  const config = automaticCandidateConfig(slug);
  if (!config || pkg.tracker?.candidateMode !== "auto") throw new Error(slug + " is not an automatic promotion package");

  process.stdout.write(buildPromotionHumanHandoff(pkg, config, {
    repository: arg("repository") || "ttomohisa/wasm-zoo",
    mergeSha: arg("merge-sha"),
    prNumber: arg("pr"),
    issueNumber: arg("issue")
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
