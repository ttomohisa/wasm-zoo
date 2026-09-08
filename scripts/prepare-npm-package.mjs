import fs from "node:fs/promises";
import path from "node:path";
import { root, readJson } from "./lib.mjs";

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith("--") || value == null) throw new Error(`Invalid argument near ${key || "<end>"}`);
  args[key.slice(2)] = value;
}
for (const key of ["slug", "input", "output"]) if (!args[key]) throw new Error(`Missing --${key}`);

const pkg = await readJson(path.join(root, "packages", args.slug, "package.json"));
const npm = pkg.npm;
if (!npm?.package || !npm?.version || !npm?.profile || !npm?.runtime) {
  throw new Error(`${args.slug} does not declare a complete npm distribution contract`);
}
const profile = args.profile || npm.profile;
if (profile !== npm.profile) throw new Error(`${args.slug} npm distribution currently supports only ${npm.profile}`);
const profileMeta = pkg.profiles?.find((entry) => entry.id === profile);
if (!profileMeta) throw new Error(`${args.slug} package metadata does not declare ${profile}`);

const runtime = npm.runtime;
const classicScript = runtime.classicScript;
const assets = Array.isArray(runtime.assets) ? runtime.assets : [];
if (!classicScript || !["single", "tool-map"].includes(runtime.assetMode) || assets.length === 0) {
  throw new Error(`${args.slug} npm.runtime is incomplete`);
}
if (runtime.assetMode === "single" && assets.length !== 1) {
  throw new Error(`${args.slug} single-asset npm runtime must declare exactly one asset pair`);
}
for (const asset of assets) {
  if (!asset?.id || !asset?.coreJs || !asset?.wasm) throw new Error(`${args.slug} npm runtime asset is incomplete`);
}

const packageFiles = npm.packageFiles || {};
const required = Array.isArray(packageFiles.required) ? packageFiles.required : [];
const optional = Array.isArray(packageFiles.optional) ? packageFiles.optional : [];
const requiredDirs = Array.isArray(packageFiles.requiredDirs) ? packageFiles.requiredDirs : [];
const optionalDirs = Array.isArray(packageFiles.optionalDirs) ? packageFiles.optionalDirs : [];
if (!required.length) throw new Error(`${args.slug} npm.packageFiles.required is empty`);

const input = path.resolve(args.input);
const output = path.resolve(args.output);
for (const rel of required) {
  const stat = await fs.stat(path.join(input, rel)).catch(() => null);
  if (!stat?.isFile()) throw new Error(`Missing npm package input: ${rel}`);
}
for (const rel of requiredDirs) {
  const stat = await fs.stat(path.join(input, rel)).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Missing npm package input directory: ${rel}`);
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const rel of [...required, ...optional]) {
  const src = path.join(input, rel);
  const stat = await fs.stat(src).catch(() => null);
  if (!stat?.isFile()) continue;
  const dst = path.join(output, rel);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}
for (const rel of [...requiredDirs, ...optionalDirs]) {
  const src = path.join(input, rel);
  const stat = await fs.stat(src).catch(() => null);
  if (!stat?.isDirectory()) continue;
  const dst = path.join(output, rel);
  await fs.cp(src, dst, { recursive: true });
}

// Release binary/core assets remain immutable. Distribution wrappers are overlaid from
// the reviewed current source so npm/bundler-only fixes do not rewrite old Releases.
await fs.copyFile(path.join(root, "builders", args.slug, "runtime", classicScript), path.join(output, classicScript));
await fs.copyFile(path.join(root, "builders", args.slug, "runtime", "wasm-zoo.mjs"), path.join(output, "wasm-zoo.mjs"));
await fs.copyFile(path.join(root, "LICENSE"), path.join(output, "LICENSE.wasm-zoo.txt"));

function generateEntry() {
  const lines = [
    `// npm/bundler entry for ${npm.package}.`,
    "// Static URL expressions intentionally let modern bundlers emit the core assets.",
    `import "./${classicScript}";`
  ];

  if (runtime.assetMode === "single") {
    const asset = assets[0];
    lines.push(
      'import { API_VERSION, packageInfo, isSupported, load as loadSelfHosted } from "./wasm-zoo.mjs";',
      "",
      "export { API_VERSION, packageInfo, isSupported };",
      "export const assets = Object.freeze({",
      `  coreJsUrl: new URL("./${asset.coreJs}", import.meta.url).href,`,
      `  wasmUrl: new URL("./${asset.wasm}", import.meta.url).href`,
      "});",
      "",
      "export async function load(options = {}) {",
      "  return loadSelfHosted({",
      "    ...options,",
      "    coreJsUrl: options.coreJsUrl || assets.coreJsUrl,",
      "    wasmUrl: options.wasmUrl || assets.wasmUrl",
      "  });",
      "}",
      "",
      "export default Object.freeze({ API_VERSION, packageInfo, isSupported, assets, load });"
    );
  } else {
    lines.push(
      'import { API_VERSION, TOOLS, packageInfo, isSupported, load as loadSelfHosted } from "./wasm-zoo.mjs";',
      "",
      "export { API_VERSION, TOOLS, packageInfo, isSupported };",
      "export const assets = Object.freeze({"
    );
    assets.forEach((asset, index) => {
      lines.push(
        `  ${JSON.stringify(asset.id)}: Object.freeze({`,
        `    coreJsUrl: new URL("./${asset.coreJs}", import.meta.url).href,`,
        `    wasmUrl: new URL("./${asset.wasm}", import.meta.url).href`,
        `  })${index === assets.length - 1 ? "" : ","}`
      );
    });
    lines.push(
      "});",
      "",
      "export async function load(options = {}) {",
      "  return loadSelfHosted({",
      "    ...options,",
      "    toolAssets: options.toolAssets || assets",
      "  });",
      "}",
      "",
      "export default Object.freeze({ API_VERSION, TOOLS, packageInfo, isSupported, assets, load });"
    );
  }
  return `${lines.join("\n")}\n`;
}
await fs.writeFile(path.join(output, npm.entry || "index.mjs"), generateEntry());

