import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const commit = /^[a-f0-9]{40}$/;
const safeFile = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const requireValue = (value, message) => { if (!value) throw new Error(message); };
function compare(a, b) {
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  return aa[0] - bb[0] || aa[1] - bb[1] || aa[2] - bb[2];
}

export function validatePendingNpm(pkg) {
  const p = pkg.npm?.pending;
  requireValue(pkg.status === 'available' && pkg.npm?.status === 'published' && p, 'No published npm package with pending update');
  requireValue(stable.test(p.version) && compare(p.version, pkg.npm.version) > 0, 'Pending npm version must advance the published version');
  requireValue(p.profile === pkg.npm.profile && pkg.profiles.some(x => x.id === p.profile), 'Pending npm profile must preserve the reviewed distribution profile');
  requireValue(commit.test(p.releaseCommit) && commit.test(p.source?.commit), 'Pending release/source commit must be exact');
  requireValue(stable.test(p.source?.builderVersion) && typeof p.source?.upstreamVersion === 'string' && /^[0-9][a-zA-Z0-9.-]*$/.test(p.source.upstreamVersion), 'Pending source version is invalid');
  requireValue(p.source.releaseTag === `${pkg.slug}-v${p.source.builderVersion}`, 'Pending source release tag mismatch');
  requireValue(safeFile.test(p.source.releaseAsset) && p.source.releaseAsset === `${pkg.slug}-${p.profile}-${p.source.upstreamVersion}-zoo-${p.source.builderVersion}.zip`, 'Pending release asset path mismatch');
  return p;
}

export function planNpmUpdate(pkg, { releaseTag, releaseCommit, sourceCommit, registry }) {
  requireValue(pkg.status === 'available' && pkg.npm?.status === 'published', 'Only existing published npm distributions can be prepared');
  requireValue(releaseTag === pkg.release.tag, 'Requested release must match current reviewed package release');
  requireValue(commit.test(releaseCommit) && commit.test(sourceCommit), 'Release and source commit must be exact');
  requireValue(registry?.name === pkg.npm.package && registry.versions?.[pkg.npm.version], 'Registry does not contain the reviewed npm identity');
  if (pkg.npm.pending) {
    const p = validatePendingNpm(pkg);
    requireValue(p.source.releaseTag === releaseTag && p.releaseCommit === releaseCommit && p.source.commit === sourceCommit, 'Another npm publication is already pending');
    return structuredClone(pkg);
  }
  if ((pkg.npm.source?.releaseTag || pkg.release.tag) === releaseTag) return structuredClone(pkg);
  const versions = [pkg.npm.version, ...Object.keys(registry.versions)].filter(x => stable.test(x)).sort(compare);
  const [major, minor, patch] = versions.at(-1).split('.').map(Number);
  const profile = pkg.profiles.find(x => x.id === pkg.npm.profile);
  const result = structuredClone(pkg);
  result.npm.pending = {
    version: `${major}.${minor}.${patch + 1}`, profile: pkg.npm.profile, releaseCommit,
    source: { upstreamVersion: pkg.upstream.version, builderVersion: pkg.zoo.builderVersion,
      releaseTag, releaseAsset: profile?.releaseAsset, commit: sourceCommit }
  };
  validatePendingNpm(result);
  return result;
}

export function activatePendingNpm(pkg) {
  const p = validatePendingNpm(pkg);
  const result = structuredClone(pkg);
  Object.assign(result.npm, { version: p.version, profile: p.profile, source: structuredClone(p.source) });
  delete result.npm.registryShasum;
  delete result.npm.pending;
  return result;
}

export function stageDecision({ publicVersion, receipt }) {
  return publicVersion ? 'published' : receipt ? 'attempted' : 'stage';
}

