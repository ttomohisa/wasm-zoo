import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profiles = ["browser-core", "browser-full"];
const fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`;
const pct = (a, b) => b ? ((b - a) / b) * 100 : 0;

async function load(profile) {
  const manifestPath = path.join(root, "dist", profile, "manifest.json");
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const files = manifest.files || {};
    const bytes = (name) => files[name]?.bytes || 0;
    return {
      profile,
      label: manifest.profileLabel || profile,
      wasm: bytes("vips.wasm"),
      wasmGzip: bytes("vips.wasm.gz"),
      js: bytes("vips.js"),
      jsGzip: bytes("vips.js.gz"),
      transferGzip: bytes("vips.wasm.gz") + bytes("vips.js.gz")
    };
  } catch {
    return null;
  }
}

const rows = (await Promise.all(profiles.map(load))).filter(Boolean);
if (rows.length < 2) {
  console.log("[info] libvips size comparison needs both browser-core and browser-full builds.");
  process.exit(0);
}
const core = rows.find((row) => row.profile === "browser-core");
const full = rows.find((row) => row.profile === "browser-full");
const savings = {
  wasmBytes: full.wasm - core.wasm,
  wasmPercent: pct(core.wasm, full.wasm),
  gzipTransferBytes: full.transferGzip - core.transferGzip,
  gzipTransferPercent: pct(core.transferGzip, full.transferGzip)
};
const result = {
  schemaVersion: 1,
  package: "libvips",
  profiles: rows,
  browserCoreSavingsVsFull: savings
};
const distRoot = path.join(root, "dist");
await fs.mkdir(distRoot, { recursive: true });
await fs.writeFile(path.join(distRoot, "size-comparison.json"), `${JSON.stringify(result, null, 2)}\n`);
const markdown = [
  "# libvips browser profile size comparison",
  "",
  "| Profile | vips.wasm | vips.wasm.gz | vips.js | vips.js.gz | gzip transfer |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...rows.map((row) => `| ${row.label} | ${fmt(row.wasm)} | ${fmt(row.wasmGzip)} | ${fmt(row.js)} | ${fmt(row.jsGzip)} | ${fmt(row.transferGzip)} |`),
  "",
  `Browser Core saves **${fmt(savings.gzipTransferBytes)} (${savings.gzipTransferPercent.toFixed(1)}%)** of gzip transfer size versus Browser Full.`,
  `Raw vips.wasm savings: **${fmt(savings.wasmBytes)} (${savings.wasmPercent.toFixed(1)}%)**.`,
  ""
].join("\n");
await fs.writeFile(path.join(distRoot, "size-comparison.md"), markdown);
console.log(markdown.trim());
