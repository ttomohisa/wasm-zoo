import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { automaticCandidateConfig, automaticCandidateSlugs } from './upstream-config.mjs';
import { readJson, root } from './lib.mjs';

const errors = [];
const need = (ok, message) => { if (!ok) errors.push(message); };
const read = async (rel) => (await fs.readFile(path.join(root, rel), 'utf8')).replace(/\r\n/g, '\n');

const auto = automaticCandidateSlugs;
for (const slug of auto) need(Boolean(automaticCandidateConfig(slug)), `${slug} must have an automatic candidate config`);
const packageEntries = await fs.readdir(path.join(root, 'packages'), { withFileTypes: true });
const manifestAuto = [];
for (const entry of packageEntries) {
  if (!entry.isDirectory()) continue;
  const pkg = await readJson(path.join(root, 'packages', entry.name, 'package.json'));
  if (pkg.tracker?.candidateMode === 'auto') manifestAuto.push(entry.name);
}
need(
  JSON.stringify([...auto].sort()) === JSON.stringify(manifestAuto.sort()),
  `automatic candidate configs must exactly match candidateMode=auto manifests: config=${[...auto].sort().join(',')} manifests=${manifestAuto.join(',')}`
);

const ghost = await readJson(path.join(root, 'packages', 'ghostscript', 'package.json'));
const qpdf = await readJson(path.join(root, 'packages', 'qpdf', 'package.json'));
const zstd = await readJson(path.join(root, 'packages', 'zstd', 'package.json'));
need(ghost.tracker?.candidateMode === 'auto', 'Ghostscript must be candidateMode=auto');
need(ghost.tracker?.candidateSource?.repository === 'ArtifexSoftware/ghostpdl', 'Ghostscript candidate source repository must be ArtifexSoftware/ghostpdl');
need(ghost.tracker?.candidateSource?.refTemplate === 'gs{version}', 'Ghostscript candidate source ref must be gs{version}');
need(ghost.tracker?.candidateSource?.releaseTagTemplate === 'gs{versionCompact}', 'Ghostscript candidate release tag must be gs{versionCompact}');
need(ghost.tracker?.candidateSource?.assetNameTemplate === 'ghostscript-{version}.tar.xz', 'Ghostscript candidate source archive must be ghostscript-{version}.tar.xz');
need(ghost.tracker?.candidateSource?.digestAlgorithm === 'sha256', 'Ghostscript candidate source digest must be SHA-256');
need(!(ghost.notes || []).some((note) => note.includes('Automatic upstream candidate substitution is intentionally disabled for Ghostscript')), 'Ghostscript notes must not claim automatic candidates are disabled');
need(qpdf.tracker?.candidateMode === 'auto', 'QPDF must be candidateMode=auto');
need(JSON.stringify(qpdf.tracker?.candidateProfiles) === JSON.stringify(['browser-full']), 'QPDF automatic candidate must test browser-full');
need(qpdf.tracker?.candidateSource?.repository === 'qpdf/qpdf', 'QPDF candidate source repository must be qpdf/qpdf');
need(qpdf.tracker?.candidateSource?.refTemplate === 'v{version}' && qpdf.tracker?.candidateSource?.releaseTagTemplate === 'v{version}', 'QPDF candidate refs must follow v{version}');
need(qpdf.tracker?.candidateSource?.assetNameTemplate === 'qpdf-{version}.tar.gz', 'QPDF candidate source archive must be qpdf-{version}.tar.gz');
need(qpdf.tracker?.candidateSource?.digestAlgorithm === 'sha256', 'QPDF candidate source digest must be SHA-256');
const qpdfConfig = automaticCandidateConfig('qpdf');
need(qpdfConfig?.extraEnv?.version === 'QPDF_VERSION', 'QPDF candidate config must update QPDF_VERSION');
need(qpdfConfig?.extraEnv?.['source-url'] === 'QPDF_SOURCE_URL', 'QPDF candidate config must update QPDF_SOURCE_URL');
need(qpdfConfig?.extraEnv?.['source-sha256'] === 'QPDF_SOURCE_SHA256', 'QPDF candidate config must update QPDF_SOURCE_SHA256');
need(zstd.tracker?.candidateMode === 'auto', 'Zstandard must be candidateMode=auto');
need(JSON.stringify(zstd.tracker?.candidateProfiles) === JSON.stringify(['browser-core', 'browser-full']), 'Zstandard automatic candidate must test both profiles');
need(zstd.npm?.source?.releaseTag === 'zstd-v0.3.0' && zstd.npm?.source?.upstreamVersion === '1.5.7' &&
  zstd.npm?.source?.commit === 'f8745da6ff1ad1e7bab384bd1f9d742439278e99', 'Zstandard npm source identity must remain separately pinned');
