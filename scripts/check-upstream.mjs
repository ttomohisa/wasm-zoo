import fs from "node:fs/promises";
import path from "node:path";
import { loadPackages, compareVersions, root } from "./lib.mjs";

const args = new Set(process.argv.slice(2));
const packages = await loadPackages();
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "wasm-zoo-upstream-checker",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
};

async function githubJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function parseVersion(text, pattern) {
  const value = String(text || "");
  if (pattern) {
    const match = value.match(new RegExp(pattern));
    if (!match) return null;
    return match[1] || match[0];
  }
  const match = value.match(/[0-9]+(?:[.-][0-9]+)+(?:-[0-9]+)?/);
  return match ? match[0] : value.replace(/^[^0-9]*/, "") || null;
}

async function commitForRef(repo, ref) {
  const data = await githubJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(ref)}`);
  return {
    sha: data.sha,
    date: data.commit?.committer?.date || data.commit?.author?.date || null
  };
}

async function latestFor(pkg) {
  const tracker = pkg.tracker;
  if (!tracker?.repository || !tracker?.type) throw new Error("tracker configuration is missing");
  const repo = tracker.repository;

  if (tracker.type === "github-releases") {
    const data = await githubJson(`https://api.github.com/repos/${repo}/releases?per_page=30`);
    const release = data.find((item) => !item.draft && !item.prerelease);
    if (!release) throw new Error("no stable GitHub release found");
    const sourceText = tracker.versionSource === "name" ? release.name : `${release.tag_name || ""} ${release.name || ""}`;
    const version = parseVersion(sourceText, tracker.versionPattern);
    if (!version) throw new Error(`release version did not match ${tracker.versionPattern || "default parser"}`);
    const ref = release.tag_name;
    const commit = await commitForRef(repo, ref);
    return {
      version,
      ref,
      commit: commit.sha,
      released: release.published_at || release.created_at || commit.date,
      url: release.html_url
    };
  }

  if (tracker.type === "github-tags") {
    const pattern = new RegExp(tracker.tagPattern || "^(.*)$");
    const data = await githubJson(`https://api.github.com/repos/${repo}/tags?per_page=100`);
    const matches = data
      .map((tag) => ({ tag, match: tag.name.match(pattern) }))
      .filter((item) => item.match)
      .map((item) => ({ ...item, version: item.match[1] || parseVersion(item.tag.name) }))
      .filter((item) => item.version);
    if (!matches.length) throw new Error("no matching GitHub tag found");
    matches.sort((a, b) => compareVersions(a.version, b.version));
    const latest = matches.at(-1);
    const commit = await commitForRef(repo, latest.tag.name);
    return {
      version: latest.version,
      ref: latest.tag.name,
      commit: commit.sha || latest.tag.commit?.sha || null,
      released: commit.date,
      url: `https://github.com/${repo}/tree/${encodeURIComponent(latest.tag.name)}`
    };
  }

  throw new Error(`unsupported tracker type: ${tracker.type}`);
}

function wholeDaysBetween(from, to) {
  const a = Date.parse(from || "");
  const b = Date.parse(to || "");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.floor((b - a) / 86400000);
}

function versionGap(latest, pinned) {
  if (!pinned) return { kind: "planned", label: "Not pinned", versionsBehind: null };
  const cmp = compareVersions(latest, pinned);
  if (cmp <= 0) return { kind: "current", label: "Current", versionsBehind: 0 };
  const latestParts = String(latest).match(/\d+/g)?.map(Number) || [];
  const pinnedParts = String(pinned).match(/\d+/g)?.map(Number) || [];
  const majorDelta = Math.max(0, (latestParts[0] || 0) - (pinnedParts[0] || 0));
  const minorDelta = majorDelta === 0 ? Math.max(0, (latestParts[1] || 0) - (pinnedParts[1] || 0)) : null;
  return {
    kind: "behind",
    label: majorDelta ? `${majorDelta} major behind` : minorDelta ? `${minorDelta} minor behind` : "Update available",
    versionsBehind: majorDelta || minorDelta || 1
  };
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  hasUpdates: false,
  packages: []
};

for (const pkg of packages) {
  try {
    const latest = await latestFor(pkg);
    const pinned = pkg.upstream.version;
    const gap = versionGap(latest.version, pinned);
    const updateAvailable = gap.kind === "behind";
    if (updateAvailable) report.hasUpdates = true;
    report.packages.push({
      slug: pkg.slug,
      name: pkg.name,
      status: "ok",
      pinned,
      pinnedRef: pkg.upstream.ref,
      pinnedReleased: pkg.upstream.released,
      latest: latest.version,
      latestRef: latest.ref,
      latestCommit: latest.commit,
      latestReleased: latest.released,
      updateAvailable,
      lagDays: updateAvailable ? wholeDaysBetween(pkg.upstream.released, latest.released) : 0,
      gap,
      url: latest.url,
      candidate: {
        mode: pkg.tracker.candidateMode || "none",
        profiles: pkg.tracker.candidateProfiles || []
      }
    });
  } catch (error) {
    report.packages.push({
      slug: pkg.slug,
      name: pkg.name,
      status: "error",
      pinned: pkg.upstream.version,
      pinnedRef: pkg.upstream.ref,
      pinnedReleased: pkg.upstream.released,
      error: error.message,
      candidate: { mode: pkg.tracker?.candidateMode || "none", profiles: pkg.tracker?.candidateProfiles || [] }
    });
  }
}

if (args.has("--write-site")) {
  const successfulChecks = report.packages.filter((item) => item.status === "ok").length;
  if (successfulChecks === 0) throw new Error("all upstream checks failed; refusing to replace the last good Pages snapshot");
  await fs.writeFile(path.join(root, "site", "upstream-status.json"), `${JSON.stringify(report, null, 2)}\n`);
}

if (args.has("--markdown")) {
  console.log("| Project | Zoo | Upstream | Gap | Candidate |");
  console.log("| --- | ---: | ---: | --- | --- |");
  for (const item of report.packages) {
    if (item.status === "error") console.log(`| ${item.name} | ${item.pinned || "—"} | error | ${item.error.replace(/\|/g, "\\|")} | — |`);
    else console.log(`| ${item.name} | ${item.pinned || "Planned"} | ${item.latest} | ${item.gap.label} | ${item.candidate.mode} |`);
  }
} else if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log("WASM Zoo upstream report");
  for (const item of report.packages) {
    if (item.status === "error") console.log(`! ${item.name}: ${item.error}`);
    else if (!item.pinned) console.log(`· ${item.name}: upstream ${item.latest} / Zoo planned`);
    else console.log(`${item.updateAvailable ? "↑" : "="} ${item.name}: Zoo ${item.pinned} / upstream ${item.latest} (${item.gap.label})`);
  }
  if (report.hasUpdates) console.log("\nUpdates are available for one or more pinned packages.");
}

if (args.has("--fail-on-update") && report.hasUpdates) process.exit(2);
