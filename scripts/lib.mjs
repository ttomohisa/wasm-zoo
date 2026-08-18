import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function loadPackages() {
  const base = path.join(root, "packages");
  const entries = await fs.readdir(base, { withFileTypes: true });
  const packages = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(base, entry.name, "package.json");
    try {
      packages.push(await readJson(file));
    } catch (error) {
      error.message = `${path.relative(root, file)}: ${error.message}`;
      throw error;
    }
  }
  return packages.sort((a, b) => {
    const rank = { available: 0, experimental: 1, planned: 2, paused: 3 };
    return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name);
  });
}

export async function readEnv(file) {
  const text = await fs.readFile(file, "utf8");
  const result = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    result[line.slice(0, i)] = line.slice(i + 1).replace(/^['\"]|['\"]$/g, "");
  }
  return result;
}

export function versionParts(value) {
  return String(value)
    .replace(/^[^0-9]*/, "")
    .split(/[.-]/)
    .map((part) => /^\d+$/.test(part) ? Number(part) : part);
}

export function compareVersions(a, b) {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i += 1) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (typeof av === "number" && typeof bv === "number") {
      if (av !== bv) return av - bv;
    } else {
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      if (cmp) return cmp;
    }
  }
  return 0;
}