const ghostOfficialArchive = `Ghostscript bundled third-party source set from the official ${ghost.upstream.version} release archive`;
need((ghost.profiles || []).some((profile) => (profile.externalLibraries || []).includes(ghostOfficialArchive)), 'Ghostscript external library metadata must follow the reviewed upstream version');
need((ghost.notes || []).some((note) => note.startsWith(`Official Ghostscript ${ghost.upstream.version} release source archive is pinned by SHA-256`)), 'Ghostscript official source archive note must follow the reviewed upstream version');

const libvips = await readJson(path.join(root, 'packages', 'libvips', 'package.json'));
need(libvips.tracker?.candidateMode === 'auto', 'libvips must use automatic adapter-bundle candidates');
need(JSON.stringify(libvips.tracker?.candidateProfiles) === JSON.stringify(['browser-core', 'browser-full']), 'libvips automatic candidate must test both browser profiles');
const libvipsConfig = automaticCandidateConfig('libvips');
for (const [argKey, envKey] of Object.entries({
  'emsdk-version': 'EMSDK_VERSION',
  'emscripten-ref': 'EMSCRIPTEN_REF',
  'emscripten-commit': 'EMSCRIPTEN_COMMIT',
  'wasm-vips-commit': 'WASM_VIPS_COMMIT',
  'wasm-vips-version': 'WASM_VIPS_VERSION',
  'libvips-patch-commit': 'WASM_VIPS_LIBVIPS_PATCH_COMMIT',
  'emscripten-patch-commit': 'WASM_VIPS_EMSCRIPTEN_PATCH_COMMIT'
})) need(libvipsConfig?.extraEnv?.[argKey] === envKey, `libvips candidate config must carry ${envKey}`);
const libvipsResolver = await read('scripts/libvips-adapter.mjs');
for (const marker of ['wasm-vips/commits/master', 'wasm-vips-$VERSION_VIPS.patch', 'libvipsPatchCommit', 'emscriptenPatchCommit', 'ready: false']) {
  need(libvipsResolver.includes(marker), `libvips adapter resolver contract missing: ${marker}`);
}

const config = automaticCandidateConfig('ghostscript');
need(config?.extraEnv?.version === 'GHOSTSCRIPT_VERSION', 'Ghostscript candidate config must update GHOSTSCRIPT_VERSION');
need(config?.extraEnv?.['release-tag'] === 'GHOSTSCRIPT_RELEASE_TAG', 'Ghostscript candidate config must update GHOSTSCRIPT_RELEASE_TAG');
need(config?.extraEnv?.['source-url'] === 'GHOSTSCRIPT_SOURCE_URL', 'Ghostscript candidate config must update GHOSTSCRIPT_SOURCE_URL');
need(config?.extraEnv?.['source-sha256'] === 'GHOSTSCRIPT_SOURCE_SHA256', 'Ghostscript candidate config must update GHOSTSCRIPT_SOURCE_SHA256');

const watcher = await read('scripts/check-upstream.mjs');
for (const marker of ['tracker.candidateSource', 'asset.digest', 'sourceCommit.sha', 'sourceSha256', 'browser_download_url']) {
  need(watcher.includes(marker), `upstream watcher must include ${marker}`);
}
const watcherWorkflow = await read('.github/workflows/check-upstream.yml');
for (const marker of [
  'candidate.source.releaseTag',
  'candidate.source.sourceUrl',
  'candidate.source.sourceSha256',
  '-f source_sha256="$source_sha256"',
  'existing_issue="$issue"',
  'gh issue edit "$issue"',
  'candidate_activity="$(gh issue view',
  'Candidate workflow dispatched by upstream watcher',
  'Candidate workflow (dispatched by upstream watcher|finished)|Review-only promotion PR:',
  'candidate.adapter.adapterCommit',
  'adapter_ready',
  'Immutable adapter candidate workflow dispatched by upstream watcher'
]) {
  need(watcherWorkflow.includes(marker), `upstream watcher workflow must preserve/reuse existing issues safely: ${marker}`);
}
need(!watcherWorkflow.includes('echo "[skip] existing issue #${issue}: ${title}"\n              continue'), 'upstream watcher must not skip an existing issue before checking candidate activity');

