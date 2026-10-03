import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPackages, root } from "./lib.mjs";
import { npmDistributionSets } from "./npm-package-set.mjs";

export const compatibilityBrowsers = Object.freeze(["chromium", "firefox", "webkit"]);

export function smokeArgs({ slug, browser, threaded, resultDir = "compat-results" }) {
  const args = [
    path.join(root, "scripts", "smoke-npm-package.mjs"),
    "--slug", slug,
    "--browser", browser
  ];
  if (threaded) args.push("--on-unsupported", browser === "chromium" ? "error" : "record");
  args.push("--result-json", path.join(resultDir, `${slug}-${browser}.json`));
  return args;
}

export async function runCompatibilityBatch({ slugs, browser, resultDir = "compat-results", runOne = null, packages = null }) {
  if (!Array.isArray(slugs) || slugs.length === 0 || slugs.some((slug) => typeof slug !== "string" || !slug)) {
    throw new Error("--slugs-json must be a non-empty JSON array of package slugs");
  }
  if (new Set(slugs).size !== slugs.length) throw new Error("--slugs-json must not contain duplicate package slugs");
  if (!compatibilityBrowsers.includes(browser)) throw new Error(`Unsupported --browser: ${browser}`);

  const reviewedPackages = packages || await loadPackages();
  const sets = npmDistributionSets(reviewedPackages);
  const reviewed = new Set(sets.all);
  const threaded = new Set(sets.threaded);
  const unknown = slugs.filter((slug) => !reviewed.has(slug));
  if (unknown.length) throw new Error(`Batch contains non-reviewed published package(s): ${unknown.join(", ")}`);

  const execute = runOne || (({ args, env }) => {
    const child = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
    if (child.error) throw child.error;
    return child.status ?? 1;
  });

  const failures = [];
  for (const slug of slugs) {
    const args = smokeArgs({ slug, browser, threaded: threaded.has(slug), resultDir });
    console.log(`[compat-batch] ${browser}: starting ${slug}`);
    let status = 1;
    try {
      status = await execute({
        slug,
        browser,
        args,
        env: { ...process.env, WASM_ZOO_PLAYWRIGHT_PREINSTALLED: "1" }
      });
    } catch (error) {
      console.error(`[compat-batch] ${browser}/${slug}: runner error: ${error?.stack || error}`);
    }
    if (status !== 0) {
      failures.push(slug);
      console.error(`[compat-batch] ${browser}: ${slug} failed with status ${status}`);
    } else {
      console.log(`[compat-batch] ${browser}: ${slug} passed`);
    }
  }

  if (failures.length) throw new Error(`${browser}: ${failures.length}/${slugs.length} package operation(s) failed: ${failures.join(", ")}`);
  console.log(`[OK] ${browser}: all ${slugs.length} reviewed npm package operations passed or were explicitly evidenced unsupported where policy allows`);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCompatibilityBatch({
    browser: readArg("--browser"),
    slugs: JSON.parse(readArg("--slugs-json")),
    resultDir: readArg("--result-dir") || "compat-results"
  });
}
