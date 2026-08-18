import fs from "node:fs/promises";
import path from "node:path";
import { loadPackages, root } from "./lib.mjs";

const packages = await loadPackages();
const catalog = {
  schemaVersion: 1,
  project: {
    name: "WASM Zoo",
    version: (await fs.readFile(path.join(root, "VERSION"), "utf8")).trim(),
    tagline: "Upstream software, compiled for WebAssembly.",
    unofficial: true
  },
  stats: {
    packages: packages.length,
    available: packages.filter((pkg) => pkg.status === "available").length,
    profiles: packages.reduce((sum, pkg) => sum + pkg.profiles.length, 0)
  },
  packages
};

await fs.writeFile(path.join(root, "site", "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`[OK] catalog: ${catalog.stats.packages} packages / ${catalog.stats.available} available / ${catalog.stats.profiles} profiles`);