const candidate = await read('scripts/prepare-candidate.mjs');
need(candidate.includes('config.extraEnv'), 'candidate preparer must support extraEnv pins');
need(candidate.includes('--source-sha256') || candidate.includes('source-sha256'), 'candidate preparer must validate source SHA-256');
const metadataGenerator = await read('scripts/generate-build-metadata.mjs');
need(metadataGenerator.includes('builtUpstreamVersion = manifest.upstream?.version') &&
  metadataGenerator.includes('builtUpstreamRef = manifest.upstream?.ref') &&
  metadataGenerator.includes('builtBuilderVersion = manifest.build?.builderVersion'),
  'candidate provenance/SBOM must describe the actual manifest build identity rather than the previously reviewed package pin');

const promotion = await read('scripts/prepare-promotion.mjs');
need(promotion.includes('config.extraEnv'), 'promotion preparer must support extraEnv pins');
need(promotion.includes('Promotion extra pin verification failed'), 'promotion preparer must verify promoted extra pins');
need(promotion.includes('README npm version'), 'promotion preparer must update README npm distribution versions');
need(promotion.includes('config.keepNpmPinned') && promotion.includes('site/zstd-playground/release-status.json'),
  'Zstandard promotion must keep npm source/version pinned and reset Playground to unpublished for the new reviewed package tag');
need(promotion.includes('note.includes("@wasm-zoo/zstd") ? note : rewrite(note)'),
  'Zstandard promotion must not rewrite historical published npm source notes to the new package upstream version');
need(promotion.includes('docs/NPM_DISTRIBUTION.md') && promotion.includes('npm distribution release tag'), 'promotion preparer must update npm distribution documentation');
need(promotion.includes('values.slug === "ghostscript"') && promotion.includes('profile.externalLibraries') && promotion.includes('note.startsWith(`Official Ghostscript ${oldVersion} release source archive is pinned by SHA-256`)'), 'Ghostscript promotion must refresh current-version source-archive metadata');

const verifyWorkflow = await read('.github/workflows/verify.yml');
need(verifyWorkflow.includes('npm run promotion:rehearse'), 'Verify catalog must run the shared automatic promotion rehearsal');
need(!verifyWorkflow.includes('Rehearse future Zstandard candidate and review-only promotion'), 'Verify catalog must not retain the legacy Zstandard-only rehearsal');
const rehearsal = await read('scripts/rehearse-upstream-promotions.mjs');
for (const marker of ['automaticCandidateSlugs', 'git", ["worktree", "add"', 'config.keepNpmPinned', 'including libvips adapter-bundle promotion']) {
  need(rehearsal.includes(marker), `shared promotion rehearsal contract missing: ${marker}`);
}

const siteIndex = await read('site/index.html');
const siteApp = await read('site/app.js');
for (const marker of ['id="automation"', 'id="automation-contract-body"', 'Automation Contract', 'not a live operations monitor']) {
  need(siteIndex.includes(marker), `public automation contract surface missing: ${marker}`);
}
for (const marker of ['pkg.tracker?.candidateMode', 'pkg.tracker?.candidateProfiles', "mode === 'auto'", "mode === 'adapter-gated'", 'Review-only PR', 'Adapter review first']) {
  need(siteApp.includes(marker), `public automation contract renderer missing: ${marker}`);
}

