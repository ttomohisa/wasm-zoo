import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadPackages } from "./lib.mjs";

function setsFromPublished(published) {
  const all = published.map((entry) => entry.slug);
  const threaded = published.filter((entry) => entry.threaded).map((entry) => entry.slug);
  const single = published.filter((entry) => !entry.threaded).map((entry) => entry.slug);
  const baseline = single[0] || all[0] || null;
  return { published, all, single, threaded, baseline };
}

export function npmDistributionSets(packages) {
  const published = [];
  for (const pkg of packages) {
    if (pkg.status !== "available" || pkg.npm?.status !== "published") continue;
    const profile = pkg.profiles?.find((entry) => entry.id === pkg.npm.profile);
    if (!profile) throw new Error(`${pkg.slug}: npm.profile ${pkg.npm.profile || "<missing>"} is not a declared profile`);
    published.push({
      slug: pkg.slug,
      npmPackage: pkg.npm.package,
      npmVersion: pkg.npm.version,
      profile: pkg.npm.profile,
      threaded: Boolean(profile.sharedArrayBuffer),
      sharedArrayBuffer: Boolean(profile.sharedArrayBuffer)
    });
  }
  return setsFromPublished(published);
}

export async function registryReadyDistributionSets(sets, fetchImpl = fetch) {
  const ready = [];
  const deferred = [];
  for (const entry of sets.published) {
    const name = encodeURIComponent(entry.npmPackage);
    const version = encodeURIComponent(entry.npmVersion);
    const response = await fetchImpl(`https://registry.npmjs.org/${name}/${version}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "wasm-zoo-cross-browser"
      }
    });
    if (response.ok) {
      ready.push(entry);
      continue;
    }
    if (response.status === 404) {
      deferred.push(entry);
      continue;
    }
    throw new Error(
      `npm Registry preflight failed for ${entry.npmPackage}@${entry.npmVersion}: ${response.status} ${response.statusText || ""}`.trim()
    );
  }
  return { ...setsFromPublished(ready), deferred };
}

function emitGithubOutput(sets) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT is required with --github-output");
  const lines = [
    `all=${JSON.stringify(sets.all)}`,
    `single=${JSON.stringify(sets.single)}`,
    `threaded=${JSON.stringify(sets.threaded)}`,
    `baseline=${sets.baseline || ""}`,
    `count=${sets.all.length}`,
    `deferred=${JSON.stringify((sets.deferred || []).map((entry) => entry.slug))}`
  ];
  return fs.appendFile(output, `${lines.join("\n")}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reviewed = npmDistributionSets(await loadPackages());
  const sets = process.argv.includes("--registry-ready")
    ? await registryReadyDistributionSets(reviewed)
    : { ...reviewed, deferred: [] };

  if (process.argv.includes("--github-output")) await emitGithubOutput(sets);
  else if (process.argv.includes("--baseline")) {
    if (!sets.baseline) throw new Error("No published npm distribution is available for baseline smoke");
    process.stdout.write(`${sets.baseline}\n`);
  } else process.stdout.write(`${JSON.stringify(sets, null, 2)}\n`);
}
