import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadPackages, root } from "./lib.mjs";
import {
  baseSnapshot, browsers, packageSlugs, selectMainRun, buildVerifiedSnapshot
} from "./browser-compatibility-snapshot.mjs";

const generatedAt = new Date().toISOString();
const packages = await loadPackages();
const destination = path.join(root, "site", "browser-compatibility.json");
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || "ttomohisa/wasm-zoo";
if (repository !== "ttomohisa/wasm-zoo") throw new Error("Browser compatibility publisher is bound to ttomohisa/wasm-zoo");

let snapshot = baseSnapshot(packages, generatedAt);
let work;
try {
  if (!token) throw new Error("No GitHub Actions read token; main-branch results were not fetched");
  const url = `https://api.github.com/repos/${repository}/actions/workflows/cross-browser-compat.yml/runs?branch=main&per_page=30`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "wasm-zoo-pages-compat"
    }
  });
  if (!response.ok) throw new Error(`GitHub run discovery failed: HTTP ${response.status}`);
  const list = await response.json();
  const run = selectMainRun(list.workflow_runs);
  if (!run) throw new Error("No reviewed main-branch cross-browser run has started");
  const reference = {
    runId: run.id,
    url: run.html_url,
    headSha: run.head_sha,
    headBranch: run.head_branch,
    event: run.event,
    completedAt: run.status === "completed" ? run.updated_at : null,
    conclusion: run.conclusion || null
  };
  snapshot = baseSnapshot(packages, generatedAt, reference, "unavailable",
    `Latest main-branch browser run: ${run.status} / ${run.conclusion || "pending"}`);
  if (run.status !== "completed" || run.conclusion !== "success") {
    console.warn(`[WARN] ${snapshot.reason}; no older passing artifacts will be published`);
  } else {
    work = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-zoo-compat-pages-"));
    const result = spawnSync("gh", [
      "run", "download", String(run.id),
      "--repo", repository,
      "--pattern", "*-compatibility",
      "--dir", work
    ], {
      encoding: "utf8",
      shell: false,
      env: { ...process.env, GH_TOKEN: token },
      maxBuffer: 16 * 1024 * 1024
    });
    if (result.error || result.status !== 0) {
      throw new Error(`GitHub artifact download failed: ${result.stderr || result.error?.message || result.status}`);
    }
    const records = [];
    for (const slug of packageSlugs) {
      for (const browser of browsers) {
        const artifact = slug === "ffmpeg" || slug === "libvips"
          ? `threaded-${slug}-${browser}-compatibility`
          : `${slug}-${browser}-compatibility`;
        const filename = path.join(work, artifact, `${slug}-${browser}.json`);
        records.push(JSON.parse(await fs.readFile(filename, "utf8")));
      }
    }
    snapshot = buildVerifiedSnapshot({ packages, run, records, generatedAt });
    console.log(`[OK] verified all ${packageSlugs.length * browsers.length} exact-version results from main workflow run ${run.id}`);
  }
} catch (error) {
  const reason = String(error?.message || error).slice(0, 500);
  snapshot = baseSnapshot(packages, generatedAt, snapshot.source, "unavailable", reason);
  console.warn(`[WARN] public browser compatibility snapshot unavailable: ${reason}`);
} finally {
  if (work) await fs.rm(work, { recursive: true, force: true });
}

await fs.writeFile(destination, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`[OK] staged public browser compatibility: ${snapshot.state} (${snapshot.results.filter((x) => x.status === "pass").length} real passes) at ${destination}`);