const license = `WASM Zoo npm distribution notice\n\n` +
  `The WASM Zoo wrapper/integration code is licensed under the MIT License; see LICENSE.wasm-zoo.txt.\n\n` +
  `The bundled ${pkg.name} WebAssembly distribution contains upstream software under its own licenses.\n` +
  `Upstream and linked-component notices from the reviewed Release are bundled alongside this file.\n` +
  `Build metadata, provenance and SBOM files from the reviewed immutable Release are included in this package.\n`;
await fs.writeFile(path.join(output, "LICENSE"), license);

const docs = npm.docs || {};
const example = docs.example || `import { load } from "${npm.package}";\nconst runtime = await load();`;
const emitted = assets.flatMap((asset) => [asset.coreJs, asset.wasm]).map((file) => `\`${file}\``).join(", ");
const readme = `# ${npm.package}\n\n` +
  `${docs.description || `Unofficial WASM Zoo distribution of ${pkg.name} for browsers.`} ` +
  `This package is backed by ${pkg.name} ${pkg.upstream.version}, Zoo builder ${pkg.zoo.builderVersion}, and the reviewed ${profile} Release asset.\n\n` +
  `## Install\n\n\`\`\`bash\nnpm install ${npm.package}\n\`\`\`\n\n` +
  `## Use\n\n\`\`\`js\n${example}\n\`\`\`\n\n` +
  `The default entry imports the reviewed browser wrapper and uses static \`new URL(..., import.meta.url)\` references so modern bundlers can emit ${emitted}. ` +
  `For manual/self-hosted deployments use \`${npm.package}/self-hosted\` and the Consumer API v1 \`baseUrl\` contract.\n\n` +
  `${docs.runtimeNote || ""}\n`;
await fs.writeFile(path.join(output, "README.md"), readme);

const exportsMap = {
  ".": `./${npm.entry || "index.mjs"}`,
  "./self-hosted": "./wasm-zoo.mjs",
  "./manifest.json": "./manifest.json",
  "./features.json": "./features.json",
  "./provenance.json": "./provenance.json",
  "./sbom.cdx.json": "./sbom.cdx.json"
};
for (const asset of assets) exportsMap[`./${asset.wasm}`] = `./${asset.wasm}`;

const copied = [];
for (const rel of [...required, ...optional]) {
  const stat = await fs.stat(path.join(output, rel)).catch(() => null);
  if (stat?.isFile()) copied.push(rel);
}
const copiedDirs = [];
for (const rel of [...requiredDirs, ...optionalDirs]) {
  const stat = await fs.stat(path.join(output, rel)).catch(() => null);
  if (stat?.isDirectory()) copiedDirs.push(rel);
}
const files = [...new Set([
  npm.entry || "index.mjs",
  "wasm-zoo.mjs",
  ...copied,
  ...copiedDirs,
  "LICENSE",
  "LICENSE.wasm-zoo.txt",
  "README.md"
])];
const sideEffects = [...new Set([`./${classicScript}`, ...assets.map((asset) => `./${asset.coreJs}`)])];

const npmPackage = {
  name: npm.package,
  version: npm.version,
  description: `${pkg.name} ${pkg.upstream.version} compiled for browser WebAssembly by WASM Zoo, with Consumer API v1 and bundled runtime assets.`,
  type: "module",
  exports: exportsMap,
  files,
  sideEffects,
  repository: { type: "git", url: "git+https://github.com/ttomohisa/wasm-zoo.git" },
  homepage: "https://ttomohisa.github.io/wasm-zoo/",
  bugs: { url: "https://github.com/ttomohisa/wasm-zoo/issues" },
  license: "SEE LICENSE IN LICENSE",
  keywords: ["wasm", "webassembly", "browser", "wasm-zoo", ...(Array.isArray(npm.keywords) ? npm.keywords : [])],
  publishConfig: { access: "public", provenance: true },
  wasmZoo: {
    consumerApiVersion: 1,
    slug: args.slug,
    upstreamVersion: pkg.upstream.version,
    builderVersion: pkg.zoo.builderVersion,
    npmVersion: npm.version,
    distributionOverlay: [classicScript, "wasm-zoo.mjs", npm.entry || "index.mjs"],
    runtimeAssetMode: runtime.assetMode,
    profile,
    releaseTag: pkg.release.tag,
    releaseAsset: profileMeta.releaseAsset,
    bundledAssets: true
  }
};
await fs.writeFile(path.join(output, "package.json"), `${JSON.stringify(npmPackage, null, 2)}\n`);
console.log(`[OK] prepared ${npm.package}@${npmPackage.version} from ${pkg.release.tag}/${profileMeta.releaseAsset}`);
