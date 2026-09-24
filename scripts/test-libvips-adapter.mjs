import test from "node:test";
import assert from "node:assert/strict";
import { parseLibvipsAdapterRecipe, resolveLibvipsAdapterBundle } from "./libvips-adapter.mjs";

const file = (text) => ({ type: "file", encoding: "base64", content: Buffer.from(text).toString("base64") });
const buildSh = ["VERSION_VIPS=8.19.0 # upstream", "curl -Ls https://github.com/libvips/libvips/compare/v$VERSION_VIPS...kleisauke:wasm-vips-$VERSION_VIPS.patch | patch -p1"].join("\\n");
const dockerfile = ["FROM docker.io/emscripten/emsdk:6.0.10", "RUN curl -Ls https://github.com/emscripten-core/emscripten/compare/6.0.10...kleisauke:wasm-vips-6.0.10.patch | patch -p1"].join("\\n");
const mesonBuild = ["project(\'wasm-vips\', \'cpp\',", "    version: \'0.0.19\',", ")", "vips_dep = dependency(\'vips\', version: \'>=8.19.0\')"].join("\\n");

test("parse adapter recipe", () => {
  assert.deepEqual(parseLibvipsAdapterRecipe({ buildSh, dockerfile, mesonBuild }), { libvipsVersion: "8.19.0", emsdkVersion: "6.0.10", adapterVersion: "0.0.19", minimumLibvipsVersion: "8.19.0" });
});

test("resolver freezes moving refs", async () => {
  const shas = { adapter: "a".repeat(40), emscripten: "b".repeat(40), vipsPatch: "c".repeat(40), emPatch: "d".repeat(40) };
  const githubJson = async (url) => {
    if (url.endsWith("/commits/master")) return { sha: shas.adapter };
    if (url.includes("/contents/build.sh?")) return file(buildSh);
    if (url.includes("/contents/Dockerfile?")) return file(dockerfile);
    if (url.includes("/contents/meson.build?")) return file(mesonBuild);
    if (url.includes("emscripten-core/emscripten/commits/6.0.10")) return { sha: shas.emscripten };
    if (url.includes("kleisauke/libvips/commits/wasm-vips-8.19.0")) return { sha: shas.vipsPatch };
    if (url.includes("kleisauke/emscripten/commits/wasm-vips-6.0.10")) return { sha: shas.emPatch };
    throw new Error("unexpected URL: " + url);
  };
  const result = await resolveLibvipsAdapterBundle("8.19.0", githubJson);
  assert.equal(result.ready, true);
  assert.equal(result.adapterCommit, shas.adapter);
  assert.equal(result.emscriptenCommit, shas.emscripten);
  assert.equal(result.libvipsPatchCommit, shas.vipsPatch);
  assert.equal(result.emscriptenPatchCommit, shas.emPatch);
});

test("resolver waits when adapter has not caught up", async () => {
  const githubJson = async (url) => {
    if (url.endsWith("/commits/master")) return { sha: "a".repeat(40) };
    if (url.includes("/contents/build.sh?")) return file(buildSh.replace("8.19.0", "8.18.6"));
    if (url.includes("/contents/Dockerfile?")) return file(dockerfile);
    if (url.includes("/contents/meson.build?")) return file(mesonBuild);
    throw new Error("unexpected URL: " + url);
  };
  const result = await resolveLibvipsAdapterBundle("8.19.0", githubJson);
  assert.equal(result.ready, false);
  assert.match(result.reason, /targets libvips 8\\.18\\.6, not 8\\.19\\.0/);
});
