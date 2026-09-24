const SHA40 = /^[0-9a-f]{40}$/i;
const SEMVER3 = /^\d+\.\d+\.\d+$/;

function decodeGithubFile(data, label) {
  if (data?.type !== "file" || data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error(`Invalid GitHub file response for ${label}`);
  }
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
}

function assignment(text, key) {
  const match = String(text).match(new RegExp(`^${key}=([^\\s#]+)`, "m"));
  return match?.[1] || null;
}

export function parseLibvipsAdapterRecipe({ buildSh, dockerfile, mesonBuild }) {
  const libvipsVersion = assignment(buildSh, "VERSION_VIPS");
  const emsdkVersion = String(dockerfile).match(/^FROM\s+(?:docker\.io\/)?emscripten\/emsdk:(\d+\.\d+\.\d+)\s*$/m)?.[1] || null;
  const adapterVersion = String(mesonBuild).match(/version:\s*['"]([^'"]+)['"]/)?.[1] || null;
  const minimumLibvipsVersion = String(mesonBuild).match(/dependency\(['"]vips['"],\s*version:\s*['"]>=([^'"]+)['"]\)/)?.[1] || null;

  if (!SEMVER3.test(libvipsVersion || "")) throw new Error("wasm-vips build.sh does not declare an exact VERSION_VIPS");
  if (!SEMVER3.test(emsdkVersion || "")) throw new Error("wasm-vips Dockerfile does not pin an exact emsdk image");
  if (!SEMVER3.test(adapterVersion || "")) throw new Error("wasm-vips meson.build does not declare an exact adapter version");
  if (!minimumLibvipsVersion) throw new Error("wasm-vips meson.build does not declare the libvips dependency floor");
  if (!String(buildSh).includes("kleisauke:wasm-vips-$VERSION_VIPS.patch")) {
    throw new Error("wasm-vips build.sh no longer exposes the expected libvips compatibility branch");
  }
  if (!String(dockerfile).includes(`kleisauke:wasm-vips-${emsdkVersion}.patch`)) {
    throw new Error("wasm-vips Dockerfile no longer exposes the expected Emscripten compatibility branch");
  }

  return { libvipsVersion, emsdkVersion, adapterVersion, minimumLibvipsVersion };
}

export async function resolveLibvipsAdapterBundle(version, githubJson) {
  if (!SEMVER3.test(version || "")) {
    return { ready: false, reason: `unsupported libvips version: ${version || "<missing>"}` };
  }

  try {
    const adapter = await githubJson("https://api.github.com/repos/kleisauke/wasm-vips/commits/master");
    if (!SHA40.test(adapter?.sha || "")) throw new Error("wasm-vips master did not resolve to an exact commit");

    const ref = encodeURIComponent(adapter.sha);
    const [buildFile, dockerFile, mesonFile] = await Promise.all([
      githubJson(`https://api.github.com/repos/kleisauke/wasm-vips/contents/build.sh?ref=${ref}`),
      githubJson(`https://api.github.com/repos/kleisauke/wasm-vips/contents/Dockerfile?ref=${ref}`),
      githubJson(`https://api.github.com/repos/kleisauke/wasm-vips/contents/meson.build?ref=${ref}`)
    ]);
    const recipe = parseLibvipsAdapterRecipe({
      buildSh: decodeGithubFile(buildFile, "wasm-vips/build.sh"),
      dockerfile: decodeGithubFile(dockerFile, "wasm-vips/Dockerfile"),
      mesonBuild: decodeGithubFile(mesonFile, "wasm-vips/meson.build")
    });

    if (recipe.libvipsVersion !== version) {
      return {
        ready: false,
        reason: `wasm-vips master ${adapter.sha.slice(0, 12)} targets libvips ${recipe.libvipsVersion}, not ${version}`,
        adapterCommit: adapter.sha,
        adapterVersion: recipe.adapterVersion,
        emsdkVersion: recipe.emsdkVersion
      };
    }

    const libvipsPatchRef = `wasm-vips-${version}`;
    const emscriptenPatchRef = `wasm-vips-${recipe.emsdkVersion}`;
    const [emscripten, libvipsPatch, emscriptenPatch] = await Promise.all([
      githubJson(`https://api.github.com/repos/emscripten-core/emscripten/commits/${encodeURIComponent(recipe.emsdkVersion)}`),
      githubJson(`https://api.github.com/repos/kleisauke/libvips/commits/${encodeURIComponent(libvipsPatchRef)}`),
      githubJson(`https://api.github.com/repos/kleisauke/emscripten/commits/${encodeURIComponent(emscriptenPatchRef)}`)
    ]);
    for (const [label, sha] of [
      ["Emscripten", emscripten?.sha],
      ["libvips compatibility patch", libvipsPatch?.sha],
      ["Emscripten compatibility patch", emscriptenPatch?.sha]
    ]) {
      if (!SHA40.test(sha || "")) throw new Error(`${label} did not resolve to an exact commit`);
    }

    return {
      ready: true,
      reason: "adapter and compatibility patch bundle resolved to immutable commits",
      adapterCommit: adapter.sha,
      adapterVersion: recipe.adapterVersion,
      emsdkVersion: recipe.emsdkVersion,
      emscriptenRef: recipe.emsdkVersion,
      emscriptenCommit: emscripten.sha,
      libvipsPatchRef,
      libvipsPatchCommit: libvipsPatch.sha,
      emscriptenPatchRef,
      emscriptenPatchCommit: emscriptenPatch.sha
    };
  } catch (error) {
    return { ready: false, reason: error.message };
  }
}