const workflow = await read('.github/workflows/upstream-candidate.yml');
for (const marker of [
  'options: [ffmpeg, libarchive, imagemagick, ghostscript, libvips, jq, qpdf, zstd]',
  "ghostscript:\n    if: inputs.slug == 'ghostscript'",
  '--source-sha256 "${{ inputs.source_sha256 }}"',
  "ghostscript) result='${{ needs.ghostscript.result }}' ;;",
  'ghostscript) node builders/ghostscript/scripts/check-repository.mjs ;;',
  "libvips:\n    if: inputs.slug == 'libvips'",
  'adapter_bundle:',
  'ADAPTER_BUNDLE',
  '--wasm-vips-commit "$(jq -r',
  '--libvips-patch-commit "$(jq -r',
  "libvips) result='${{ needs.libvips.result }}' ;;",
  'libvips) node builders/libvips/scripts/check-repository.mjs ;;',
  "qpdf:\n    if: inputs.slug == 'qpdf'",
  "qpdf) result='${{ needs.qpdf.result }}' ;;",
  'qpdf) node builders/qpdf/scripts/check-repository.mjs ;;',
  "zstd:\n    if: inputs.slug == 'zstd'",
  "profile: [browser-core, browser-full]",
  "ZSTD_NATIVE_INTEROP: ${{ matrix.profile == 'browser-full' && 'required' || '' }}",
  "zstd) result='${{ needs.zstd.result }}' ;;",
  'zstd) node builders/zstd/scripts/check-repository.mjs ;;'
]) need(workflow.includes(marker), `candidate workflow contract missing: ${marker}`);
need((workflow.match(/^      [a-z0-9_]+:\n        description:/gm) || []).length <= 10, 'candidate workflow_dispatch must stay within GitHub\'s 10-input limit');
need(workflow.includes("  promotion-pr:") && workflow.includes("    if: ${{ always() && needs.report.outputs.result == 'success' }}") && workflow.includes("    needs: [report]"), "promotion PR job must use always() so skipped non-selected candidate jobs cannot suppress a successful promotion");

const env = await read('builders/ghostscript/versions.env');
const pins = Object.fromEntries(env.split(/\r?\n/).filter((line) => /^[A-Z0-9_]+=/.test(line)).map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
need(/^\d+\.\d+\.\d+$/.test(pins.GHOSTSCRIPT_VERSION || ''), 'reviewed Ghostscript version must be x.y.z');
need(pins.GHOSTSCRIPT_REF === `gs${pins.GHOSTSCRIPT_VERSION}`, 'reviewed Ghostscript source ref must match version');
need(/^[0-9a-f]{40}$/i.test(pins.GHOSTSCRIPT_COMMIT || ''), 'reviewed Ghostscript commit must be exact');
need(/^[0-9a-f]{64}$/i.test(pins.GHOSTSCRIPT_SOURCE_SHA256 || ''), 'reviewed Ghostscript source digest must be exact SHA-256');

const fetchScript = await read('builders/ghostscript/scripts/fetch-ghostscript.sh');
need(fetchScript.includes('sha256sum -c'), 'Ghostscript source fetch must verify SHA-256');
need(fetchScript.includes('GS_VERSION_MAJOR=${gs_major}') && fetchScript.includes('GS_VERSION_MINOR=${gs_minor}') && fetchScript.includes('GS_VERSION_PATCH=${gs_patch}'), 'Ghostscript source fetch must verify version.mak dynamically');
const smoke = await read('builders/ghostscript/tests/smoke-test.html');
need(smoke.includes('manifest.json') && smoke.includes('expectedVersion'), 'Ghostscript smoke must derive the expected version from manifest.json');

const zstdReleaseWorkflow = await read('.github/workflows/release-zstd.yml');
need(zstdReleaseWorkflow.includes('source builders/zstd/versions.env') &&
  zstdReleaseWorkflow.includes('Zstandard ${version}') &&
  zstdReleaseWorkflow.includes('${ZSTD_COMMIT}') &&
  !zstdReleaseWorkflow.includes('Zstandard 1.5.7 · browser-core'),
  'Zstandard release title/notes must derive from reviewed versions.env rather than historical hard-coded pins');

const docs = await read('docs/AUTOMATED_PROMOTIONS.md');
need(docs.includes('- Ghostscript') && docs.includes('GitHub\'s published SHA-256 asset digest'), 'automation docs must describe Ghostscript digest-pinned auto promotion');
need(docs.includes('- QPDF') && docs.includes('QPDF is also source-archive-backed') && docs.includes('qpdf-<version>.tar.gz'), 'automation docs must describe QPDF digest-pinned auto promotion');
need(docs.includes('- Zstandard') && docs.includes('bidirectional native zstd interoperability'), 'automation docs must describe Zstandard native-interoperability candidate gate');
need(docs.includes('- libvips') && docs.includes('fail-closed adapter bundle resolver'), 'automation docs must describe libvips immutable adapter-bundle candidates');

if (errors.length) {
  console.error(`[NG] ${errors.length} upstream automation contract check(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log(`[OK] upstream promotion automation contract passed: ${auto.join('/')} auto with libvips fail-closed adapter resolution`);
