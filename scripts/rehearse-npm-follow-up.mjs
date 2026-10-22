// Offline regression: finalize all nine distributions in a disposable copy,
// then run the real repository contracts against the future npm metadata/docs.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { root, loadPackages, readEnv } from './lib.mjs';
import { automaticCandidateConfig } from './upstream-config.mjs';
import { planNpmUpdate, finalizeNpmUpdate, tarballIdentity, updateDistributionDocs } from './npm-release-follow-up.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm-zoo-npm-follow-up-'));
try {
  await fs.cp(root, temp, { recursive: true, filter: src => !['.git', 'node_modules', 'npm-work'].includes(path.basename(src)) });
  for (const original of (await loadPackages()).filter(p => p.npm?.status === 'published')) {
    const pkg = structuredClone(original);
    // Model an independent publication in this fixture, even on a preparation PR.
    // The real pending update remains untouched in the source repository.
    delete pkg.npm.pending;
    const pins = await readEnv(path.join(root, 'builders', pkg.slug, 'versions.env'));
    // Simulate a just-completed package Release whose public npm still points at
    // an older Release, without changing the repository's actual reviewed pins.
    if (!pkg.npm.source || pkg.npm.source.releaseTag === pkg.release.tag) {
      pkg.npm.source = { upstreamVersion: '0.0.0', builderVersion: '0.0.0',
        releaseTag: `${pkg.slug}-v0.0.0`, releaseAsset: `${pkg.slug}-${pkg.npm.profile}-0.0.0-zoo-0.0.0.zip`, commit: 'b'.repeat(40) };
    }
    const prepared = planNpmUpdate(pkg, { releaseTag: pkg.release.tag, releaseCommit: 'a'.repeat(40),
      sourceCommit: pins[automaticCandidateConfig(pkg.slug).commitKey],
      registry: { name: pkg.npm.package, versions: { [pkg.npm.version]: {} } } });
    assert.equal(prepared.npm.version, original.npm.version, `${pkg.slug}: preparation changed public version`);
    assert.equal(prepared.npm.profile, original.npm.profile, `${pkg.slug}: profile changed`);
    const bytes = Buffer.from(`synthetic staged tarball: ${pkg.slug}`);
    const identity = tarballIdentity(bytes);
    const receipt = { package: pkg.npm.package, version: prepared.npm.pending.version,
      source: prepared.npm.pending.source, releaseCommit: prepared.npm.pending.releaseCommit, ...identity };
    const next = finalizeNpmUpdate(prepared, receipt, { name: pkg.npm.package, version: receipt.version, dist: identity }, bytes);
    const docs = updateDistributionDocs(original, next, {
      readme: await fs.readFile(path.join(temp, 'README.md'), 'utf8'),
      distribution: await fs.readFile(path.join(temp, 'docs/NPM_DISTRIBUTION.md'), 'utf8'),
      changelog: await fs.readFile(path.join(temp, 'CHANGELOG.md'), 'utf8')
    });
    await fs.writeFile(path.join(temp, 'packages', pkg.slug, 'package.json'), JSON.stringify(next, null, 2) + '\n');
    await fs.writeFile(path.join(temp, 'README.md'), docs.readme);
    await fs.writeFile(path.join(temp, 'docs/NPM_DISTRIBUTION.md'), docs.distribution);
    await fs.writeFile(path.join(temp, 'CHANGELOG.md'), docs.changelog);
    console.log(`[OK] synthetic npm prepare/approval/finalize: ${pkg.slug} ${pkg.npm.version} -> ${next.npm.version}`);
  }
  for (const args of [['scripts/generate-catalog.mjs'], ['--run', 'check']]) {
    const result = spawnSync(process.execPath, args, { cwd: temp, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`npm follow-up rehearsal contracts failed:\n${result.stdout}\n${result.stderr}`);
  }
  console.log('[OK] all nine future npm identities/docs pass the full repository check; no Registry write or real Release was performed');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
