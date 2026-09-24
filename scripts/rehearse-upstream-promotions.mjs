import { execFile as execFileCallback } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { automaticCandidateConfigs, automaticCandidateSlugs } from "./upstream-config.mjs";
import { root } from "./lib.mjs";

const execFile = promisify(execFileCallback);
const SYNTHETIC_RELEASED = "2026-01-01T00:00:00Z";

function bumpLastNumeric(value, label) {
  const match = String(value || "").match(/^(.*?)(\d+)$/);
  if (!match) throw new Error(`Unsupported ${label}: ${value || "<missing>"}`);
  const next = String(Number(match[2]) + 1).padStart(match[2].length, "0");
  return `${match[1]}${next}`;
}

function bumpPatchVersion(value, label) {
  if (!/^\d+\.\d+\.\d+$/.test(value || "")) throw new Error(`Unsupported ${label}: ${value || "<missing>"}`);
  const parts = value.split(".").map(Number);
  parts[2] += 1;
  return parts.join(".");
}

function syntheticHex(label, length) {
  const digest = crypto.createHash("sha256").update(`wasm-zoo-promotion-rehearsal:${label}`).digest("hex");
  if (length <= digest.length) return digest.slice(0, length);
  return (digest + crypto.createHash("sha256").update(`${label}:extra`).digest("hex")).slice(0, length);
}

function expandTemplate(template, version) {
  return String(template || "")
    .replaceAll("{version}", version)
    .replaceAll("{versionCompact}", version.replaceAll(".", ""));
}

async function readJsonAt(base, rel) {
  return JSON.parse(await fs.readFile(path.join(base, rel), "utf8"));
}

async function readEnvAt(base, rel) {
  const text = await fs.readFile(path.join(base, rel), "utf8");
  return Object.fromEntries(text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).replace(/^[\"']|[\"']$/g, "")];
    }));
}

