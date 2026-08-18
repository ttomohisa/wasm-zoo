import { loadPackages, compareVersions } from "./lib.mjs";

const packages = await loadPackages();
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headers = {
  "Accept": "application/vnd.github+json",
  "User-Agent": "wasm-zoo-upstream-checker",
  ...(token ? { "Authorization": `Bearer ${token}` } : {})
};

async function githubJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function latestFor(pkg) {
  const repo = pkg.tracker.repository;
  if (pkg.tracker.type === "github-releases") {
    const data = await githubJson(`https://api.github.com/repos/${repo}/releases?per_page=20`);
    const release = data.find((item) => !item.draft && !item.prerelease);
    if (!release) throw new Error("no stable GitHub release found");
    return { version: release.tag_name.replace(/^[^0-9]*/, ""), ref: release.tag_name, url: release.html_url };
  }
  if (pkg.tracker.type === "github-tags") {
    const pattern = new RegExp(pkg.tracker.tagPattern || "^(.*)$");
    const data = await githubJson(`https://api.github.com/repos/${repo}/tags?per_page=100`);
    const matches = data.map((tag) => ({ tag: tag.name, match: tag.name.match(pattern) })).filter((item) => item.match);
    if (!matches.length) throw new Error("no matching GitHub tag found");
    matches.sort((a, b) => compareVersions(a.match[1], b.match[1]));
    const latest = matches.at(-1);
    return { version: latest.match[1], ref: latest.tag, url: `https://github.com/${repo}/tree/${latest.tag}` };
  }
  throw new Error(`unsupported tracker type: ${pkg.tracker.type}`);
}

const report = { generatedAt: new Date().toISOString(), hasUpdates: false, packages: [] };
for (const pkg of packages) {
  try {
    const latest = await latestFor(pkg);
    const pinned = pkg.upstream.version;
    const updateAvailable = Boolean(pinned && compareVersions(latest.version, pinned) > 0);
    if (updateAvailable) report.hasUpdates = true;
    report.packages.push({ slug: pkg.slug, name: pkg.name, status: "ok", pinned, latest: latest.version, latestRef: latest.ref, updateAvailable, url: latest.url });
  } catch (error) {
    report.packages.push({ slug: pkg.slug, name: pkg.name, status: "error", pinned: pkg.upstream.version, error: error.message });
  }
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log("WASM Zoo upstream report");
  for (const item of report.packages) {
    if (item.status === "error") console.log(`! ${item.name}: ${item.error}`);
    else if (!item.pinned) console.log(`· ${item.name}: latest ${item.latest} (planned / not pinned)`);
    else console.log(`${item.updateAvailable ? "↑" : "="} ${item.name}: Zoo ${item.pinned} / upstream ${item.latest}`);
  }
  if (report.hasUpdates) console.log("\nUpdates are available for one or more pinned packages.");
}

if (process.argv.includes("--fail-on-update") && report.hasUpdates) process.exit(2);
