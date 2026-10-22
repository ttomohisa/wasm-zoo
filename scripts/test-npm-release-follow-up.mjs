import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import {
  planNpmUpdate, activatePendingNpm, finalizeNpmUpdate, verifyPublication,
  stageDecision, validatePendingNpm, verifyReleaseManifest, updateDistributionDocs
} from './npm-release-follow-up.mjs';

const sha = 'a'.repeat(40);
function fixture() {
  return {
    slug: 'imagemagick', name: 'ImageMagick', status: 'available',
    upstream: { version: '7.1.2-35' }, zoo: { builderVersion: '0.4.7' },
    profiles: [{ id: 'browser-full', releaseAsset: 'imagemagick-browser-full-7.1.2-35-zoo-0.4.7.zip' }],
    release: { tag: 'imagemagick-v0.4.7' },
    npm: { status: 'published', package: '@wasm-zoo/imagemagick', version: '0.4.6', profile: 'browser-full',
      source: { releaseTag: 'imagemagick-v0.4.6' }, registryShasum: 'b'.repeat(40) }
  };
}
const registry = () => ({ name: '@wasm-zoo/imagemagick', versions: { '0.4.6': {} }, 'dist-tags': { latest: '0.4.6' } });
function prepared() { return planNpmUpdate(fixture(), { releaseTag: 'imagemagick-v0.4.7', releaseCommit: sha, sourceCommit: sha, registry: registry() }); }

test('preparation preserves the live npm identity and independently increments npm', () => {
  const pkg = prepared();
  assert.deepEqual({ ...pkg.npm, pending: undefined }, { ...fixture().npm, pending: undefined });
  assert.equal(pkg.npm.pending.version, '0.4.7');
  assert.equal(pkg.npm.pending.source.commit, sha);
  assert.equal(pkg.npm.pending.releaseCommit, sha);
  const r = registry(); r.versions['0.5.1'] = {}; r['dist-tags'].latest = '0.5.1';
  assert.equal(planNpmUpdate(fixture(), { releaseTag: fixture().release.tag, releaseCommit: sha, sourceCommit: sha, registry: r }).npm.pending.version, '0.5.2');
});

test('preparation is idempotent and refuses to overwrite another pending publication', () => {
  const pkg = prepared();
  assert.deepEqual(planNpmUpdate(pkg, { releaseTag: pkg.release.tag, releaseCommit: sha, sourceCommit: sha, registry: registry() }), pkg);
  pkg.npm.pending.source.releaseTag = 'imagemagick-v0.4.5';
  assert.throws(() => planNpmUpdate(pkg, { releaseTag: pkg.release.tag, releaseCommit: sha, sourceCommit: sha, registry: registry() }), /pending/i);
});

test('wrong release, malformed source commit and registry identity fail closed', () => {
  const opts = { releaseTag: fixture().release.tag, releaseCommit: sha, sourceCommit: sha, registry: registry() };
  assert.throws(() => planNpmUpdate(fixture(), { ...opts, releaseTag: 'imagemagick-v0.4.6' }), /release/i);
  assert.throws(() => planNpmUpdate(fixture(), { ...opts, sourceCommit: 'main' }), /commit/i);
  assert.throws(() => planNpmUpdate(fixture(), { ...opts, registry: { ...registry(), name: '@wasm-zoo/qpdf' } }), /Registry/);
});

test('a release already used by the public npm identity produces no change', () => {
  const pkg = fixture(); pkg.npm.source.releaseTag = pkg.release.tag;
  assert.deepEqual(planNpmUpdate(pkg, { releaseTag: pkg.release.tag, releaseCommit: sha, sourceCommit: sha, registry: registry() }), pkg);
});

test('only a local packaging copy activates pending metadata', () => {
  const pkg = prepared(); const active = activatePendingNpm(pkg);
  assert.equal(active.npm.version, '0.4.7');
  assert.equal(active.npm.source.releaseTag, pkg.release.tag);
  assert.equal(active.npm.profile, 'browser-full');
  assert.equal(active.npm.registryShasum, undefined);
  assert.equal(active.npm.pending, undefined);
  assert.equal(pkg.npm.version, '0.4.6');
});

test('pending metadata rejects downgrades, profile switches and invalid paths', () => {
  for (const change of [p => p.version = '0.4.5', p => p.profile = 'browser-core', p => p.source.releaseAsset = '../asset.zip', p => p.releaseCommit = 'main']) {
    const pkg = prepared(); change(pkg.npm.pending);
    assert.throws(() => validatePendingNpm(pkg));
  }
});

test('a previous stage attempt blocks retries even if npm is still absent', () => {
  assert.equal(stageDecision({ publicVersion: null, receipt: null }), 'stage');
  assert.equal(stageDecision({ publicVersion: {}, receipt: null }), 'published');
  assert.equal(stageDecision({ publicVersion: null, receipt: {} }), 'attempted');
});