async function run(command, args, cwd) {
  try {
    return await execFile(command, args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    if (detail) error.message += `\n${detail}`;
    throw error;
  }
}

function buildSyntheticArgs(slug, pkg, config, nextVersion, nextRef, commit) {
  const args = [
    "scripts/prepare-promotion.mjs",
    "--slug", slug,
    "--version", nextVersion,
    "--ref", nextRef,
    "--commit", commit,
    "--released", SYNTHETIC_RELEASED
  ];
  const expected = {};

  if (config.submodule) {
    expected.submoduleCommit = syntheticHex(`${slug}:submodule`, 40);
    args.push("--submodule-commit", expected.submoduleCommit);
  }

  if (config.extraEnv) {
    const source = pkg.tracker?.candidateSource || null;
    const releaseTag = source ? expandTemplate(source.releaseTagTemplate, nextVersion) : null;
    const assetName = source ? expandTemplate(source.assetNameTemplate, nextVersion) : null;
    const extras = {
      version: nextVersion,
      "release-tag": releaseTag,
      "source-url": releaseTag && assetName
        ? `https://github.com/${pkg.tracker.repository}/releases/download/${releaseTag}/${assetName}`
        : null,
      "source-sha256": syntheticHex(`${slug}:source`, 64)
    };
    if (slug === "libvips") {
      const currentEmsdk = String(pkg.zoo?.toolchain || "").match(/Emscripten (\d+\.\d+\.\d+)/)?.[1];
      if (!currentEmsdk) throw new Error("libvips: could not derive current Emscripten version");
      const nextEmsdk = bumpPatchVersion(currentEmsdk, "libvips synthetic Emscripten version");
      const nextAdapter = bumpPatchVersion(pkg.referenceWasm?.packageVersion, "libvips synthetic wasm-vips version");
      Object.assign(extras, {
        "emsdk-version": nextEmsdk,
        "emscripten-ref": nextEmsdk,
        "emscripten-commit": syntheticHex("libvips:emscripten", 40),
        "wasm-vips-commit": syntheticHex("libvips:adapter", 40),
        "wasm-vips-version": nextAdapter,
        "libvips-patch-commit": syntheticHex("libvips:vips-patch", 40),
        "emscripten-patch-commit": syntheticHex("libvips:emscripten-patch", 40)
      });
    }
    expected.extraEnv = {};
    for (const [argKey, envKey] of Object.entries(config.extraEnv)) {
      const value = extras[argKey];
      if (!value) throw new Error(`${slug}: no rehearsal value strategy for --${argKey}`);
      args.push(`--${argKey}`, value);
      expected.extraEnv[envKey] = value;
    }
  }

  return { args, expected };
}

async function validateRehearsal(worktree, slug, before, config, expected, nextVersion, nextRef, commit) {
  const after = await readJsonAt(worktree, `packages/${slug}/package.json`);
  const env = await readEnvAt(worktree, `builders/${config.dir}/versions.env`);
  const expectedBuilder = bumpPatchVersion(before.zoo?.builderVersion, `${slug} builder version`);

  if (after.upstream?.version !== nextVersion) throw new Error(`${slug}: upstream version was not promoted`);
  if (after.upstream?.ref !== nextRef) throw new Error(`${slug}: upstream ref was not promoted`);
  if (after.upstream?.released !== SYNTHETIC_RELEASED.slice(0, 10)) throw new Error(`${slug}: release date was not normalized`);
  if (after.zoo?.builderVersion !== expectedBuilder) throw new Error(`${slug}: builder patch version was not bumped`);
  if (after.release?.tag !== `${slug}-v${expectedBuilder}`) throw new Error(`${slug}: release tag did not follow the promoted builder`);
  if (env.BUILDER_VERSION !== expectedBuilder || env[config.refKey] !== nextRef || env[config.commitKey] !== commit) {
    throw new Error(`${slug}: versions.env does not match the synthetic reviewed pin`);
  }

  for (const profile of after.profiles || []) {
    const expectedAsset = `${slug}-${profile.id}-${nextVersion}-zoo-${expectedBuilder}.zip`;
    if (profile.releaseAsset !== expectedAsset) throw new Error(`${slug}: ${profile.id} release asset was not refreshed`);
  }

  if (expected.extraEnv) {
    for (const [envKey, value] of Object.entries(expected.extraEnv)) {
      if (env[envKey] !== value) throw new Error(`${slug}: ${envKey} did not keep the synthetic source identity`);
    }
  }
  if (expected.submoduleCommit && env[config.submodule.commitKey] !== expected.submoduleCommit) {
    throw new Error(`${slug}: submodule commit was not promoted`);
  }

  if (before.npm) {
    if (config.keepNpmPinned) {
      if (JSON.stringify(after.npm) !== JSON.stringify(before.npm)) {
        throw new Error(`${slug}: immutable published npm identity changed during package promotion rehearsal`);
      }
    } else {
      const expectedNpm = bumpPatchVersion(before.npm.version, `${slug} npm version`);
      if (after.npm?.version !== expectedNpm) throw new Error(`${slug}: npm patch version was not prepared with the promotion`);
    }
  }

  if (slug === "libvips") {
    if (after.zoo?.toolchain !== `Emscripten ${expected.extraEnv.EMSDK_VERSION}`) {
      throw new Error("libvips: package toolchain did not follow the synthetic adapter bundle");
    }
    if (after.referenceWasm?.packageVersion !== expected.extraEnv.WASM_VIPS_VERSION ||
        after.referenceWasm?.upstreamVersion !== nextVersion) {
      throw new Error("libvips: reference wasm-vips metadata did not follow the synthetic adapter bundle");
    }
    const adapterRow = (after.comparison || []).find((item) => item.name === "wasm-vips adapter");
    if (adapterRow?.version !== `${expected.extraEnv.WASM_VIPS_VERSION} / pinned commit`) {
      throw new Error("libvips: adapter comparison metadata was not refreshed");
    }
  }

  if (slug === "zstd") {
    const state = await readJsonAt(worktree, "site/zstd-playground/release-status.json");
    if (state.state !== "not-published" || state.tag !== `zstd-v${expectedBuilder}` || state.upstreamCommit !== commit) {
      throw new Error("zstd: Playground did not fail closed for the synthetic unreleased reviewed pin");
    }
  }
}

async function rehearse(slug) {
  const config = automaticCandidateConfigs[slug];
  const before = await readJsonAt(root, `packages/${slug}/package.json`);
  if (before.tracker?.candidateMode !== "auto") throw new Error(`${slug}: configured automatic candidate is not candidateMode=auto`);

  const nextVersion = bumpLastNumeric(before.upstream?.version, `${slug} upstream version`);
  if (!String(before.upstream?.ref || "").includes(before.upstream.version)) {
    throw new Error(`${slug}: cannot derive synthetic ref from ${before.upstream?.ref || "<missing>"}`);
  }
  const nextRef = before.upstream.ref.replace(before.upstream.version, nextVersion);
  const commit = syntheticHex(`${slug}:upstream`, 40);
  const { args, expected } = buildSyntheticArgs(slug, before, config, nextVersion, nextRef, commit);

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), `wasm-zoo-${slug}-rehearsal-`));
  const worktree = path.join(temp, "worktree");
  try {
    await run("git", ["worktree", "add", "--detach", worktree, "HEAD"], root);
    await run(process.execPath, args, worktree);
    await run(process.execPath, ["scripts/generate-catalog.mjs"], worktree);
    await run(process.execPath, [`builders/${config.dir}/scripts/check-repository.mjs`], worktree);
    await run("git", ["diff", "--check"], worktree);
    await validateRehearsal(worktree, slug, before, config, expected, nextVersion, nextRef, commit);
    console.log(`[OK] ${slug}: synthetic ${before.upstream.version} -> ${nextVersion} review-only promotion rehearsal passed`);
  } finally {
    await run("git", ["worktree", "remove", "--force", worktree], root).catch(() => {});
    await fs.rm(temp, { recursive: true, force: true });
  }
}

const configured = [...automaticCandidateSlugs];
if (!configured.length) throw new Error("No automatic candidate packages are configured");
if (!configured.includes("libvips")) throw new Error("libvips automatic adapter candidate must be covered by promotion rehearsal");

for (const slug of configured) await rehearse(slug);
console.log(`[OK] automatic promotion rehearsal passed for ${configured.length} packages including libvips adapter-bundle promotion`);
