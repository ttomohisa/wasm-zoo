import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadPackages, readJson, root } from './lib.mjs';

function assert(condition, message) { if (!condition) throw new Error(message); }
const packages = (await loadPackages()).filter((pkg) => pkg.status === 'available');
for (const pkg of packages) {
  assert(pkg.zoo?.supplyChainMetadata === true, `${pkg.slug}: supplyChainMetadata must be true`);
  assert(String(pkg.zoo?.provenance).includes('SLSA Provenance v1'), `${pkg.slug}: provenance contract missing`);
  assert(String(pkg.zoo?.sbom).includes('CycloneDX 1.6'), `${pkg.slug}: SBOM contract missing`);
  const build = await fs.readFile(path.join(root, 'builders', pkg.slug, 'build.sh'), 'utf8');
  const buildPs1 = await fs.readFile(path.join(root, 'builders', pkg.slug, 'scripts', 'build.ps1'), 'utf8');
  const release = await fs.readFile(path.join(root, 'builders', pkg.slug, 'scripts', 'prepare-release.sh'), 'utf8');
  assert(build.includes('generate-build-metadata.mjs'), `${pkg.slug}: build.sh must generate supply-chain metadata after smoke testing`);
  assert(buildPs1.includes('generate-build-metadata.mjs'), `${pkg.slug}: Windows build.ps1 must generate supply-chain metadata after smoke testing`);
  assert(release.includes('provenance.json') && release.includes('sbom.cdx.json'), `${pkg.slug}: binary release must contain provenance and SBOM`);
  assert(release.includes('provenance-') && release.includes('sbom-'), `${pkg.slug}: GitHub Release must expose standalone provenance and SBOM assets`);

  for (const profile of pkg.profiles) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `wasm-zoo-metadata-${pkg.slug}-${profile.id}-`));
    try {
      const manifest = {
        schemaVersion: 1,
        package: pkg.slug,
        profile: profile.id,
        upstream: { version: pkg.upstream.version, ref: pkg.upstream.ref, commit: '0123456789abcdef0123456789abcdef01234567' },
        toolchain: { emscripten: 'fixture' },
        files: { 'fixture.wasm': { bytes: 8, sha256: 'a'.repeat(64) } }
      };
      await fs.writeFile(path.join(tmp, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
      const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'generate-build-metadata.mjs'), '--slug', pkg.slug, '--profile', profile.id, '--dist', tmp], { encoding: 'utf8' });
      assert(result.status === 0, `${pkg.slug}/${profile.id}: metadata generator fixture failed: ${result.stderr || result.stdout}`);
      const provenance = await readJson(path.join(tmp, 'provenance.json'));
      const sbom = await readJson(path.join(tmp, 'sbom.cdx.json'));
      assert(provenance._type === 'https://in-toto.io/Statement/v1', `${pkg.slug}/${profile.id}: in-toto statement type invalid`);
      assert(provenance.predicateType === 'https://slsa.dev/provenance/v1', `${pkg.slug}/${profile.id}: SLSA predicate invalid`);
      assert(provenance.subject?.[0]?.digest?.sha256 === 'a'.repeat(64), `${pkg.slug}/${profile.id}: provenance subject digest invalid`);
      assert(sbom.bomFormat === 'CycloneDX' && sbom.specVersion === '1.6', `${pkg.slug}/${profile.id}: CycloneDX schema header invalid`);
      assert(sbom.metadata?.component?.properties?.some((item) => item.name === 'wasm-zoo:profile' && item.value === profile.id), `${pkg.slug}/${profile.id}: SBOM profile property missing`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  }
}
console.log(`[OK] supply-chain metadata contract: ${packages.length} packages / ${packages.reduce((sum, pkg) => sum + pkg.profiles.length, 0)} profiles`);