export function tarballIdentity(bytes) {
  return { shasum: createHash('sha1').update(bytes).digest('hex'),
    integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
}

export function verifyPublication(pkg, receipt, metadata, tarball) {
  const p = validatePendingNpm(pkg);
  try {
    assert.equal(receipt.package, pkg.npm.package);
    assert.equal(receipt.version, p.version);
    assert.equal(receipt.releaseCommit, p.releaseCommit);
    assert.deepEqual(receipt.source, p.source);
    assert.equal(metadata.name, pkg.npm.package);
    assert.equal(metadata.version, p.version);
  } catch { throw new Error('Published npm / stage receipt identity mismatch'); }
  const actual = tarballIdentity(tarball);
  requireValue(/^[a-f0-9]{40}$/.test(receipt.shasum) && actual.shasum === receipt.shasum && metadata.dist?.shasum === receipt.shasum, 'Published tarball SHA-1 hash mismatch');
  requireValue(actual.integrity === receipt.integrity && metadata.dist?.integrity === receipt.integrity, 'Published tarball SHA-512 integrity mismatch');
}

export function finalizeNpmUpdate(pkg, receipt, metadata, tarball) {
  verifyPublication(pkg, receipt, metadata, tarball);
  const result = activatePendingNpm(pkg);
  result.npm.registryShasum = metadata.dist.shasum;
  result.notes = [`${result.npm.package}@${result.npm.version} published from ${result.npm.source.releaseTag}; Registry SHA-1 ${metadata.dist.shasum} matches the three-browser-tested staged tarball.`, ...(pkg.notes || [])];
  return result;
}

export function verifyReleaseManifest(pkg, manifest, provenance) {
  const source = pkg.npm.source;
  const params = provenance?.predicate?.buildDefinition?.externalParameters;
  requireValue(manifest.package === pkg.slug && manifest.profile === pkg.npm.profile &&
    manifest.upstream?.version === source.upstreamVersion && manifest.upstream?.commit === source.commit &&
    (manifest.build?.builderVersion || manifest.zooBuildVersion || params?.builderVersion) === source.builderVersion,
  'Release manifest identity mismatch');
  if (provenance) requireValue(params?.package === pkg.slug && params.profile === pkg.npm.profile &&
    params.upstreamVersion === source.upstreamVersion && params.builderVersion === source.builderVersion,
  'Release provenance identity mismatch');
}

export function verifyReleaseChecksum(asset, checksums, bytes) {
  const matches = checksums.split(/\r?\n/).filter(line => line.slice(66).replace(/^\*/, '') === asset);
  requireValue(matches.length === 1 && /^[a-f0-9]{64} [ *]/.test(matches[0]), 'Release checksum entry missing or ambiguous');
  requireValue(createHash('sha256').update(bytes).digest('hex') === matches[0].slice(0, 64), 'Release ZIP checksum mismatch');
}

export function updateDistributionDocs(oldPkg, pkg, { readme, distribution, changelog }) {
  const replaceRow = (text, prefix, change) => {
    let count = 0;
    const next = text.split('\n').map(line => { if (!line.startsWith(prefix)) return line; count++; return change(line); }).join('\n');
    requireValue(count === 1, `Expected one current documentation row: ${prefix}`);
    return next;
  };
  readme = replaceRow(readme, `| ${pkg.name} |`, line => line.replace(`${oldPkg.npm.package}@${oldPkg.npm.version}`, `${pkg.npm.package}@${pkg.npm.version}`));
  const s = pkg.npm.source;
  const start = distribution.indexOf('## Published packages\n');
  const end = start < 0 ? -1 : distribution.indexOf('\n## ', start + 1);
  const before = start < 0 ? '' : distribution.slice(0, start);
  const after = end < 0 ? '' : distribution.slice(end);
  const current = distribution.slice(start < 0 ? 0 : start, end < 0 ? undefined : end);
  distribution = before + replaceRow(current, `| \`${pkg.npm.package}\` |`, () =>
    `| \`${pkg.npm.package}\` | \`${pkg.npm.version}\` | ${pkg.name} ${s.upstreamVersion} | \`${s.builderVersion}\` | \`${s.releaseTag}\` / \`${pkg.npm.profile}\` | published |`) + after;
  requireValue(changelog.includes('## Unreleased\n'), 'CHANGELOG has no Unreleased section');
  changelog = changelog.replace('## Unreleased\n', `## Unreleased\n\n- record ${pkg.npm.package}@${pkg.npm.version} publication from ${s.releaseTag}; verified Registry SHA-1 \`${pkg.npm.registryShasum}\` against the staged tarball;\n`);
  return { readme, distribution, changelog };
}

export function findStageReceipt(comments, slug, version) {
  const marker = `<!-- wasm-zoo-npm-stage:${slug}:${version} -->`;
  const matches = comments.filter(c => c.user?.login === 'github-actions[bot]' && c.body?.includes(marker));
  requireValue(matches.length <= 1, 'Ambiguous stage receipts');
  if (!matches.length) return null;
  const json = matches[0].body.match(/```json\s*\n([\s\S]*?)\n```/);
  requireValue(json, 'Stage receipt is damaged; automatic retry is blocked');
  return JSON.parse(json[1]);
}

export function selectNpmTarget(pkg, { mode, pending, ref }) {
  requireValue(['pack', 'stage'].includes(mode), 'Unsupported npm mode');
  pending = pending || mode === 'stage';
  requireValue(!pending || ref === 'refs/heads/main', 'Pending npm targets and staging must run on reviewed main');
  return { pending, active: pending ? activatePendingNpm(pkg) : structuredClone(pkg) };
}
