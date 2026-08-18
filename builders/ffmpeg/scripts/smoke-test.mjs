import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null) return true;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopBrowser(child) {
  try {
    if (!child || child.exitCode !== null) return;
    if (process.platform === "win32") {
      // Chromium uses child processes that can keep the profile lockfile open even
      // after the root process is asked to exit. Kill only the process tree we spawned.
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      if (!(await waitForExit(child, 5000)) && child.exitCode === null) {
        child.kill();
        await waitForExit(child, 2000);
      }
      return;
    }

    child.kill("SIGTERM");
    if (!(await waitForExit(child, 5000)) && child.exitCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child, 2000);
    }
  } catch (error) {
    console.warn(`[WARN] Could not fully terminate smoke-test browser: ${error?.message || error}`);
  }
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function removeTempBestEffort(temp) {
  try {
    await fsp.rm(temp, { recursive: true, force: true, maxRetries: 12, retryDelay: 250 });
  } catch (error) {
    // A successful browser smoke test must not be turned into a build failure by
    // an antivirus/browser lock racing with temporary-profile cleanup on Windows.
    console.warn(`[WARN] Could not remove temporary browser profile: ${error?.message || error}`);
  }
}

function commandPath(name) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean) : null;
}

function resolveBrowser() {
  const candidates = [process.env.FFMPEG_WASM_BROWSER, process.env.CHROME_PATH];
  if (process.platform === "win32") {
    for (const base of [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(path.join(base, "Google", "Chrome", "Application", "chrome.exe"));
      candidates.push(path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"));
    }
  }
  for (const name of ["google-chrome", "chrome", "chromium", "chromium-browser", "msedge"]) {
    candidates.push(commandPath(name));
  }
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

async function main() {
  const profile = process.argv[2] || "browser-full";
  const dist = path.join(root, "dist", profile);
  const defaultTimeoutMs = profile === "browser-full-gpl" ? 300000 : 180000;
  const timeoutMs = Number(process.env.FFMPEG_WASM_SMOKE_TIMEOUT_MS || defaultTimeoutMs);
  const required = ["smoke-test.html", "browser-ffmpeg.js", "ffmpeg-core.js", "ffmpeg-core.wasm", "manifest.json", "smoke-input.mp4"];
  for (const name of required) {
    if (!fs.existsSync(path.join(dist, name))) throw new Error(`Missing smoke input: ${name}`);
  }

  const browser = resolveBrowser();
  if (!browser) throw new Error("Chromium browser not found. Set FFMPEG_WASM_BROWSER to Chrome/Edge executable.");

  const mime = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".wasm", "application/wasm"],
    [".json", "application/json; charset=utf-8"],
    [".mp4", "video/mp4"]
  ]);
  const baseDir = path.resolve(dist);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const rel = url.pathname === "/" ? "smoke-test.html" : decodeURIComponent(url.pathname.slice(1));
      const full = path.resolve(baseDir, rel);
      if (!(full === baseDir || full.startsWith(baseDir + path.sep))) {
        res.writeHead(403); res.end(); return;
      }
      const data = await fsp.readFile(full);
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", mime.get(path.extname(full)) || "application/octet-stream");
      res.writeHead(200); res.end(data);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), "wasm-zoo-ffmpeg-"));
  const browserProfile = path.join(temp, "browser");
  await fsp.mkdir(browserProfile, { recursive: true });
  const args = [
    "--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
    "--no-default-browser-check", "--remote-allow-origins=*", "--remote-debugging-port=0",
    `--user-data-dir=${browserProfile}`
  ];
  if (process.platform !== "win32") args.push("--no-sandbox");
  args.push(`http://127.0.0.1:${port}/smoke-test.html`);

  const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 12000) stderr = stderr.slice(-12000);
  });

  try {
    const portFile = path.join(browserProfile, "DevToolsActivePort");
    const started = Date.now();
    while (!fs.existsSync(portFile) && Date.now() - started < 20000) {
      if (child.exitCode !== null) throw new Error(`Browser exited early (${child.exitCode})\n${stderr}`);
      await sleep(100);
    }
    if (!fs.existsSync(portFile)) throw new Error(`DevToolsActivePort was not created\n${stderr}`);
    const devPort = (await fsp.readFile(portFile, "utf8")).split(/\r?\n/)[0].trim();

    let lastRunningStatus = "";
    while (Date.now() - started < timeoutMs) {
      if (child.exitCode !== null) throw new Error(`Browser exited before completion (${child.exitCode})\n${stderr}`);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json();
        for (const target of targets) {
          if (target.type !== "page") continue;
          const url = new URL(target.url);
          if (url.hash.startsWith("#SMOKE_TEST_RUNNING_")) {
            lastRunningStatus = decodeURIComponent(url.hash.slice("#SMOKE_TEST_RUNNING_".length));
          }
          if (url.hash.startsWith("#SMOKE_TEST_PASS_")) {
            console.log(`[OK] Browser smoke test: ${decodeURIComponent(url.hash.slice(1))}`);
            return;
          }
          if (url.hash.startsWith("#SMOKE_TEST_FAIL_")) {
            throw new Error(`Browser smoke failure: ${decodeURIComponent(url.hash.slice("#SMOKE_TEST_FAIL_".length))}`);
          }
        }
      } catch (error) {
        if (String(error.message).startsWith("Browser smoke failure:")) throw error;
      }
      await sleep(250);
    }
    const progress = lastRunningStatus ? `\nLast page status: ${lastRunningStatus}` : "";
    throw new Error(`Browser smoke test timed out after ${timeoutMs} ms${progress}\n${stderr}`);
  } finally {
    await stopBrowser(child);
    await closeServer(server);
    await removeTempBestEffort(temp);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
