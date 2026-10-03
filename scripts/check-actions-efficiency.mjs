import fs from "node:fs/promises";
import path from "node:path";
import { root } from "./lib.mjs";

const errors = [];
const need = (ok, message) => { if (!ok) errors.push(message); };
const read = async (name) => (await fs.readFile(path.join(root, ".github", "workflows", name), "utf8")).replace(/\r\n?/g, "\n");

function eventPaths(text, eventName) {
  const lines = text.split("\n");
  const eventIndex = lines.findIndex((line) => line === `  ${eventName}:`);
  if (eventIndex < 0) return [];
  let pathsIndex = -1;
  for (let i = eventIndex + 1; i < lines.length; i += 1) {
    if (/^  [A-Za-z_]/.test(lines[i])) break;
    if (lines[i] === "    paths:") { pathsIndex = i; break; }
  }
  if (pathsIndex < 0) return [];
  const paths = [];
  for (let i = pathsIndex + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^      - ["'](.+)["']$/);
    if (!match) break;
    paths.push(match[1]);
  }
  return paths;
}

const heavy = [
  "cross-browser-compat.yml",
  "npm-package-smoke.yml",
  "npm-brotli-canary.yml",
  "npm-qpdf-canary.yml",
  "npm-zstd-canary.yml",
  "build-qpdf.yml",
  "build-brotli.yml"
];
const texts = Object.fromEntries(await Promise.all(heavy.map(async (name) => [name, await read(name)])));
for (const [name, text] of Object.entries(texts)) {
  need(text.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"),
    `${name}: stale pull-request runs must cancel when a newer commit arrives`);
}
for (const name of ["build-qpdf.yml", "build-brotli.yml"]) {
  const paths = [...eventPaths(texts[name], "push"), ...eventPaths(texts[name], "pull_request")];
  need(!paths.some((item) => item.startsWith("site/")),
    `${name}: generated catalog/status/playground changes must not rebuild WebAssembly`);
}
for (const name of ["npm-brotli-canary.yml", "npm-qpdf-canary.yml", "npm-zstd-canary.yml"]) {
  const paths = eventPaths(texts[name], "pull_request");
  need(!paths.includes("package.json"), `${name}: root project metadata must not trigger immutable npm canary work`);
  need(!paths.includes("docs/NPM_DISTRIBUTION.md"), `${name}: npm documentation must not trigger immutable npm canary work`);
}
need(!eventPaths(texts["npm-package-smoke.yml"], "pull_request").includes("package.json"),
  "npm-package-smoke.yml: root project metadata must not trigger live Registry browser smoke");

const labPr = eventPaths(texts["cross-browser-compat.yml"], "pull_request");
for (const irrelevant of ["VERSION", "package.json", "README.md", "site/**", "docs/CROSS_BROWSER_LAB.md"]) {
  need(!labPr.includes(irrelevant), `cross-browser-compat.yml: pull requests must not run the 27-cell Lab for ${irrelevant}`);
}
const labPush = eventPaths(texts["cross-browser-compat.yml"], "push");
need(labPush.includes("VERSION"), "cross-browser-compat.yml: reviewed main project releases must still refresh full Lab evidence");
need(!labPush.includes("package.json"), "cross-browser-compat.yml: root package.json alone must not trigger full Lab");
need(!labPush.includes("scripts/**"), "cross-browser-compat.yml: main Lab script triggers must stay impact-scoped");

const pages = await read("pages.yml");
const pagesPush = eventPaths(pages, "push");
need(!pagesPush.includes("packages/**"), "pages.yml: package changes must wait for main Lab workflow_run instead of double-deploying");
need(!pagesPush.includes("VERSION"), "pages.yml: project releases must wait for main Lab workflow_run instead of double-deploying");
for (const generated of ["!site/catalog.json", "!site/upstream-status.json", "!site/release-health.json", "!site/browser-compatibility.json"]) {
  need(pagesPush.includes(generated), `pages.yml: generated snapshot exclusion missing: ${generated}`);
}
need(pages.includes("workflow_run:") && pages.includes("workflows: ['Cross-browser compatibility lab']"),
  "pages.yml: Lab-completion deployment path must remain enabled");
need(pages.includes("cancel-in-progress: true"), "pages.yml: overlapping deploys must remain cancelable");

if (errors.length) {
  console.error(`[NG] ${errors.length} GitHub Actions efficiency contract check(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log("[OK] GitHub Actions release-only triggers are impact-scoped and stale heavy PR runs cancel");