function evidence() {
  const tarball = Buffer.from('exact staged bytes');
  const shasum = createHash('sha1').update(tarball).digest('hex');
  const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64');
  return { tarball, receipt: { package: fixture().npm.package, version: '0.4.7', source: prepared().npm.pending.source, shasum, integrity, releaseCommit: sha },
    metadata: { name: fixture().npm.package, version: '0.4.7', dist: { shasum, integrity } } };
}

test('public metadata and downloaded bytes must match the recorded stage artifact', () => {
  const e = evidence();
  assert.doesNotThrow(() => verifyPublication(prepared(), e.receipt, e.metadata, e.tarball));
  assert.throws(() => verifyPublication(prepared(), e.receipt, e.metadata, Buffer.from('different bytes')), /hash|integrity/i);
  e.metadata.dist.shasum = 'c'.repeat(40);
  assert.throws(() => verifyPublication(prepared(), e.receipt, e.metadata, e.tarball), /hash|integrity/i);
});

test('receipt source and version cannot be substituted', () => {
  for (const change of [r => r.version = '0.4.8', r => r.source.commit = 'c'.repeat(40), r => r.releaseCommit = 'b'.repeat(40)]) {
    const e = evidence(); change(e.receipt);
    assert.throws(() => verifyPublication(prepared(), e.receipt, e.metadata, e.tarball), /identity/i);
  }
});

test('finalization advances npm only after verifying the actual public tarball', () => {
  const e = evidence(); const pkg = finalizeNpmUpdate(prepared(), e.receipt, e.metadata, e.tarball);
  assert.equal(pkg.npm.version, '0.4.7');
  assert.equal(pkg.npm.registryShasum, e.metadata.dist.shasum);
  assert.equal(pkg.npm.pending, undefined);
  assert.deepEqual(pkg.upstream, fixture().upstream);
  assert.deepEqual(pkg.release, fixture().release);
});

test('release manifest must match the reviewed package, profile, builder and exact commit', () => {
  const pkg = activatePendingNpm(prepared());
  const manifest = { package: pkg.slug, profile: pkg.npm.profile, upstream: { version: pkg.npm.source.upstreamVersion, commit: sha }, build: { builderVersion: '0.4.7' } };
  assert.doesNotThrow(() => verifyReleaseManifest(pkg, manifest));
  for (const change of [m => m.package = 'qpdf', m => m.profile = 'browser-core', m => m.upstream.commit = 'b'.repeat(40), m => m.build.builderVersion = '0.4.6']) {
    const bad = structuredClone(manifest); change(bad);
    assert.throws(() => verifyReleaseManifest(pkg, bad), /identity/i);
  }
});

test('finalization updates current distribution rows while retaining historical prose', () => {
  const e = evidence(); const pkg = finalizeNpmUpdate(prepared(), e.receipt, e.metadata, e.tarball);
  const readme = '| ImageMagick | 7.1.2-35 | 0.4.7 | `@wasm-zoo/imagemagick@0.4.6` |\nHistorical @wasm-zoo/imagemagick@0.4.6\n';
  const distribution = '| `@wasm-zoo/imagemagick` | `0.4.6` | ImageMagick 7.1.2-34 | `0.4.6` | `imagemagick-v0.4.6` | published |\n';
  const docs = updateDistributionDocs(fixture(), pkg, { readme, distribution, changelog: '# Changelog\n\n## Unreleased\n' });
  assert.match(docs.readme.split('\n')[0], /@0\.4\.7/);
  assert.match(docs.readme, /Historical @wasm-zoo\/imagemagick@0\.4\.6/);
  assert.match(docs.distribution, /7\.1\.2-35/);
  assert.match(docs.distribution, /imagemagick-v0\.4\.7/);
  assert.match(docs.changelog, new RegExp(e.metadata.dist.shasum));
});

test('checksum verification selects only the exact ZIP and detects altered bytes', async () => {
  const { verifyReleaseChecksum } = await import('./npm-release-follow-up.mjs');
  const bytes = Buffer.from('release ZIP');
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.doesNotThrow(() => verifyReleaseChecksum('release.zip', `${digest}  release.zip\n`, bytes));
  assert.throws(() => verifyReleaseChecksum('release.zip', `${digest}  other.zip\n`, bytes));
  assert.throws(() => verifyReleaseChecksum('release.zip', `${digest}  release.zip\n`, Buffer.from('wrong')));
});

