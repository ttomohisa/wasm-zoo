import fs from "node:fs/promises";
import path from "node:path";
import { root, readJson } from "./lib.mjs";
import { assessThreadedRuntime } from "./threaded-browser-capabilities.mjs";

const dir = process.argv[2] || "compat-results";
const targets = ["ffmpeg", "libvips"];
const browsers = ["chromium", "firefox", "webkit"];
const records = [];
const errors = [];

for (const slug of targets) {
  const metadata = await readJson(path.join(root, "packages", slug, "package.json"));
  for (const browser of browsers) {
    const filename = `${slug}-${browser}.json`;
    let record;
    try {
      record = JSON.parse(await fs.readFile(path.join(dir, filename), "utf8"));
    } catch (error) {
      errors.push(`${filename}: missing or invalid result: ${error?.message || error}`);
      records.push({ package: slug, browser, status: "not-tested", reason: "Missing or invalid test artifact" });
      continue;
    }
    records.push(record);
    if (record.schemaVersion !== 1 || record.package !== slug || record.browser !== browser ||
        record.npmPackage !== metadata.npm.package || record.npmVersion !== metadata.npm.version ||
        record.profile !== metadata.npm.profile) {
      errors.push(`${filename}: package/browser/version/profile/schema mismatch`);
      continue;
    }
    if (!record.testedAt || !record.browserVersion) {
      errors.push(`${filename}: missing test timestamp or launched browser version`);
      continue;
    }
    const preflight = assessThreadedRuntime({
      headers: record.responseHeaders,
      capabilities: record.runtimeCapabilities
    });
    if (record.status === "pass") {
      if (preflight.status !== "pass" || record.phase !== "complete" || !record.detail || record.reason) {
        errors.push(`${filename}: pass must include healthy preflight and completed real operation`);
      }
    } else if (record.status === "unsupported") {
      if (browser === "chromium" || preflight.status !== "unsupported" ||
          record.phase !== "runtime-preflight" || record.reason !== preflight.reason) {
        errors.push(`${filename}: unsupported requires observed browser capability absence; Chromium cannot be waived`);
      }
    } else {
      errors.push(`${filename}: status ${String(record.status)} is not an allowed completed CI result; ${record.reason || "no reason"}`);
    }
  }
}

const aggregate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "GitHub Actions real published-npm Vite browser smoke",
  results: records
};
await fs.mkdir(dir, { recursive: true });
await fs.writeFile(path.join(dir, "threaded-aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);

const table = [
  "## Threaded cross-browser compatibility (observed CI run)",
  "",
  "| Package | Chromium | Firefox | WebKit |",
  "| --- | --- | --- | --- |",
  ...targets.map((slug) => `| ${slug} | ${browsers.map((browser) => {
    const result = records.find((item) => item.package === slug && item.browser === browser);
    return result?.status || "not-tested";
  }).join(" | ")} |`),
  "",
  "An unsupported cell is only allowed when a browser capability preflight recorded absent functionality despite correct harness isolation headers.",
  ""
].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, table);
for (const record of records.filter((item) => item.status === "unsupported")) {
  console.warn(`[UNSUPPORTED] ${record.package}/${record.browser}: ${record.reason}`);
}
if (errors.length) {
  for (const error of errors) console.error(`[NG] ${error}`);
  process.exitCode = 1;
} else {
  console.log("[OK] six threaded browser results are real passes or explicitly evidenced unsupported environments");
}
