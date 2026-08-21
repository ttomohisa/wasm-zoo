import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPackages, root } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const packages = await loadPackages();
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY || 'ttomohisa/wasm-zoo';
const pagesBase = (process.env.WASM_ZOO_PAGES_BASE || `https://${repository.split('/')[0]}.github.io/${repository.split('/')[1]}`).replace(/\/$/, '');
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'wasm-zoo-release-health', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

async function githubJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}
async function resolveTagCommit(tag) {
  const ref = await githubJson(`https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`);
  if (ref.object?.type === 'commit') return ref.object.sha;
  if (ref.object?.type === 'tag') {
    const object = await githubJson(`https://api.github.com/repos/${repository}/git/tags/${ref.object.sha}`);
    return object.object?.sha || null;
  }
  return null;
}
async function workflowGate(slug, tag, sha) {
  try {
    const data = await githubJson(`https://api.github.com/repos/${repository}/actions/workflows/release-${slug}.yml/runs?event=push&per_page=50`);
    const run = (data.workflow_runs || []).find((item) => item.head_branch === tag || (sha && item.head_sha === sha));
    if (!run) return { state: 'unknown', label: 'No matching run', url: `https://github.com/${repository}/actions/workflows/release-${slug}.yml` };
    const passed = run.status === 'completed' && run.conclusion === 'success';
    return { state: passed ? 'ok' : run.status === 'completed' ? 'error' : 'pending', label: passed ? 'Passed' : run.conclusion || run.status, url: run.html_url, runId: run.id };
  } catch (error) {
    return { state: 'unknown', label: 'Workflow check unavailable', error: error.message };
  }
}
async function playgroundHealth(pkg) {
  const first = pkg.profiles?.find((profile) => profile.playground && profile.playgroundPath);
  if (!first) return { state: 'na', label: 'No playground' };
  const url = new URL(first.playgroundPath.replace(/^\.\//, ''), `${pagesBase}/`).href;
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'wasm-zoo-release-health' } });
    return { state: response.ok ? 'ok' : 'error', label: response.ok ? `HTTP ${response.status}` : `HTTP ${response.status}`, url };
  } catch (error) {
    return { state: 'unknown', label: 'Unavailable', url, error: error.message };
  }
}
async function freshnessFor(slug) {
  try {
    const status = JSON.parse(await fs.readFile(path.join(root, 'site', 'upstream-status.json'), 'utf8'));
    const item = status.packages?.find((row) => row.slug === slug);
    if (!item || item.status !== 'ok') return { state: 'unknown', label: 'Not verified' };
    return { state: item.updateAvailable ? 'warn' : 'ok', label: item.updateAvailable ? (item.gap?.label || 'Update available') : 'Current' };
  } catch {
    return { state: 'unknown', label: 'Not verified' };
  }
}
function releaseAssetContract(pkg) {
  const binary = (pkg.profiles || []).map((profile) => profile.releaseAsset).filter(Boolean);
  const classic = [...binary, pkg.release?.sourceAsset, pkg.release?.checksumsAsset].filter(Boolean);
  const supply = (pkg.profiles || []).flatMap((profile) => [
    `provenance-${profile.id}.json`,
    `sbom-${profile.id}.cdx.json`
  ]);
  return { binary, classic, supply };
}
function aggregate(item) {
  const critical = [item.buildGate.state, item.release.state, item.playground.state].filter((state) => state !== 'na');
  if (critical.includes('error')) return { state: 'error', label: 'Action required' };
  if (critical.includes('pending')) return { state: 'pending', label: 'In progress' };
  if (item.freshness.state === 'warn') return { state: 'warn', label: 'Upstream review' };
  if (critical.includes('unknown')) return { state: 'warn', label: 'Partially verified' };
  return { state: 'ok', label: 'Healthy' };
}

const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), repository, pagesBase, packages: [] };
for (const pkg of packages.filter((item) => item.status === 'available' && item.release?.tag)) {
  const item = { slug: pkg.slug, name: pkg.name, tag: pkg.release.tag };
  const contract = releaseAssetContract(pkg);
  try {
    const release = await githubJson(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(pkg.release.tag)}`);
    const assets = new Set((release.assets || []).map((asset) => asset.name));
    const missingClassic = contract.classic.filter((name) => !assets.has(name));
    const missingSupply = contract.supply.filter((name) => !assets.has(name));
    item.release = {
      state: missingClassic.length ? 'error' : 'ok',
      label: missingClassic.length ? `${missingClassic.length} required asset(s) missing` : 'Assets present',
      url: release.html_url,
      publishedAt: release.published_at,
      assetCount: assets.size,
      missingAssets: missingClassic
    };
    item.supplyChain = {
      state: missingSupply.length ? 'pending' : 'ok',
      label: missingSupply.length ? 'Publishes on next metadata-enabled package release' : 'Provenance + SBOM published',
      expected: contract.supply,
      missing: missingSupply
    };
    const sha = await resolveTagCommit(pkg.release.tag).catch(() => null);
    item.buildGate = await workflowGate(pkg.slug, pkg.release.tag, sha);
  } catch (error) {
    item.release = { state: 'error', label: 'Release unavailable', error: error.message, url: pkg.release.page };
    item.supplyChain = { state: 'unknown', label: 'Not inspectable', expected: contract.supply, missing: contract.supply };
    item.buildGate = { state: 'unknown', label: 'Not inspectable' };
  }
  item.playground = await playgroundHealth(pkg);
  item.freshness = await freshnessFor(pkg.slug);
  item.overall = aggregate(item);
  report.packages.push(item);
}
report.summary = {
  healthy: report.packages.filter((item) => item.overall.state === 'ok').length,
  warning: report.packages.filter((item) => item.overall.state === 'warn').length,
  error: report.packages.filter((item) => item.overall.state === 'error').length,
  supplyChainPublished: report.packages.filter((item) => item.supplyChain.state === 'ok').length,
  total: report.packages.length
};

if (args.has('--write-site')) {
  const inspectable = report.packages.filter((item) => item.release.state !== 'error' || !String(item.release.error || '').match(/^(401|403|5\d\d)\b/)).length;
  if (inspectable === 0 && report.packages.length) console.warn('[WARN] all release checks were unavailable; preserving the last good Release Health snapshot');
  else await fs.writeFile(path.join(root, 'site', 'release-health.json'), `${JSON.stringify(report, null, 2)}\n`);
}
if (args.has('--markdown')) {
  console.log('| Project | Build gate | Release | Playground | Freshness | Provenance + SBOM | Overall |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const item of report.packages) console.log(`| ${item.name} | ${item.buildGate.label} | ${item.release.label} | ${item.playground.label} | ${item.freshness.label} | ${item.supplyChain.label} | ${item.overall.label} |`);
} else if (args.has('--json')) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  console.log(`WASM Zoo release health · ${report.summary.healthy}/${report.summary.total} healthy`);
  for (const item of report.packages) console.log(`${item.overall.state === 'ok' ? '✓' : item.overall.state === 'error' ? '!' : '·'} ${item.name}: ${item.overall.label}`);
}
