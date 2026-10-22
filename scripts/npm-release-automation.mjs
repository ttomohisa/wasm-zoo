// GitHub Actions adapter for the npm update lifecycle. No direct npm publish path.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadPackages, readJson, root } from './lib.mjs';
import { automaticCandidateConfig } from './upstream-config.mjs';
import {
  planNpmUpdate, activatePendingNpm, finalizeNpmUpdate, validatePendingNpm,
  stageDecision, selectNpmTarget, tarballIdentity, findStageReceipt, verifyReleaseManifest,
  verifyReleaseChecksum, updateDistributionDocs
} from './npm-release-follow-up.mjs';

const repository = process.env.GITHUB_REPOSITORY || 'ttomohisa/wasm-zoo';
const work = path.join(root, 'npm-work');
const command = process.argv[2];
const args = {};
for (let i = 3; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || process.argv[i + 1] == null) throw new Error('Expected --key value');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const manifestPath = slug => path.join(root, 'packages', slug, 'package.json');
function run(cmd, argv, options = {}) {
  const result = spawnSync(cmd, argv, { cwd: root, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${argv[0]} failed: ${result.stderr || result.stdout || result.error}`);
  return result.stdout.trim();
}
function gh(argv) { return JSON.parse(run('gh', argv)); }
const api = endpoint => gh(['api', endpoint]);
async function output(values) {
  const body = Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, body);
  console.log(body.trim());
}
async function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  console.log(text);
}
async function registryVersion(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}${version ? '/' + encodeURIComponent(version) : ''}`, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404 && version) return null;
  if (!response.ok) throw new Error(`npm Registry request failed: ${response.status}`);
  return response.json();
}
async function packageFor(slug) {
  // Resolve from repository metadata before ever using a dispatch input in a path.
  const pkg = (await loadPackages()).find(p => p.slug === slug && p.status === 'available' && p.npm?.status === 'published');
  if (!pkg) throw new Error('Unknown published npm distribution slug');
  return pkg;
}
function prepareBranch(pkg) { return `automation/npm-prepare-${pkg.slug}-${pkg.npm.pending.version}`; }
function mergedPreparation(pkg) {
  const prs = gh(['pr', 'list', '--repo', repository, '--state', 'merged', '--base', 'main', '--head', prepareBranch(pkg), '--json', 'number,mergeCommit', '--limit', '10']);
  if (prs.length !== 1) throw new Error('Expected one human-merged npm preparation PR');
  run('git', ['merge-base', '--is-ancestor', prs[0].mergeCommit.oid, 'HEAD']);
  return prs[0];
}
function comments(pr) {
  return gh(['api', '--paginate', '--slurp', `repos/${repository}/issues/${pr}/comments`]).flat();
}
function ensureReviewChecks(branch, sha, mode) {
  const workflows = ['verify.yml', ...(mode === 'finalize' ? ['cross-browser-compat.yml'] : [])];
  for (const workflow of workflows) {
    const runs = gh(['run', 'list', '--repo', repository, '--workflow', workflow, '--branch', branch, '--commit', sha, '--json', 'databaseId', '--limit', '1']);
    if (!runs.length) run('gh', ['workflow', 'run', workflow, '--repo', repository, '--ref', branch]);
  }
}

async function createReviewPr(pkg, next, mode, body) {
  const branch = mode === 'prepare' ? prepareBranch(next) : `automation/npm-published-${pkg.slug}-${pkg.npm.pending.version}`;
  const existing = gh(['pr', 'list', '--repo', repository, '--state', 'all', '--head', branch, '--json', 'number,url,state,headRefOid', '--limit', '10']);
  if (existing.length) {
    if (existing[0].state === 'OPEN') ensureReviewChecks(branch, existing[0].headRefOid, mode);
    return summary(`Existing npm ${mode} PR: ${existing[0].url} (left unchanged)`);
  }
  const base = run('git', ['rev-parse', 'HEAD']);
  const remote = run('git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
  if (remote) throw new Error(`Branch ${branch} already exists without a PR; inspect it before retrying`);
  run('git', ['switch', '-c', branch]);
  try {
    await fs.writeFile(manifestPath(pkg.slug), json(next));
    if (mode === 'finalize') {
      const docs = updateDistributionDocs(pkg, next, {
        readme: await fs.readFile(path.join(root, 'README.md'), 'utf8'),
        distribution: await fs.readFile(path.join(root, 'docs/NPM_DISTRIBUTION.md'), 'utf8'),
        changelog: await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8')
      });
      await fs.writeFile(path.join(root, 'README.md'), docs.readme);
      await fs.writeFile(path.join(root, 'docs/NPM_DISTRIBUTION.md'), docs.distribution);
      await fs.writeFile(path.join(root, 'CHANGELOG.md'), docs.changelog);
    }
    run(process.execPath, ['scripts/generate-catalog.mjs']);
    run('npm', ['run', 'check']);
    run('git', ['diff', '--check']);
    run('git', ['config', 'user.name', 'github-actions[bot]']);
    run('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
    const files = [`packages/${pkg.slug}/package.json`, 'site/catalog.json'];
    if (mode === 'finalize') files.push('README.md', 'docs/NPM_DISTRIBUTION.md', 'CHANGELOG.md');
    run('git', ['add', '--', ...files]);
    run('git', ['commit', '-m', `chore(${pkg.slug}): ${mode === 'prepare' ? 'prepare' : 'record'} npm ${next.npm.pending?.version || next.npm.version}`]);
    run('git', ['push', 'origin', branch]);
    const bodyFile = path.join(os.tmpdir(), `npm-${mode}-${pkg.slug}.md`);
    await fs.writeFile(bodyFile, body);
    const url = run('gh', ['pr', 'create', '--repo', repository, '--base', 'main', '--head', branch,
      '--title', `chore(${pkg.slug}): ${mode === 'prepare' ? 'prepare' : 'record'} npm ${next.npm.pending?.version || next.npm.version}`,
      '--body-file', bodyFile]);
    // GITHUB_TOKEN-created PRs do not reliably start pull_request checks.
    ensureReviewChecks(branch, run('git', ['rev-parse', 'HEAD']), mode);
    await summary(url);
  } finally {
    run('git', ['switch', '--detach', '--force', base]);
  }
}

async function prepare() {
  const pkg = await packageFor(args.slug);
  if (args.tag !== pkg.release.tag) throw new Error('Release is stale or is not the reviewed current package Release');
  const release = api(`repos/${repository}/releases/tags/${encodeURIComponent(args.tag)}`);
  if (release.draft || release.prerelease) throw new Error('npm follow-up requires a stable published package Release');
  const releaseCommit = run('git', ['rev-parse', `refs/tags/${args.tag}^{commit}`]);
  run('git', ['merge-base', '--is-ancestor', releaseCommit, 'HEAD']);
  const tagged = JSON.parse(run('git', ['show', `${releaseCommit}:packages/${pkg.slug}/package.json`]));
  assert.equal(tagged.release.tag, pkg.release.tag);
  assert.deepEqual(tagged.upstream, pkg.upstream);
  assert.deepEqual(tagged.zoo, pkg.zoo);
  assert.equal(tagged.profiles.find(p => p.id === pkg.npm.profile)?.releaseAsset, pkg.profiles.find(p => p.id === pkg.npm.profile)?.releaseAsset);
  const pins = Object.fromEntries(run('git', ['show', `${releaseCommit}:builders/${pkg.slug}/versions.env`]).split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const n = l.indexOf('='); return [l.slice(0, n), l.slice(n + 1)]; }));
  const config = automaticCandidateConfig(pkg.slug);
  const next = planNpmUpdate(pkg, { releaseTag: args.tag, releaseCommit, sourceCommit: pins[config.commitKey], registry: await registryVersion(pkg.npm.package) });
  if (!next.npm.pending || JSON.stringify(pkg) === JSON.stringify(next)) return summary('No new npm preparation is needed.');
  for (const name of [next.npm.pending.source.releaseAsset, 'SHA256SUMS.txt']) {
    if (!release.assets.some(a => a.name === name)) throw new Error(`Missing Release asset ${name}`);
  }
  const p = next.npm.pending;
  await createReviewPr(pkg, next, 'prepare', `Prepare ${pkg.npm.package}@${p.version} from reviewed ${p.source.releaseTag} / ${p.profile}.\n\nThe current public npm version and Registry hash remain unchanged.\n\nAfter human merge, publish-npm.yml verifies the Release checksum and source identity, packs once, tests that exact tarball in Chromium, Firefox and WebKit, and stages it through the existing Trusted Publisher. Maintainer npm approval / 2FA remains required.\n\nSource commit: ${p.source.commit}\nRelease repository commit: ${p.releaseCommit}\n\nNo automatic merge, package tag creation or direct npm publication.`);
}

async function resolve() {
  await fs.mkdir(work, { recursive: true });
  const slug = process.env.NPM_SLUG;
  const pkg = await packageFor(slug);
  const mode = process.env.NPM_MODE;
  const { pending, active } = selectNpmTarget(pkg, { mode, pending: process.env.NPM_PENDING === 'true', ref: process.env.GITHUB_REF });
  const pr = pending ? mergedPreparation(pkg).number : null;
  await fs.writeFile(path.join(work, 'reviewed.json'), json(pkg));
  const profile = pkg.profiles.find(p => p.id === pkg.npm.profile);
  const meta = { slug, mode, pending, pr, package: active.npm.package, version: active.npm.version,
    tag: active.npm.source?.releaseTag || pkg.release.tag, asset: active.npm.source?.releaseAsset || profile.releaseAsset };
  await fs.writeFile(path.join(work, 'meta.json'), json(meta));
  await fs.writeFile(manifestPath(slug), json(active));
  await output({ slug, mode, pending, pr: pr || '', tag: meta.tag, asset: meta.asset, npm_name: meta.package, npm_version: meta.version });
}

async function dispatch() {
  const event = await readJson(process.env.GITHUB_EVENT_PATH);
  const p = event.pull_request;
  if (!p?.merged || p.base.ref !== 'main' || p.head.repo.full_name !== repository) throw new Error('Expected a human-merged same-repository PR');
  const files = gh(['api', '--paginate', '--slurp', `repos/${repository}/pulls/${p.number}/files`]).flat().map(f => f.filename).filter(f => /^packages\/[^/]+\/package.json$/.test(f));
  if (files.length !== 1) throw new Error('Expected one npm preparation manifest');
  const pkg = await packageFor(files[0].split('/')[1]);
  validatePendingNpm(pkg);
  if (p.head.ref !== prepareBranch(pkg) || mergedPreparation(pkg).number !== p.number) throw new Error('PR does not match reviewed pending npm target');
  run('gh', ['workflow', 'run', 'publish-npm.yml', '--repo', repository, '--ref', 'main', '-f', `slug=${pkg.slug}`, '-f', 'mode=stage', '-f', 'pending=true']);
}

async function activate() {
  const pkg = await readJson(path.join(work, 'reviewed.json'));
  const meta = await readJson(path.join(work, 'meta.json'));
  await fs.writeFile(manifestPath(pkg.slug), json(meta.pending ? activatePendingNpm(pkg) : pkg));
}

async function download() {
  const meta = await readJson(path.join(work, 'meta.json'));
  const reviewed = await readJson(path.join(work, 'reviewed.json'));
  const pkg = await readJson(manifestPath(meta.slug));
  const actualCommit = run('git', ['rev-parse', `refs/tags/${meta.tag}^{commit}`]);
  run('git', ['merge-base', '--is-ancestor', actualCommit, 'HEAD']);
  if (meta.pending) assert.equal(actualCommit, reviewed.npm.pending.releaseCommit, 'Release tag moved since review');
  const dir = path.join(work, 'download');
  await fs.mkdir(dir, { recursive: true });
  run('gh', ['release', 'download', meta.tag, '--repo', repository, '--pattern', meta.asset, '--pattern', 'SHA256SUMS.txt', '--dir', dir]);
  verifyReleaseChecksum(meta.asset, await fs.readFile(path.join(dir, 'SHA256SUMS.txt'), 'utf8'), await fs.readFile(path.join(dir, meta.asset)));
  const input = path.join(work, 'release');
  // Reject archive traversal and symlinks before extraction.
  run('python3', ['-c', 'import pathlib,stat,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nfor i in z.infolist():\n p=pathlib.PurePosixPath(i.filename)\n assert not p.is_absolute() and ".." not in p.parts and not stat.S_ISLNK(i.external_attr>>16), "Unsafe ZIP entry"\nz.extractall(sys.argv[2])', path.join(dir, meta.asset), input]);
  if (!pkg.npm.source?.commit) {
    const pins = run('git', ['show', `${actualCommit}:builders/${pkg.slug}/versions.env`]);
    const key = automaticCandidateConfig(pkg.slug).commitKey;
    const sourceCommit = pins.split(/\r?\n/).find(l => l.startsWith(key + '='))?.slice(key.length + 1);
    pkg.npm.source = { upstreamVersion: pkg.upstream.version, builderVersion: pkg.zoo.builderVersion, ...pkg.npm.source, commit: sourceCommit };
  }
  const manifest = await readJson(path.join(input, 'manifest.json'));
  const provenance = await readJson(path.join(input, 'provenance.json'));
  verifyReleaseManifest(pkg, manifest, provenance);
  assert.equal(provenance._type, 'https://in-toto.io/Statement/v1');
  assert.equal(provenance.predicateType, 'https://slsa.dev/provenance/v1');
  const sbom = await readJson(path.join(input, 'sbom.cdx.json'));
  assert.equal(sbom.bomFormat, 'CycloneDX');
  assert.equal(sbom.specVersion, '1.6');
  const subjects = new Map((provenance.subject || []).map(s => [s.name, s.digest?.sha256]));
  for (const asset of pkg.npm.runtime.assets) {
    for (const file of [asset.coreJs, asset.wasm]) {
      const bytes = await fs.readFile(path.join(input, file));
      const hash = createHash('sha256').update(bytes).digest('hex');
      assert.equal(hash, manifest.files?.[file]?.sha256, `Release core hash mismatch: ${file}`);
      assert.equal(hash, subjects.get(file), `Release provenance subject mismatch: ${file}`);
      assert.equal(bytes.length, manifest.files?.[file]?.bytes, `Release core size mismatch: ${file}`);
    }
  }
  const specific = path.join(root, 'scripts', `verify-npm-${pkg.slug}-release.mjs`);
  if (meta.pending && await fs.stat(specific).catch(() => null)) {
    const versionsFile = path.join(work, 'source-versions.env');
    await fs.writeFile(versionsFile, run('git', ['show', `${actualCommit}:builders/${pkg.slug}/versions.env`]) + '\n');
    run(process.execPath, [specific, '--input', input, '--versions-file', versionsFile]);
  }
  await summary(`Verified ${meta.tag} / ${meta.asset}: checksum, source commit, profile, provenance and core hashes.`);
}

async function reserve() {
  const meta = await readJson(path.join(work, 'meta.json'));
  const pkg = await readJson(path.join(work, 'reviewed.json'));
  if (meta.mode !== 'stage' || !meta.pending || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Staging requires a reviewed pending target on main');
  validatePendingNpm(pkg);
  const publicVersion = await registryVersion(meta.package, meta.version);
  const receipt = meta.pending ? findStageReceipt(comments(meta.pr), meta.slug, meta.version) : null;
  const decision = stageDecision({ publicVersion, receipt });
  if (decision !== 'stage') {
    await output({ stage: false });
    return summary(`npm staging skipped: ${decision}. An existing attempt is never automatically repeated. See preparation PR #${meta.pr || '(manual run)'}.`);
  }
  // Do not bootstrap packages through this workflow; keep existing Trusted Publisher configuration.
  await registryVersion(meta.package);
  const tarballs = (await fs.readdir(path.join(work, 'artifacts'))).filter(f => f.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, 'Expected exactly one tested npm tarball');
  const filename = tarballs[0];
  if (meta.pending) {
    const p = validatePendingNpm(pkg);
    const nextReceipt = { package: meta.package, version: meta.version, source: p.source, releaseCommit: p.releaseCommit,
      ...tarballIdentity(await fs.readFile(path.join(work, 'artifacts', filename))),
      reviewedCommit: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, pr: meta.pr };
    const body = `<!-- wasm-zoo-npm-stage:${meta.slug}:${meta.version} -->\n\nStaging attempt reserved after Chromium, Firefox and WebKit passed the exact tarball.\n\nRun: https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}\n\nMaintainer npm approval / 2FA is required. Reruns skip this attempt even after failure; inspect npm before recovery.\n\n\`\`\`json\n${JSON.stringify(nextReceipt, null, 2)}\n\`\`\`\n`;
    // Persist identity BEFORE the Registry write: an interrupted stage cannot cause a duplicate on rerun.
    const bodyFile = path.join(work, 'stage-comment.json');
    await fs.writeFile(bodyFile, json({ body }));
    run('gh', ['api', '--method', 'POST', `repos/${repository}/issues/${meta.pr}/comments`, '--input', bodyFile]);
  }
  await output({ stage: true, tarball: `npm-work/artifacts/${filename}` });
}

async function finalize() {
  const errors = [];
  for (const pkg of (await loadPackages()).filter(p => p.npm?.pending)) {
    try {
      validatePendingNpm(pkg);
      const metadata = await registryVersion(pkg.npm.package, pkg.npm.pending.version);
      if (!metadata) { await summary(`${pkg.npm.package}@${pkg.npm.pending.version}: awaiting npm approval.`); continue; }
      const pr = mergedPreparation(pkg);
      const receipt = findStageReceipt(comments(pr.number), pkg.slug, pkg.npm.pending.version);
      if (!receipt) throw new Error('Public version has no recorded stage artifact; refusing automatic finalization');
      const url = new URL(metadata.dist.tarball);
      if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org') throw new Error('Unexpected npm tarball host');
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`npm tarball download failed: ${response.status}`);
      const next = finalizeNpmUpdate(pkg, receipt, metadata, Buffer.from(await response.arrayBuffer()));
      await createReviewPr(pkg, next, 'finalize', `Record ${next.npm.package}@${next.npm.version} after maintainer npm approval.\n\nPublic Registry metadata and the downloaded tarball match the exact three-browser-tested stage artifact by SHA-1 and SHA-512.\n\nSHA-1: ${next.npm.registryShasum}\nSource Release: ${next.npm.source.releaseTag}\nPreparation PR: #${pr.number}\nStage run: https://github.com/${repository}/actions/runs/${receipt.runId}\n\nReview and merge after Verify and the published-package Cross-browser Lab pass. Do not stage or publish this version again. Package build pins and GitHub Release assets are unchanged.`);
    } catch (error) {
      console.error(`${pkg.slug}: ${error.message}`);
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Some npm publications could not be reconciled; other packages were still checked');
}

if (command === 'dispatch') await dispatch();
else if (command === 'prepare') await prepare();
else if (command === 'resolve') await resolve();
else if (command === 'activate') await activate();
else if (command === 'download') await download();
else if (command === 'reserve') await reserve();
else if (command === 'finalize') await finalize();
else throw new Error('Expected prepare, dispatch, resolve, activate, download, reserve or finalize');
