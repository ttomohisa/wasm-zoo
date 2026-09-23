import fs from "node:fs/promises";
import path from "node:path";
import { root, readJson } from "./lib.mjs";

const files = Object.fromEntries(await Promise.all([
  "site/index.html",
  "site/app.js",
  ".github/workflows/cross-browser-compat.yml",
  ".github/workflows/pages.yml",
  "docs/CROSS_BROWSER_LAB.md",
  "README.md"
].map(async (rel) => [rel, await fs.readFile(path.join(root, rel), "utf8")])));
const errors = [];
const need = (condition, reason) => { if (!condition) errors.push(reason); };
const version = (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim();
const pkg = await readJson(path.join(root, "package.json"));
const catalog = await readJson(path.join(root, "site", "catalog.json"));
need(version === pkg.version && version === catalog.project?.version, "project VERSION, npm package.json and generated site catalog must agree");
need(files["README.md"].includes(`The project version is **WASM Zoo v${version}**`), "README must name current project version");
need(files["site/index.html"].includes('id="compatibility"') &&
     files["site/index.html"].includes('id="browser-compat-body"'), "Pages HTML must provide compatibility matrix");
need(files["site/app.js"].includes("renderBrowserCompatibility") &&
     files["site/app.js"].includes("browser-compatibility.json") &&
     files["site/app.js"].includes("source?.headBranch === 'main'") &&
     files["site/app.js"].includes("14 * 24 * 60 * 60 * 1000"), "Pages client must render proven, recent main-run evidence only");
need(files[".github/workflows/cross-browser-compat.yml"].includes("branches: [main]") &&
     files[".github/workflows/cross-browser-compat.yml"].includes("name: Enforce observed threaded compatibility classifications"), "Lab must test reviewed main and still enforce threaded policy");
need(files[".github/workflows/pages.yml"].includes("workflow_run:") &&
     files[".github/workflows/pages.yml"].includes("node scripts/publish-browser-compatibility.mjs") &&
     files[".github/workflows/pages.yml"].includes("github.event.workflow_run.head_branch == 'main'"), "Pages must redeploy only on reviewed main workflow completion");
need(files["docs/CROSS_BROWSER_LAB.md"].includes("Phase 4: observed public compatibility matrix"), "Lab documentation must describe public evidence pipeline");

if (errors.length) {
  errors.forEach((error) => console.error(`[NG] ${error}`));
  process.exitCode = 1;
} else {
  console.log("[OK] public browser compatibility dashboard, main-run guard and project version are wired");
}
