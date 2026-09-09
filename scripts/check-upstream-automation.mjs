import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { automaticCandidateConfig } from './upstream-config.mjs';
import { readJson, root } from './lib.mjs';

const errors = [];
const need = (ok, message) => { if (!ok) errors.push(message); };
const read = async (rel) => (await fs.readFile(path.join(root, rel), 'utf8')).replace(/\r\n/g, '\n');

const auto = ['ffmpeg', 'libarchive', 'imagemagick', 'ghostscript', 'jq'];
for (const slug of auto) need(Boolean(automaticCandidateConfig(slug)), `${slug} must have an automatic candidate config`);

const ghost = await readJson(path.join(root, 'packages', 'ghostscript', 'package.json'));
need(ghost.tracker?.candidateMode === 'auto', 'Ghostscript must be candidateMode=auto');
need(ghost.tracker?.candidateSource?.repository === 'ArtifexSoftware/ghostpdl', 'Ghostscript candidate source repository must be ArtifexSoftware/ghostpdl');
need(ghost.tracker?.candidateSource?.refTemplate === 'gs{version}', 'Ghostscript candidate source ref must be gs{version}');
need(ghost.tracker?.candidateSource?.releaseTagTemplate === 'gs{versionCompact}', 'Ghostscript candidate release tag must be gs{versionCompact}');
need(ghost.tracker?.candidateSource?.assetNameTemplate === 'ghostscript-{version}.tar.xz', 'Ghostscript candidate source archive must be ghostscript-{version}.tar.xz');
need(ghost.tracker?.candidateSource?.digestAlgorithm === 'sha256', 'Ghostscript candidate source digest must be SHA-256');
need(!(ghost.notes || []).some((note) => note.includes('Automatic upstream candidate substitution is intentionally disabled for Ghostscript')), 'Ghostscript notes must not claim automatic candidates are disabled');

const libvips = await readJson(path.join(root, 'packages', 'libvips', 'package.json'));
need(libvips.tracker?.candidateMode === 'adapter-gated', 'libvips must remain adapter-gated');

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
  'Candidate workflow (dispatched by upstream watcher|finished)|Review-only promotion PR:'
]) {
  need(watcherWorkflow.includes(marker), `upstream watcher workflow must preserve/reuse existing issues safely: ${marker}`);
}
need(!watcherWorkflow.includes('echo "[skip] existing issue #${issue}: ${title}"\n              continue'), 'upstream watcher must not skip an existing issue before checking candidate activity');

const candidate = await read('scripts/prepare-candidate.mjs');
need(candidate.includes('config.extraEnv'), 'candidate preparer must support extraEnv pins');
need(candidate.includes('--source-sha256') || candidate.includes('source-sha256'), 'candidate preparer must validate source SHA-256');
const promotion = await read('scripts/prepare-promotion.mjs');
need(promotion.includes('config.extraEnv'), 'promotion preparer must support extraEnv pins');
need(promotion.includes('Promotion extra pin verification failed'), 'promotion preparer must verify promoted extra pins');

const workflow = await read('.github/workflows/upstream-candidate.yml');
for (const marker of [
  'options: [ffmpeg, libarchive, imagemagick, ghostscript, libvips, jq]',
  "ghostscript:\n    if: inputs.slug == 'ghostscript'",
  '--source-sha256 "${{ inputs.source_sha256 }}"',
  "ghostscript) result='${{ needs.ghostscript.result }}' ;;",
  'ghostscript) node builders/ghostscript/scripts/check-repository.mjs ;;'
]) need(workflow.includes(marker), `candidate workflow missing Ghostscript contract: ${marker}`);

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

const docs = await read('docs/AUTOMATED_PROMOTIONS.md');
need(docs.includes('- Ghostscript') && docs.includes('GitHub\'s published SHA-256 asset digest'), 'automation docs must describe Ghostscript digest-pinned auto promotion');

if (errors.length) {
  console.error(`[NG] ${errors.length} upstream automation contract check(s)`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('[OK] upstream promotion automation contract passed: FFmpeg/libarchive/ImageMagick/Ghostscript/jq auto, libvips adapter-gated');
