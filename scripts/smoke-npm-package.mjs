import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { root, readJson } from "./lib.mjs";

const VITE_VERSION = "8.2.2";
const PLAYWRIGHT_VERSION = "1.63.0";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument near ${key || "<end>"}`);
  args[key.slice(2)] = value;
}
const slug = args.slug || process.env.WASM_ZOO_NPM_SLUG;
if (!slug) throw new Error("Missing --slug <package>");

const fixtures = {
  jq: {
    expectedWasmCount: 1,
    resultKey: "__WASM_ZOO_NPM_SMOKE__",
    main(packageName) {
      return `import { load, assets } from ${JSON.stringify(packageName)};\n\nconst status = document.querySelector("#status");\nwindow.__WASM_ZOO_NPM_SMOKE__ = { phase: "loading", assets };\nlet runtime = null;\ntry {\n  runtime = await load();\n  const input = new TextEncoder().encode(JSON.stringify({ items: [{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }] }));\n  const result = await runtime.exec(["-M", "-c", ".items | map(select(.active)) | map(.id)", "/input.json"], { files: [{ name: "/input.json", data: input }], timeoutMs: 30000 });\n  const stdout = result.stdout.trim();\n  if (result.exitCode !== 0) throw new Error("Unexpected jq exit code: " + result.exitCode);\n  if (stdout !== "[1,3]") throw new Error("Unexpected jq output: " + stdout);\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: true, detail: stdout, assets };\n  status.textContent = "PASS";\n} catch (error) {\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: false, message: error?.message || String(error), stack: error?.stack || "", assets };\n  status.textContent = "FAIL: " + (error?.message || error);\n  throw error;\n} finally {\n  runtime?.dispose();\n}\n`;
    }
  },
  libarchive: {
    expectedWasmCount: 4,
    resultKey: "__WASM_ZOO_NPM_SMOKE__",
    main(packageName) {
      return `import { load, assets } from ${JSON.stringify(packageName)};\n\nfunction writeText(target, offset, text) {\n  const bytes = new TextEncoder().encode(text);\n  target.set(bytes.subarray(0, Math.max(0, target.length - offset)), offset);\n}\nfunction writeOctal(target, offset, length, value) {\n  const text = value.toString(8).padStart(length - 1, "0") + "\\0";\n  writeText(target, offset, text);\n}\nfunction makeTar(name, content) {\n  const data = new TextEncoder().encode(content);\n  const header = new Uint8Array(512);\n  writeText(header, 0, name);\n  writeOctal(header, 100, 8, 0o644);\n  writeOctal(header, 108, 8, 0);\n  writeOctal(header, 116, 8, 0);\n  writeOctal(header, 124, 12, data.length);\n  writeOctal(header, 136, 12, 0);\n  header.fill(0x20, 148, 156);\n  header[156] = "0".charCodeAt(0);\n  writeText(header, 257, "ustar\\0");\n  writeText(header, 263, "00");\n  let checksum = 0;\n  for (const byte of header) checksum += byte;\n  writeText(header, 148, checksum.toString(8).padStart(6, "0") + "\\0 ");\n  const padded = Math.ceil(data.length / 512) * 512;\n  const tar = new Uint8Array(512 + padded + 1024);\n  tar.set(header, 0);\n  tar.set(data, 512);\n  return tar;\n}\n\nconst status = document.querySelector("#status");\nwindow.__WASM_ZOO_NPM_SMOKE__ = { phase: "loading", assets };\nlet runtime = null;\ntry {\n  runtime = await load({ tool: "bsdtar" });\n  const tar = makeTar("hello.txt", "hello from wasm zoo\\n");\n  const result = await runtime.exec(["-xf", "/input.tar", "-C", "/out"], {\n    files: [{ name: "/input.tar", data: tar }],\n    dirs: ["/out"],\n    collectDirs: ["/out"]\n  });\n  if (result.exitCode !== 0) throw new Error("Unexpected bsdtar exit code: " + result.exitCode);\n  const extracted = result.files.find((file) => file.name === "/out/hello.txt");\n  if (!extracted) throw new Error("bsdtar did not return /out/hello.txt");\n  const text = new TextDecoder().decode(extracted.data);\n  if (text !== "hello from wasm zoo\\n") throw new Error("Unexpected extracted content: " + JSON.stringify(text));\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: true, detail: text.trim(), assets };\n  status.textContent = "PASS";\n} catch (error) {\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: false, message: error?.message || String(error), stack: error?.stack || "", assets };\n  status.textContent = "FAIL: " + (error?.message || error);\n  throw error;\n} finally {\n  runtime?.dispose();\n}\n`;
    }
  },
  imagemagick: {
    expectedWasmCount: 1,
    resultKey: "__WASM_ZOO_NPM_SMOKE__",
    main(packageName) {
      return `import { load, assets } from ${JSON.stringify(packageName)};\n\nfunction readU32BE(bytes, offset) {\n  return (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;\n}\n\nconst status = document.querySelector("#status");\nwindow.__WASM_ZOO_NPM_SMOKE__ = { phase: "loading", assets };\nlet runtime = null;\ntry {\n  runtime = await load();\n  const ppm = new TextEncoder().encode("P3\\n4 4\\n255\\n255 0 0   0 255 0   0 0 255   255 255 255\\n255 255 0 255 0 255 0 255 255 0 0 0\\n255 0 0   0 255 0   0 0 255   255 255 255\\n255 255 0 255 0 255 0 255 255 0 0 0\\n");\n  const result = await runtime.exec(["/input.ppm", "-resize", "2x2!", "/out/output.png"], {\n    files: [{ name: "/input.ppm", data: ppm }],\n    dirs: ["/out"],\n    outputs: ["/out/output.png"],\n    timeoutMs: 30000\n  });\n  if (result.exitCode !== 0) throw new Error("Unexpected ImageMagick exit code: " + result.exitCode);\n  const output = result.files.find((file) => file.name === "/out/output.png");\n  if (!output) throw new Error("ImageMagick did not return /out/output.png");\n  const bytes = output.data;\n  const signature = [137, 80, 78, 71, 13, 10, 26, 10];\n  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) throw new Error("Output does not have a PNG signature");\n  const width = readU32BE(bytes, 16);\n  const height = readU32BE(bytes, 20);\n  if (width !== 2 || height !== 2) throw new Error("Unexpected PNG dimensions: " + width + "x" + height);\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: true, detail: width + "x" + height + " PNG", assets };\n  status.textContent = "PASS";\n} catch (error) {\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: false, message: error?.message || String(error), stack: error?.stack || "", assets };\n  status.textContent = "FAIL: " + (error?.message || error);\n  throw error;\n} finally {\n  runtime?.dispose();\n}\n`;
    }
  },
  ghostscript: {
    expectedWasmCount: 1,
    resultKey: "__WASM_ZOO_NPM_SMOKE__",
    main(packageName) {
      return `import { load, assets } from ${JSON.stringify(packageName)};\n\nconst status = document.querySelector("#status");\nwindow.__WASM_ZOO_NPM_SMOKE__ = { phase: "loading", assets };\nlet runtime = null;\ntry {\n  runtime = await load();\n  const ps = new TextEncoder().encode("%!PS-Adobe-3.0\\nnewpath\\n72 72 moveto\\n144 72 lineto\\n144 144 lineto\\n72 144 lineto\\nclosepath\\n0 setgray fill\\nshowpage\\n");\n  const result = await runtime.exec([\n    "-dSAFER", "-dBATCH", "-dNOPAUSE",\n    "-sDEVICE=pdfwrite", "-sOutputFile=/out/output.pdf", "/input.ps"\n  ], {\n    files: [{ name: "/input.ps", data: ps }],\n    dirs: ["/out"],\n    outputs: ["/out/output.pdf"],\n    timeoutMs: 45000\n  });\n  if (result.exitCode !== 0) throw new Error("Unexpected Ghostscript exit code: " + result.exitCode);\n  const output = result.files.find((file) => file.name === "/out/output.pdf");\n  if (!output) throw new Error("Ghostscript did not return /out/output.pdf");\n  const bytes = output.data;\n  const prefix = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 8)));\n  if (!prefix.startsWith("%PDF-")) throw new Error("Output does not start with %PDF-");\n  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 256)));\n  if (!tail.includes("%%EOF")) throw new Error("Output PDF does not contain %%EOF near the end");\n  if (bytes.length < 100) throw new Error("Output PDF is unexpectedly small: " + bytes.length);\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: true, detail: "PDF " + bytes.length + " bytes", assets };\n  status.textContent = "PASS";\n} catch (error) {\n  window.__WASM_ZOO_NPM_SMOKE__ = { ok: false, message: error?.message || String(error), stack: error?.stack || "", assets };\n  status.textContent = "FAIL: " + (error?.message || error);\n  throw error;\n} finally {\n  runtime?.dispose();\n}\n`;
    }
  }
};
const fixture = fixtures[slug];
if (!fixture) throw new Error(`No published npm smoke fixture for ${slug}`);

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

async function waitForHttp(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
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

function contentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".wasm": return "application/wasm";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

async function startStaticServer(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const rootPrefix = `${resolvedRoot}${path.sep}`;
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/") pathname = "/index.html";
      const target = path.resolve(resolvedRoot, `.${pathname}`);
      if (target !== resolvedRoot && !target.startsWith(rootPrefix)) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("Forbidden\n");
        return;
      }
      const stat = await fs.stat(target).catch(() => null);
      if (!stat?.isFile()) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found\n");
        return;
      }
      const body = await fs.readFile(target);
      response.writeHead(200, { "content-type": contentType(target), "cache-control": "no-store" });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(`${error?.message || error}\n`);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("Static smoke server did not expose a TCP address.");
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function closeStaticServer(server) {
  if (!server) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      server.closeAllConnections?.();
      finish();
    }, 2000);
    server.close(finish);
  });
}

const zoo = await readJson(path.join(root, "packages", slug, "package.json"));
const npmMeta = zoo.npm;
const version = npmMeta?.version;
const packageName = npmMeta?.package;
if (!version || !packageName) throw new Error(`packages/${slug}/package.json is missing npm package/version`);
const packageSpec = process.env.WASM_ZOO_NPM_PACKAGE_SPEC || `${packageName}@${version}`;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), `wasm-zoo-npm-${slug}-vite-`));
let staticServer = null;
let browser = null;

try {
  const appPackage = {
    private: true,
    type: "module",
    dependencies: { [packageName]: version },
    devDependencies: { vite: VITE_VERSION, playwright: PLAYWRIGHT_VERSION }
  };
  await fs.writeFile(path.join(temp, "package.json"), `${JSON.stringify(appPackage, null, 2)}\n`);
  await fs.mkdir(path.join(temp, "src"), { recursive: true });
  await fs.writeFile(path.join(temp, "index.html"), `<!doctype html>\n<meta charset="utf-8">\n<title>WASM Zoo npm ${slug} Vite smoke</title>\n<pre id="status">STARTING</pre>\n<script type="module" src="/src/main.js"></script>\n`);
  await fs.writeFile(path.join(temp, "vite.config.mjs"), `import { defineConfig } from "vite";\nexport default defineConfig({ build: { target: "es2022", assetsInlineLimit: 0 } });\n`);
  await fs.writeFile(path.join(temp, "src", "main.js"), fixture.main(packageName));

  console.log(`[npm-smoke:${slug}] installing ${packageSpec}, vite@${VITE_VERSION}, playwright@${PLAYWRIGHT_VERSION}`);
  run(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", packageSpec, `vite@${VITE_VERSION}`, `playwright@${PLAYWRIGHT_VERSION}`], { cwd: temp });

  const installed = await readJson(path.join(temp, "node_modules", ...packageName.split("/"), "package.json"));
  if (installed.version !== version) throw new Error(`Registry package version mismatch: expected ${version}, installed ${installed.version}`);

  console.log(`[npm-smoke:${slug}] building production Vite bundle`);
  run(["exec", "--", "vite", "build"], { cwd: temp });
  const dist = path.join(temp, "dist");
  const built = await listFiles(dist);
  const wasmFiles = built.filter((name) => name.endsWith(".wasm"));
  if (wasmFiles.length < fixture.expectedWasmCount) {
    throw new Error(`Vite build emitted ${wasmFiles.length} Wasm asset(s); expected at least ${fixture.expectedWasmCount}: ${built.join(", ")}`);
  }

  console.log(`[npm-smoke:${slug}] installing Playwright Chromium`);
  const installArgs = ["exec", "--", "playwright", "install"];
  if (process.env.WASM_ZOO_PLAYWRIGHT_WITH_DEPS === "1") installArgs.push("--with-deps");
  installArgs.push("chromium");
  run(installArgs, { cwd: temp });

  console.log(`[npm-smoke:${slug}] serving production dist with in-process Node HTTP server`);
  const served = await startStaticServer(dist);
  staticServer = served.server;
  await waitForHttp(served.url);

  const requireFromFixture = createRequire(path.join(temp, "package.json"));
  const { chromium } = requireFromFixture("playwright");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const browserLogs = [];
  page.on("console", (message) => browserLogs.push(`[console:${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => browserLogs.push(`[pageerror] ${error.stack || error}`));
  await page.goto(served.url, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction((key) => window[key]?.ok === true || window[key]?.ok === false, fixture.resultKey, { timeout: 60000 });
  const result = await page.evaluate((key) => window[key], fixture.resultKey);
  if (!result?.ok) {
    throw new Error(`Published npm ${slug} failed in Vite production build: ${result?.message || "unknown error"}\n${result?.stack || ""}\n${browserLogs.join("\n")}`);
  }
  console.log(`[OK] ${packageSpec} installed from npm, built with Vite ${VITE_VERSION}, and executed ${slug} in Chromium; detail=${JSON.stringify(result.detail)}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  await closeStaticServer(staticServer);
  await fs.rm(temp, { recursive: true, force: true });
  console.log(`[npm-smoke:${slug}] cleanup complete`);
}
