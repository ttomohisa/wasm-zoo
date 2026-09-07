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

const configs = {
  jq: {
    npmName: "@wasm-zoo/jq",
    profile: "browser-full",
    classicScript: "browser-jq.js",
    coreJs: "jq-core.js",
    wasm: "jq-core.wasm",
    required: [
      "browser-jq.js",
      "jq-core.js",
      "jq-core.wasm",
      "manifest.json",
      "features.json",
      "provenance.json",
      "sbom.cdx.json",
      "BUILDINFO.txt",
      "LICENSES/jq-COPYING.txt",
      "LICENSES/oniguruma-COPYING.txt"
    ],
    optional: ["jq-config.txt"]
  }
};

const config = configs[args.slug];
if (!config) throw new Error(`${args.slug} does not have an npm distribution config yet`);
const pkg = await readJson(path.join(root, "packages", args.slug, "package.json"));
const profile = args.profile || config.profile;
if (profile !== config.profile) throw new Error(`${args.slug} npm canary currently supports only ${config.profile}`);
const profileMeta = pkg.profiles?.find((entry) => entry.id === profile);
if (!profileMeta) throw new Error(`${args.slug} package metadata does not declare ${profile}`);

const input = path.resolve(args.input);
const output = path.resolve(args.output);
for (const rel of config.required) {
  const stat = await fs.stat(path.join(input, rel)).catch(() => null);
  if (!stat?.isFile()) throw new Error(`Missing npm package input: ${rel}`);
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
for (const rel of [...config.required, ...config.optional]) {
  const src = path.join(input, rel);
  const stat = await fs.stat(src).catch(() => null);
  if (!stat?.isFile()) continue;
  const dst = path.join(output, rel);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
}
await fs.copyFile(path.join(root, "builders", args.slug, "runtime", "wasm-zoo.mjs"), path.join(output, "wasm-zoo.mjs"));
await fs.copyFile(path.join(root, "LICENSE"), path.join(output, "LICENSE.wasm-zoo.txt"));

const entry = `// npm/bundler entry for ${config.npmName}.\n` +
`// Static URL expressions intentionally let Vite/webpack emit the core assets.\n` +
`import "./${config.classicScript}";\n` +
`import { API_VERSION, packageInfo, isSupported, load as loadSelfHosted } from "./wasm-zoo.mjs";\n\n` +
`export { API_VERSION, packageInfo, isSupported };\n` +
`export const assets = Object.freeze({\n` +
`  coreJsUrl: new URL("./${config.coreJs}", import.meta.url).href,\n` +
`  wasmUrl: new URL("./${config.wasm}", import.meta.url).href\n` +
`});\n\n` +
`export async function load(options = {}) {\n` +
`  return loadSelfHosted({\n` +
`    ...options,\n` +
`    coreJsUrl: options.coreJsUrl || assets.coreJsUrl,\n` +
`    wasmUrl: options.wasmUrl || assets.wasmUrl\n` +
`  });\n` +
`}\n\n` +
`export default Object.freeze({ API_VERSION, packageInfo, isSupported, assets, load });\n`;
await fs.writeFile(path.join(output, "index.mjs"), entry);

const license = `WASM Zoo npm distribution notice\n\n` +
`The WASM Zoo wrapper/integration code is licensed under the MIT License; see LICENSE.wasm-zoo.txt.\n\n` +
`The bundled jq WebAssembly binary contains upstream software under additional licenses.\n` +
`See LICENSES/jq-COPYING.txt and LICENSES/oniguruma-COPYING.txt.\n` +
`Build metadata, provenance and SBOM files are included in this package.\n`;
await fs.writeFile(path.join(output, "LICENSE"), license);

const readme = `# ${config.npmName}\n\n` +
`Unofficial WASM Zoo distribution of jq ${pkg.upstream.version} for browsers. The package bundles the reviewed ${profile} WebAssembly assets and Consumer API v1.\n\n` +
`## Install\n\n\`\`\`bash\nnpm install ${config.npmName}\n\`\`\`\n\n` +
`## Use\n\n\`\`\`js\nimport { load } from "${config.npmName}";\n\nconst jq = await load();\ntry {\n  const input = new TextEncoder().encode('{"items":[{"active":true,"id":1}]}');\n  const result = await jq.exec(["-M", "-c", ".items | map(select(.active))", "/input.json"], {\n    files: [{ name: "/input.json", data: input }]\n  });\n  console.log(result.stdout);\n} finally {\n  jq.dispose();\n}\n\`\`\`\n\n` +
`The default entry imports the browser wrapper and uses static \`new URL(..., import.meta.url)\` references so modern bundlers can emit \`${config.coreJs}\` and \`${config.wasm}\`. For manual/self-hosted deployments use \`${config.npmName}/self-hosted\` and pass \`baseUrl\` as documented by WASM Zoo.\n\n` +
`No SharedArrayBuffer or cross-origin isolation is required for jq. Execution uses a Web Worker and MEMFS.\n`;
await fs.writeFile(path.join(output, "README.md"), readme);

const npmPackage = {
  name: config.npmName,
  version: pkg.zoo.builderVersion,
  description: `jq ${pkg.upstream.version} compiled for browser WebAssembly by WASM Zoo, with Consumer API v1 and bundled runtime assets.`,
  type: "module",
  exports: {
    ".": "./index.mjs",
    "./self-hosted": "./wasm-zoo.mjs",
    "./jq-core.wasm": "./jq-core.wasm",
    "./manifest.json": "./manifest.json",
    "./features.json": "./features.json",
    "./provenance.json": "./provenance.json",
    "./sbom.cdx.json": "./sbom.cdx.json"
  },
  files: [
    "index.mjs",
    "wasm-zoo.mjs",
    config.classicScript,
    config.coreJs,
    config.wasm,
    "manifest.json",
    "features.json",
    "provenance.json",
    "sbom.cdx.json",
    "BUILDINFO.txt",
    "jq-config.txt",
    "LICENSE",
    "LICENSE.wasm-zoo.txt",
    "LICENSES/",
    "README.md"
  ],
  sideEffects: [`./${config.classicScript}`, `./${config.coreJs}`],
  repository: { type: "git", url: "git+https://github.com/ttomohisa/wasm-zoo.git" },
  homepage: "https://ttomohisa.github.io/wasm-zoo/",
  bugs: { url: "https://github.com/ttomohisa/wasm-zoo/issues" },
  license: "SEE LICENSE IN LICENSE",
  keywords: ["wasm", "webassembly", "jq", "browser", "wasm-zoo"],
  publishConfig: { access: "public", provenance: true },
  wasmZoo: {
    consumerApiVersion: 1,
    slug: args.slug,
    upstreamVersion: pkg.upstream.version,
    builderVersion: pkg.zoo.builderVersion,
    profile,
    releaseTag: pkg.release.tag,
    releaseAsset: profileMeta.releaseAsset,
    bundledAssets: true
  }
};
await fs.writeFile(path.join(output, "package.json"), `${JSON.stringify(npmPackage, null, 2)}\n`);
console.log(`[OK] prepared ${config.npmName}@${npmPackage.version} from ${pkg.release.tag}/${profileMeta.releaseAsset}`);