test('stage receipts accept only the Actions bot and reject ambiguous or damaged records', async () => {
  const { findStageReceipt } = await import('./npm-release-follow-up.mjs');
  const receipt = evidence().receipt;
  const marker = '<!-- wasm-zoo-npm-stage:imagemagick:0.4.7 -->';
  const comment = { user: { login: 'github-actions[bot]' }, body: `${marker}\n\`\`\`json\n${JSON.stringify(receipt)}\n\`\`\`` };
  assert.equal(findStageReceipt([comment], 'imagemagick', '0.4.7').version, '0.4.7');
  assert.equal(findStageReceipt([{ ...comment, user: { login: 'someone' } }], 'imagemagick', '0.4.7'), null);
  assert.throws(() => findStageReceipt([comment, comment], 'imagemagick', '0.4.7'), /ambiguous/i);
  assert.throws(() => findStageReceipt([{ ...comment, body: marker }], 'imagemagick', '0.4.7'), /receipt/i);
});

test('every stage target requires reviewed main and pending metadata, including manual runs', async () => {
  const { selectNpmTarget } = await import('./npm-release-follow-up.mjs');
  assert.throws(() => selectNpmTarget(prepared(), { mode: 'stage', pending: false, ref: 'refs/heads/topic' }), /main/i);
  assert.throws(() => selectNpmTarget(fixture(), { mode: 'stage', pending: false, ref: 'refs/heads/main' }), /pending/i);
  const target = selectNpmTarget(prepared(), { mode: 'stage', pending: false, ref: 'refs/heads/main' });
  assert.equal(target.pending, true);
  assert.equal(target.active.npm.version, '0.4.7');
  assert.equal(selectNpmTarget(fixture(), { mode: 'pack', pending: false, ref: 'refs/heads/topic' }).active.npm.version, '0.4.6');
});

test('publication updates only the current package table when historical tables repeat the package', () => {
  const e = evidence(); const pkg = finalizeNpmUpdate(prepared(), e.receipt, e.metadata, e.tarball);
  const row = '| `@wasm-zoo/imagemagick` | `0.4.6` | ImageMagick 7.1.2-34 | `0.4.6` | `imagemagick-v0.4.6` | published |\n';
  const distribution = `## Historical rollout\n${row}\n## Published packages\n${row}\n## Consumer usage\n`;
  const result = updateDistributionDocs(fixture(), pkg, { readme: '| ImageMagick | `@wasm-zoo/imagemagick@0.4.6` |', distribution, changelog: '## Unreleased\n' });
  assert.match(result.distribution.split('## Published packages')[0], /`0\.4\.6`/);
  assert.match(result.distribution.split('## Published packages')[1], /`0\.4\.7`/);
});

test('QPDF source validation uses the selected Release toolchain rather than historical constants', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { root, readJson } = await import('./lib.mjs');
  const pkg = await readJson(path.join(root, 'packages/qpdf/package.json'));
  const source = pkg.npm.source;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'qpdf-source-pins-'));
  try {
    for (const file of ['browser-qpdf.js', 'wasm-zoo.mjs', 'qpdf-core.js', 'qpdf-core.wasm', 'features.json', 'qpdf-config.txt',
      'LICENSES/QPDF-LICENSE.txt', 'LICENSES/QPDF-NOTICE.md', 'LICENSES/zlib-LICENSE.txt', 'LICENSES/libjpeg-README.txt', 'LICENSES/THIRD-PARTY.txt']) {
      await fs.mkdir(path.dirname(path.join(temp, file)), { recursive: true });
      await fs.writeFile(path.join(temp, file), 'fixture');
    }
    await fs.writeFile(path.join(temp, 'versions.env'), 'EMSDK_VERSION=6.9.0\nZLIB_VERSION=1.4.0\nLIBJPEG_VERSION=10a\n');
    await fs.writeFile(path.join(temp, 'manifest.json'), JSON.stringify({ package: 'qpdf', profile: 'browser-full',
      upstream: { ...source, version: source.upstreamVersion, ref: `v${source.upstreamVersion}`, sourceSha256: 'a'.repeat(64) },
      build: { builderVersion: source.builderVersion }, toolchain: { version: '6.9.0' },
      files: { 'qpdf-core.js': { sha256: 'b'.repeat(64), bytes: 7 }, 'qpdf-core.wasm': { sha256: 'c'.repeat(64), bytes: 7 } } }));
    await fs.writeFile(path.join(temp, 'provenance.json'), JSON.stringify({ predicate: { buildDefinition: { externalParameters: {
      package: 'qpdf', upstreamVersion: source.upstreamVersion, builderVersion: source.builderVersion, profile: 'browser-full' } } } }));
    await fs.writeFile(path.join(temp, 'sbom.cdx.json'), JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6' }));
    await fs.writeFile(path.join(temp, 'BUILDINFO.txt'), `Zoo build version: ${source.builderVersion}\nQPDF version: ${source.upstreamVersion}\nQPDF commit: ${source.commit}\nEmscripten version: 6.9.0\nEmscripten zlib 1.4.0 + libjpeg 10a ports\n`);
    const result = spawnSync(process.execPath, ['scripts/verify-npm-qpdf-release.mjs', '--input', temp, '--versions-file', path.join(temp, 'versions.env')], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
