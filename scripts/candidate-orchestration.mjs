import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPackages, root } from "./lib.mjs";
import { automaticCandidateConfig } from "./upstream-config.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

export async function resolveAutomaticCandidate(slug) {
  if (!slug) throw new Error("Missing candidate slug");
  const packages = await loadPackages();
  const pkg = packages.find((entry) => entry.slug === slug);
  if (!pkg) throw new Error(`Unknown package slug: ${slug}`);
  if (pkg.tracker?.candidateMode !== "auto") throw new Error(`${slug} is not candidateMode=auto`);
  const config = automaticCandidateConfig(slug);
  if (!config) throw new Error(`${slug} has no automatic candidate config`);
  const profiles = Array.isArray(pkg.tracker?.candidateProfiles) ? pkg.tracker.candidateProfiles : [];
  if (!profiles.length) throw new Error(`${slug} has no candidateProfiles`);
  const checker = `builders/${slug}/scripts/check-repository.mjs`;
  const stat = await fs.stat(path.join(root, checker)).catch(() => null);
  if (!stat?.isFile()) throw new Error(`${slug} repository checker is missing: ${checker}`);
  return { slug, profiles, checker, config };
}

export function selectedCandidateResult(slug, needs) {
  if (!needs || typeof needs !== "object") throw new Error("Candidate needs JSON is required");
  const selected = needs[slug];
  if (!selected || typeof selected.result !== "string") {
    throw new Error(`Candidate result for ${slug} is missing from workflow needs`);
  }
  const allowed = new Set(["success", "failure", "cancelled", "skipped"]);
  if (!allowed.has(selected.result)) throw new Error(`Unexpected candidate result for ${slug}: ${selected.result}`);
  return selected.result;
}

async function main() {
  const command = process.argv[2];
  const slug = arg("slug");
  const resolved = await resolveAutomaticCandidate(slug);

  if (command === "validate") {
    console.log(`[OK] automatic candidate registered: ${resolved.slug} (${resolved.profiles.join(", ")})`);
    return;
  }

  if (command === "checker") {
    process.stdout.write(`${resolved.checker}\n`);
    return;
  }

  if (command === "result") {
    const raw = process.env.CANDIDATE_NEEDS_JSON;
    if (!raw) throw new Error("CANDIDATE_NEEDS_JSON is required");
    const result = selectedCandidateResult(slug, JSON.parse(raw));
    const output = process.env.GITHUB_OUTPUT;
    if (output) await fs.appendFile(output, `result=${result}\n`);
    process.stdout.write(`${result}\n`);
    return;
  }

  throw new Error("Usage: node scripts/candidate-orchestration.mjs <validate|checker|result> --slug <slug>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
