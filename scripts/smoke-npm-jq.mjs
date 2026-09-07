import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { root, readJson } from "./lib.mjs";

const VITE_VERSION = "8.2.2";
const PLAYWRIGHT_VERSION = "1.63.0";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, options = {}) {
  const result = spawnSync(npmCommand, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    cwd: options.cwd,
    env: options.env || process.env,
    shell: false
  });
  if (result.status !== 0) {
    const detail = options.capture ? `\n${result.stdout || ""}\n${result.stderr || ""}` : "";
    throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status}${detail}`);
  }
  return result;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Vite preview exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(full, base));
    else out.push(path.relative(base, full).replaceAll(path.sep, "/"));
  }
  return out;
}

const zoo = await readJson(path.join(root, "packages", "jq", "package.json"));
const version = zoo.npm?.version;
if (!version) throw new Error("packages/jq/package.json is missing npm.version");
const packageSpec = process.env.WASM_ZOO_NPM_JQ_SPEC || `@wasm-zoo/jq@${version}`;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "wasm-zoo-npm-jq-vite-"));
let preview = null;
let browser = null;

try {
  const appPackage = {
    private: true,
    type: "module",
    dependencies: { "@wasm-zoo/jq": version },
    devDependencies: { vite: VITE_VERSION, playwright: PLAYWRIGHT_VERSION }
  };
  await fs.writeFile(path.join(temp, "package.json"), `${JSON.stringify(appPackage, null, 2)}\n`);
  await fs.mkdir(path.join(temp, "src"), { recursive: true });
  await fs.writeFile(path.join(temp, "index.html"), `<!doctype html>\n<meta charset="utf-8">\n<title>WASM Zoo npm jq Vite smoke</title>\n<pre id="status">STARTING</pre>\n<script type="module" src="/src/main.js"></script>\n`);
  await fs.writeFile(path.join(temp, "vite.config.mjs"), `import { defineConfig } from "vite";\nexport default defineConfig({ build: { target: "es2022", assetsInlineLimit: 0 } });\n`);
  await fs.writeFile(path.join(temp, "src", "main.js"), `import { load, assets } from "@wasm-zoo/jq";\n\nconst status = document.querySelector("#status");\nwindow.__WASM_ZOO_NPM_JQ_SMOKE__ = { phase: "loading", assets };\nlet jq = null;\ntry {\n  jq = await load();\n  const input = new TextEncoder().encode(JSON.stringify({ items: [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }] }));\n  const result = await jq.exec(["-M", "-c", ".items | map(select(.active)) | map(.id)", "/input.json"], {\n    files: [{ name: "/input.json", data: input }],\n    timeoutMs: 30000\n  });\n  const stdout = result.stdout.trim();\n  if (result.exitCode !== 0) throw new Error("Unexpected jq exit code: " + result.exitCode);\n  if (stdout !== "[1,3]") throw new Error("Unexpected jq output: " + stdout);\n  window.__WASM_ZOO_NPM_JQ_SMOKE__ = { ok: true, stdout, assets };\n  status.textContent = "PASS";\n} catch (error) {\n  window.__WASM_ZOO_NPM_JQ_SMOKE__ = { ok: false, message: error?.message || String(error), stack: error?.stack || "", assets };\n  status.textContent = "FAIL: " + (error?.message || error);\n  throw error;\n} finally {\n  jq?.dispose();\n}\n`);

  console.log(`[npm-smoke] installing ${packageSpec}, vite@${VITE_VERSION}, playwright@${PLAYWRIGHT_VERSION}`);
  run(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", packageSpec, `vite@${VITE_VERSION}`, `playwright@${PLAYWRIGHT_VERSION}`], { cwd: temp });

  const installed = await readJson(path.join(temp, "node_modules", "@wasm-zoo", "jq", "package.json"));
  if (installed.version !== version) throw new Error(`Registry package version mismatch: expected ${version}, installed ${installed.version}`);

  console.log("[npm-smoke] building production Vite bundle");
  run(["exec", "--", "vite", "build"], { cwd: temp });
  const built = await listFiles(path.join(temp, "dist"));
  if (!built.some((name) => name.endsWith(".wasm"))) throw new Error(`Vite build did not emit a Wasm asset: ${built.join(", ")}`);

  console.log("[npm-smoke] installing Playwright Chromium");
  const installArgs = ["exec", "--", "playwright", "install"];
  if (process.env.WASM_ZOO_PLAYWRIGHT_WITH_DEPS === "1") installArgs.push("--with-deps");
  installArgs.push("chromium");
  run(installArgs, { cwd: temp });

  const port = await getFreePort();
  preview = spawn(npmCommand, ["exec", "--", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: temp,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });
  let previewOutput = "";
  preview.stdout.on("data", (chunk) => { previewOutput += chunk; });
  preview.stderr.on("data", (chunk) => { previewOutput += chunk; });
  const url = `http://127.0.0.1:${port}/`;
  await waitForHttp(url, preview);

  const requireFromFixture = createRequire(path.join(temp, "package.json"));
  const { chromium } = requireFromFixture("playwright");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const browserLogs = [];
  page.on("console", (message) => browserLogs.push(`[console:${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => browserLogs.push(`[pageerror] ${error.stack || error}`));
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction(() => window.__WASM_ZOO_NPM_JQ_SMOKE__?.ok === true || window.__WASM_ZOO_NPM_JQ_SMOKE__?.ok === false, null, { timeout: 60000 });
  const result = await page.evaluate(() => window.__WASM_ZOO_NPM_JQ_SMOKE__);
  if (!result?.ok) {
    throw new Error(`Published npm jq failed in Vite production build: ${result?.message || "unknown error"}\n${result?.stack || ""}\n${browserLogs.join("\n")}\n${previewOutput}`);
  }
  console.log(`[OK] ${packageSpec} installed from npm, built with Vite ${VITE_VERSION}, and executed jq in Chromium; stdout=${result.stdout}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (preview && preview.exitCode == null) {
    preview.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (preview.exitCode == null) preview.kill("SIGKILL");
  }
  await fs.rm(temp, { recursive: true, force: true });
}
