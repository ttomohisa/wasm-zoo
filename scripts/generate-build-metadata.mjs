import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root, readJson } from './lib.mjs';

const argv = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
const slug = arg('--slug');
const profileId = arg('--profile');
const distArg = arg('--dist');
if (!slug || !profileId || !distArg) {
  console.error('usage: node scripts/generate-build-metadata.mjs --slug <slug> --profile <profile> --dist <path>');
  process.exit(2);
}

const dist = path.resolve(distArg);
const pkg = await readJson(path.join(root, 'packages', slug, 'package.json'));
const profile = pkg.profiles?.find((item) => item.id === profileId);
if (!profile) throw new Error(`unknown profile ${slug}/${profileId}`);
const manifest = await readJson(path.join(dist, 'manifest.json'));
if (manifest.profile !== profileId) throw new Error(`manifest profile mismatch: ${manifest.profile} != ${profileId}`);

function parseEnv(text) {
  const result = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}
const versionsPath = path.join(root, 'builders', slug, 'versions.env');
const versions = parseEnv(await fs.readFile(versionsPath, 'utf8'));

function repoUri(value) {
  if (!value) return null;
  return value.replace(/\.git$/, '');
}
function digestObject(value) {
  if (!value) return undefined;
  return { sha256: String(value).replace(/^sha256:/, '') };
}
function deterministicUuid(seed) {
  const bytes = Buffer.from(crypto.createHash('sha256').update(seed).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function inspectBaseImageDigest(image) {
  try {
    const out = spawnSync('docker', ['buildx', 'imagetools', 'inspect', image, '--format', '{{.Manifest.Digest}}'], { encoding: 'utf8', timeout: 30000 });
    if (out.status === 0) {
      const value = String(out.stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
      if (/^sha256:[0-9a-f]{64}$/i.test(value || '')) return value;
    }
  } catch {}
  return null;
}

const emsdkVersion = versions.EMSDK_VERSION || manifest.toolchain?.emscripten || manifest.toolchain?.version || null;
const baseImage = emsdkVersion ? `docker.io/emscripten/emsdk:${emsdkVersion}` : null;
const baseImageDigest = baseImage ? inspectBaseImageDigest(baseImage) : null;

const resolvedDependencies = [];
const seenRepos = new Set();
for (const [key, value] of Object.entries(versions)) {
  if (!key.endsWith('_REPOSITORY') || key.includes('_FALLBACK_')) continue;
  const prefix = key.slice(0, -'_REPOSITORY'.length);
  const uri = repoUri(value);
  if (!uri || seenRepos.has(uri)) continue;
  seenRepos.add(uri);
  const commit = versions[`${prefix}_COMMIT`] || null;
  const ref = versions[`${prefix}_REF`] || versions[`${prefix}_VERSION`] || null;
  const fullSha1 = commit && /^[0-9a-f]{40}$/i.test(commit) ? commit : null;
  resolvedDependencies.push({
    uri: ref ? `${uri}@${ref}` : uri,
    ...(fullSha1 ? { digest: { sha1: fullSha1 } } : {}),
    ...(ref || commit ? { annotations: { ...(ref ? { ref } : {}), ...(commit ? { gitCommit: commit } : {}), ...(!fullSha1 && commit ? { digestStatus: 'abbreviated commit; not asserted as sha1 digest' } : {}) } } : {})
  });
}
if (baseImage) {
  resolvedDependencies.push({
    uri: `pkg:docker/emscripten/emsdk@${encodeURIComponent(emsdkVersion)}`,
    ...(baseImageDigest ? { digest: digestObject(baseImageDigest) } : {}),
    annotations: { image: baseImage, digestResolution: baseImageDigest ? 'resolved' : 'unavailable' }
  });
}
for (const [key, value] of Object.entries(versions)) {
  if (!key.endsWith('_SOURCE_SHA256')) continue;
  const prefix = key.slice(0, -'_SOURCE_SHA256'.length);
  const url = versions[`${prefix}_SOURCE_URL`];
  if (url) resolvedDependencies.push({ uri: url, digest: { sha256: value } });
}

const subjects = Object.entries(manifest.files || {})
  .filter(([, info]) => info?.sha256)
  .map(([name, info]) => ({ name, digest: { sha256: info.sha256 } }))
  .sort((a, b) => a.name.localeCompare(b.name));
if (!subjects.length) throw new Error(`${slug}/${profileId} manifest has no hashed files`);

const repository = process.env.GITHUB_REPOSITORY || 'ttomohisa/wasm-zoo';
const runId = process.env.GITHUB_RUN_ID || null;
const runAttempt = process.env.GITHUB_RUN_ATTEMPT || null;
const invocationId = runId ? `https://github.com/${repository}/actions/runs/${runId}${runAttempt ? `#attempt-${runAttempt}` : ''}` : `local:${process.platform}:${process.pid}`;
const generatedAt = new Date().toISOString();
const provenance = {
  _type: 'https://in-toto.io/Statement/v1',
  subject: subjects,
  predicateType: 'https://slsa.dev/provenance/v1',
  predicate: {
    buildDefinition: {
      buildType: `https://github.com/${repository}/tree/${process.env.GITHUB_SHA || 'main'}/builders/${slug}`,
      externalParameters: {
        package: slug,
        upstreamVersion: pkg.upstream.version,
        upstreamRef: pkg.upstream.ref,
        profile: profileId,
        builderVersion: pkg.zoo.builderVersion,
        target: profile.target,
        threads: profile.threads,
        simd: profile.simd
      },
      internalParameters: {
        zooVersion: (await fs.readFile(path.join(root, 'VERSION'), 'utf8')).trim(),
        metadataGenerator: 'scripts/generate-build-metadata.mjs',
        browserSmokeTest: true
      },
      resolvedDependencies
    },
    runDetails: {
      builder: { id: runId ? `https://github.com/${repository}/actions` : 'https://github.com/ttomohisa/wasm-zoo#local-builder' },
      metadata: {
        invocationId,
        finishedOn: generatedAt,
        completeness: { parameters: true, environment: Boolean(baseImageDigest), materials: true },
        reproducible: Boolean(pkg.zoo.reproducible)
      },
      byproducts: [
        { name: 'browser-smoke-test', content: { status: 'passed', package: slug, profile: profileId } },
        { name: 'manifest.json', content: { schemaVersion: manifest.schemaVersion || 1 } }
      ]
    }
  }
};

function componentFromExternal(text, index) {
  const source = String(text);
  const versionMatch = source.match(/\b(v?\d+(?:\.\d+)+(?:[-.][0-9A-Za-z]+)?)\b/);
  const name = source.split(/\s+\d|\s*\(/)[0].trim() || `external-${index + 1}`;
  return {
    type: 'library',
    'bom-ref': `external:${slug}:${profileId}:${index}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    ...(versionMatch ? { version: versionMatch[1].replace(/^v/, '') } : {}),
    properties: [{ name: 'wasm-zoo:source-description', value: source }]
  };
}

const components = [];
components.push({
  type: 'library',
  'bom-ref': `upstream:${slug}:${pkg.upstream.version}`,
  name: pkg.name,
  version: pkg.upstream.version,
  licenses: [{ license: { name: pkg.upstream.license } }],
  externalReferences: [
    ...(pkg.upstream.repository ? [{ type: 'vcs', url: pkg.upstream.repository }] : []),
    ...(pkg.upstream.homepage ? [{ type: 'website', url: pkg.upstream.homepage }] : [])
  ],
  properties: [
    { name: 'wasm-zoo:upstream-ref', value: pkg.upstream.ref || '' },
    { name: 'wasm-zoo:upstream-commit', value: manifest.upstream?.commit || versions[`${slug.toUpperCase()}_COMMIT`] || '' }
  ].filter((item) => item.value)
});

for (const [index, item] of (profile.externalLibraries || []).entries()) components.push(componentFromExternal(item, index));

// wasm-vips emits a concrete linked dependency inventory; use it when available.
try {
  const vipsVersions = await readJson(path.join(dist, 'versions.json'));
  for (const [name, version] of Object.entries(vipsVersions)) {
    if (!version || typeof version === 'object') continue;
    if (components.some((item) => item.name.toLowerCase() === String(name).toLowerCase())) continue;
    components.push({ type: 'library', 'bom-ref': `linked:${slug}:${profileId}:${name}`, name, version: String(version), properties: [{ name: 'wasm-zoo:inventory-source', value: 'versions.json' }] });
  }
} catch {}

// Ghostscript ships third-party notices from the exact official source archive. Represent
// each top-level source family without inventing versions the archive does not expose here.
try {
  const indexText = await fs.readFile(path.join(dist, 'THIRD-PARTY-LICENSES', 'INDEX.txt'), 'utf8');
  const names = new Set();
  for (const raw of indexText.split(/\r?\n/)) {
    const rel = raw.trim();
    if (!rel || !rel.includes('/')) continue;
    const family = rel.split('/')[0];
    if (['doc', 'Resource'].includes(family)) continue;
    names.add(family);
  }
  for (const name of [...names].sort()) {
    if (components.some((item) => item.name.toLowerCase() === name.toLowerCase())) continue;
    components.push({ type: 'library', 'bom-ref': `bundled:${slug}:${name}`, name, properties: [{ name: 'wasm-zoo:inventory-source', value: 'official-source-license-inventory' }, { name: 'wasm-zoo:version-status', value: 'not separately declared by Zoo metadata' }] });
  }
} catch {}

const bomRef = `pkg:generic/wasm-zoo/${slug}@${encodeURIComponent(pkg.upstream.version)}?profile=${encodeURIComponent(profileId)}&zoo=${encodeURIComponent(pkg.zoo.builderVersion)}`;
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${deterministicUuid(`${slug}|${profileId}|${pkg.upstream.version}|${pkg.zoo.builderVersion}`)}`,
  version: 1,
  metadata: {
    timestamp: generatedAt,
    tools: {
      components: [{
        type: 'application',
        name: 'WASM Zoo metadata generator',
        version: (await fs.readFile(path.join(root, 'VERSION'), 'utf8')).trim(),
        externalReferences: [{ type: 'vcs', url: `https://github.com/${repository}` }]
      }, ...(emsdkVersion ? [{ type: 'application', name: 'Emscripten', version: emsdkVersion, properties: [{ name: 'wasm-zoo:commit', value: versions.EMSCRIPTEN_COMMIT || '' }].filter((item) => item.value) }] : [])]
    },
    component: {
      type: 'application',
      'bom-ref': bomRef,
      group: 'wasm-zoo',
      name: slug,
      version: pkg.upstream.version,
      licenses: [{ license: { name: profile.binaryLicense } }],
      properties: [
        { name: 'wasm-zoo:profile', value: profileId },
        { name: 'wasm-zoo:builder-version', value: pkg.zoo.builderVersion },
        { name: 'wasm-zoo:target', value: profile.target },
        { name: 'wasm-zoo:sbom-completeness', value: slug === 'ghostscript' ? 'bundled component names are notice-derived; versions may be unspecified' : 'best-effort exact inventory from pinned build inputs' }
      ]
    }
  },
  components,
  dependencies: [{ ref: bomRef, dependsOn: components.map((item) => item['bom-ref']) }]
};

await fs.writeFile(path.join(dist, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
await fs.writeFile(path.join(dist, 'sbom.cdx.json'), `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`[OK] generated provenance.json and sbom.cdx.json for ${slug}/${profileId}${baseImageDigest ? ` · base ${baseImageDigest.slice(0, 19)}…` : ' · base image digest unavailable'}`);
