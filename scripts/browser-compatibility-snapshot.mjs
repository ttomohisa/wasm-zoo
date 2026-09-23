import { assessThreadedRuntime } from "./threaded-browser-capabilities.mjs";

export const browsers = Object.freeze(["chromium", "firefox", "webkit"]);
export const packageSlugs = Object.freeze(["jq", "libarchive", "imagemagick", "ghostscript", "ffmpeg", "libvips"]);
export const maxAgeMs = 14 * 24 * 60 * 60 * 1000;

export function selectMainRun(runs) {
  // The most recent *attempt*, not the most recent green run, must drive
  // the public status. Never reuse older success after a newer CI failure.
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => run.head_branch === "main" &&
      ["push", "schedule", "workflow_dispatch"].includes(run.event))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] || null;
}

export function baseSnapshot(packages, generatedAt, source = null, state = "unavailable", reason = "No verified main-branch run") {
  return {
    schemaVersion: 1,
    generatedAt,
    state,
    reason,
    source,
    results: packageSlugs.flatMap((slug) => {
      const pkg = packages.find((item) => item.slug === slug);
      return browsers.map((browser) => ({
        package: slug,
        npmPackage: pkg?.npm?.package || null,
        npmVersion: pkg?.npm?.version || null,
        profile: pkg?.npm?.profile || null,
        browser,
        browserVersion: null,
        status: "not-tested",
        testedAt: null,
        detail: null,
        reason: reason || "Not tested on this main-branch run"
      }));
    })
  };
}

export function checkSource(run, now = new Date().toISOString()) {
  if (!run || run.head_branch !== "main" ||
      !["push", "schedule", "workflow_dispatch"].includes(run.event) ||
      !Number.isSafeInteger(run.id) || !/^[a-f0-9]{40}$/.test(run.head_sha || "") ||
      !run.html_url?.startsWith("https://github.com/ttomohisa/wasm-zoo/actions/runs/")) {
    throw new Error("A verifiable main-branch GitHub Actions source is required");
  }
  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(`Latest main-branch cross-browser CI: ${run.status || "unknown"} / ${run.conclusion || "none"}`);
  }
  const finishedAt = Date.parse(run.updated_at || "");
  const nowAt = Date.parse(now);
  if (!Number.isFinite(finishedAt) || !Number.isFinite(nowAt) || finishedAt > nowAt + 300000 || nowAt - finishedAt > maxAgeMs) {
    throw new Error("Latest verified browser run is missing a valid timestamp or older than 14 days");
  }
  return {
    workflow: "cross-browser-compat.yml",
    runId: run.id,
    url: run.html_url,
    headSha: run.head_sha,
    headBranch: "main",
    event: run.event,
    completedAt: run.updated_at
  };
}

export function buildVerifiedSnapshot({ packages, run, records, generatedAt = new Date().toISOString() }) {
  const source = checkSource(run, generatedAt);
  const lookup = new Map(records.map((record) => [`${record.package}/${record.browser}`, record]));
  if (lookup.size !== 18 || records.length !== 18) throw new Error("Expected exactly 18 distinct browser-operation records");
  const expected = [];
  for (const slug of packageSlugs) {
    const pkg = packages.find((item) => item.slug === slug);
    if (!pkg || pkg.npm?.status !== "published") throw new Error(`${slug} does not have published npm metadata`);
    const profile = pkg.profiles?.find((item) => item.id === pkg.npm.profile);
    if (!profile) throw new Error(`${slug} npm profile is not in the reviewed catalog`);
    for (const browser of browsers) {
      const record = lookup.get(`${slug}/${browser}`);
      if (!record) throw new Error(`Missing result for ${slug}/${browser}`);
      if (record.schemaVersion !== 1 || record.package !== slug || record.browser !== browser ||
          record.npmPackage !== pkg.npm.package || record.npmVersion !== pkg.npm.version ||
          record.profile !== profile.id) {
        throw new Error(`Mismatched browser result identity/version for ${slug}/${browser}`);
      }
      const testedAt = Date.parse(record.testedAt || "");
      const completedAt = Date.parse(run.updated_at);
      if (!record.browserVersion || !Number.isFinite(testedAt) ||
          testedAt > completedAt + 300000 || testedAt < Date.parse(run.created_at) - 300000) {
        throw new Error(`Browser version or timestamp is invalid for ${slug}/${browser}`);
      }
      if (record.status === "pass") {
        if (record.phase !== "complete" || typeof record.detail !== "string" || !record.detail.trim() || record.reason) {
          throw new Error(`A pass must include a completed real operation for ${slug}/${browser}`);
        }
        if (profile.sharedArrayBuffer && assessThreadedRuntime({
          headers: record.responseHeaders, capabilities: record.runtimeCapabilities
        }).status !== "pass") {
          throw new Error(`Threaded pass is missing a passing capability preflight for ${slug}/${browser}`);
        }
      } else if (record.status === "unsupported") {
        if (!profile.sharedArrayBuffer || browser === "chromium" || record.phase !== "runtime-preflight") {
          throw new Error(`Unsupported is not allowed for ${slug}/${browser}`);
        }
        const observed = assessThreadedRuntime({
          headers: record.responseHeaders, capabilities: record.runtimeCapabilities
        });
        if (observed.status !== "unsupported" || observed.reason !== record.reason) {
          throw new Error(`Unsupported lacks specific observed evidence for ${slug}/${browser}`);
        }
      } else {
        throw new Error(`Unverified result ${record.status} for ${slug}/${browser}`);
      }
      expected.push({
        package: slug,
        npmPackage: pkg.npm.package,
        npmVersion: pkg.npm.version,
        profile: pkg.npm.profile,
        browser,
        browserVersion: record.browserVersion,
        status: record.status,
        testedAt: record.testedAt,
        detail: record.detail,
        reason: record.reason,
        runtimeCapabilities: profile.sharedArrayBuffer ? record.runtimeCapabilities : null
      });
    }
  }
  return {
    schemaVersion: 1,
    generatedAt,
    state: "verified",
    reason: null,
    source,
    results: expected
  };
}
