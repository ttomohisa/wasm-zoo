const grid = document.querySelector('#package-grid');
const dialog = document.querySelector('#package-dialog');
const dialogContent = document.querySelector('#dialog-content');
const closeButton = document.querySelector('#dialog-close');
const gapBody = document.querySelector('#version-gap-body');
const matrixTabs = document.querySelector('#matrix-tabs');
const matrixHost = document.querySelector('#feature-matrix');
let catalog;
let upstreamStatus = { generatedAt: null, packages: [] };
let filter = 'all';
let matrixSlug = null;

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const displayVersion = (value, fallback = 'Not pinned') => value ? esc(value) : fallback;
const statusLabel = (status) => ({available:'Available',experimental:'Experimental',planned:'Planned',paused:'Paused'}[status] || status);
const upstreamFor = (slug) => upstreamStatus.packages?.find((item) => item.slug === slug);
const profileLabel = (pkg, id) => pkg.profiles?.find((profile) => profile.id === id)?.label || id;

const matrixStates = {
  included: { symbol: '✓', label: 'Included' },
  excluded: { symbol: '−', label: 'Intentionally excluded' },
  na: { symbol: 'N/A', label: 'Browser-inapplicable' },
  optional: { symbol: '◐', label: 'Optional' },
  platform: { symbol: '◐', label: 'Platform-dependent' },
  unknown: { symbol: '?', label: 'Unknown / not tested' }
};
function stateName(value) {
  if (value === true) return 'included';
  if (value === false) return 'excluded';
  return matrixStates[value] ? value : 'unknown';
}
function stateCell(value) {
  const state = stateName(value);
  const meta = matrixStates[state];
  return `<span class="matrix-state ${state}" title="${esc(meta.label)}" aria-label="${esc(meta.label)}">${meta.symbol}</span>`;
}

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
};
const releaseUrl = (pkg, asset) => pkg.release?.downloadBase && asset ? `${pkg.release.downloadBase}${encodeURIComponent(asset)}` : null;

function profileSize(profile) {
  const manifest = profile._manifest;
  if (!manifest) return profile.size || null;
  const entries = Object.entries(manifest.files || {});
  const wasmBytes = entries.filter(([name]) => name.endsWith('.wasm') && !name.endsWith('.wasm.gz')).reduce((sum, [, file]) => sum + (Number(file?.bytes) || 0), 0);
  const gzipBytes = entries.filter(([name]) => name.endsWith('.wasm.gz')).reduce((sum, [, file]) => sum + (Number(file?.bytes) || 0), 0);
  const wasm = wasmBytes ? formatBytes(wasmBytes) : null;
  const gzip = gzipBytes ? formatBytes(gzipBytes) : null;
  return wasm && gzip ? `${wasm} · gzip ${gzip}` : wasm || gzip || profile.size || null;
}

function freshnessBadge(pkg) {
  const status = upstreamFor(pkg.slug);
  if (!status || status.status === 'error') return `<span class="gap-badge unknown">Not verified</span>`;
  if (!pkg.upstream.version) return `<span class="gap-badge planned">Tracking</span>`;
  if (status.updateAvailable) return `<span class="gap-badge behind">${esc(status.gap?.label || 'Update available')}</span>`;
  return `<span class="gap-badge current">Current</span>`;
}

function card(pkg) {
  const zooVersion = pkg.status === 'available' ? pkg.upstream.version : null;
  const profiles = pkg.profiles.length
    ? pkg.profiles.map((profile) => `<span class="profile-pill"><span>${esc(profile.label)}</span>${profile._manifest ? `<small>${esc(profileSize(profile) || '')}</small>` : ''}</span>`).join('')
    : `<span class="profile-pill">Build profile not published yet</span>`;
  const release = pkg.release?.tag ? `<span class="release-chip">${esc(pkg.release.tag)}</span>` : '';
  return `<article class="package-card" data-status="${esc(pkg.status)}">
    <div class="package-top"><div class="package-title"><div class="package-icon">${esc(pkg.name.slice(0,2).toUpperCase())}</div><div><h3>${esc(pkg.name)}</h3><div class="category">${esc(pkg.category)}</div></div></div><span class="status ${esc(pkg.status)}">${statusLabel(pkg.status)}</span></div>
    <p class="package-summary">${esc(pkg.summary)}</p>
    <div class="version-table"><span>Upstream pinned</span><strong>${displayVersion(pkg.upstream.version)}</strong><span>WASM Zoo</span><strong>${displayVersion(zooVersion, pkg.status === 'planned' ? 'Planned' : '—')}</strong><span>Freshness</span><strong>${freshnessBadge(pkg)}</strong></div>
    <div class="profile-pills">${profiles}</div>
    <div class="card-footer"><small>${release || (pkg.zoo.reproducible ? 'Reproducible build' : 'Tracking only')}</small><button class="details-button" data-open="${esc(pkg.slug)}">Details</button></div>
  </article>`;
}

function render() {
  const packages = catalog.packages.filter((pkg) => filter === 'all' || pkg.status === filter);
  grid.innerHTML = packages.length ? packages.map(card).join('') : `<div class="empty">No packages in this view.</div>`;
  grid.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => openPackage(button.dataset.open)));
}

function versionText(pkg, status) {
  if (status?.status === 'ok') return `<a href="${esc(status.url)}" rel="noreferrer"><strong>${esc(status.latest)}</strong><small>${status.latestReleased ? esc(new Date(status.latestReleased).toISOString().slice(0,10)) : ''}</small></a>`;
  return `<strong>${displayVersion(pkg.upstream.version, 'Unknown')}</strong><small>snapshot unavailable</small>`;
}
function referenceText(pkg) {
  const ref = pkg.referenceWasm;
  if (!ref) return `<span class="reference-empty">—</span>`;
  return `<a href="${esc(ref.repository)}" rel="noreferrer"><strong>${esc(ref.name)} · ${esc(ref.packageVersion)}</strong><small>${ref.upstreamVersion ? `upstream ${esc(ref.upstreamVersion)}` : 'upstream version not recorded'}</small></a>`;
}
function verifiedText() {
  if (!upstreamStatus.generatedAt) return 'Unavailable';
  const date = new Date(upstreamStatus.generatedAt);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toISOString().slice(0, 10);
}
function renderVersionGap() {
  gapBody.innerHTML = catalog.packages.map((pkg) => {
    const status = upstreamFor(pkg.slug);
    const zoo = pkg.status === 'available' ? `<strong>${displayVersion(pkg.upstream.version)}</strong><small>${esc(pkg.zoo.builderVersion)}</small>` : `<strong>Planned</strong><small>no published binary</small>`;
    let gap = `<span class="gap-badge unknown">Unknown</span>`;
    if (status?.status === 'ok') {
      if (!pkg.upstream.version) gap = `<span class="gap-badge planned">Tracking only</span>`;
      else if (status.updateAvailable) gap = `<span class="gap-badge behind">${esc(status.gap?.label || 'Update available')}</span>${status.lagDays ? `<small>${esc(status.lagDays)} release-day gap</small>` : ''}`;
      else gap = `<span class="gap-badge current">Current</span><small>0 versions behind</small>`;
    } else if (status?.error) gap = `<span class="gap-badge unknown">Watcher error</span><small>${esc(status.error)}</small>`;
    return `<tr><td><button class="gap-project" data-open="${esc(pkg.slug)}"><strong>${esc(pkg.name)}</strong><small>${esc(statusLabel(pkg.status))}</small></button></td><td class="version-stack">${versionText(pkg, status)}</td><td class="version-stack">${zoo}</td><td class="version-stack">${referenceText(pkg)}</td><td class="gap-cell">${gap}</td><td><code>${esc(verifiedText())}</code></td></tr>`;
  }).join('');
  gapBody.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => openPackage(button.dataset.open)));
  const available = catalog.packages.filter((pkg) => pkg.status === 'available');
  const current = available.filter((pkg) => { const item = upstreamFor(pkg.slug); return item?.status === 'ok' && !item.updateAvailable; }).length;
  const behind = available.filter((pkg) => upstreamFor(pkg.slug)?.updateAvailable).length;
  document.querySelector('#stat-current').textContent = `${current}/${available.length}`;
  document.querySelector('#freshness-summary').textContent = behind ? `${behind} published package${behind === 1 ? '' : 's'} currently need an upstream review.` : `${current} published packages are on their latest tracked upstream release.`;
  const heroState = document.querySelector('#hero-watcher-state');
  if (heroState) { heroState.textContent = behind ? `${behind} update${behind === 1 ? '' : 's'} ↑` : '✓ current'; heroState.classList.toggle('warn', behind > 0); }
}

function renderFeatureMatrix() {
  const packages = catalog.packages.filter((pkg) => pkg.status === 'available' && pkg.capabilityMatrix?.length);
  if (!packages.length) { matrixTabs.innerHTML = ''; matrixHost.innerHTML = `<div class="empty">No feature matrices published yet.</div>`; return; }
  if (!matrixSlug || !packages.some((pkg) => pkg.slug === matrixSlug)) matrixSlug = packages[0].slug;
  matrixTabs.innerHTML = packages.map((pkg) => `<button class="matrix-tab ${pkg.slug === matrixSlug ? 'active' : ''}" type="button" role="tab" aria-selected="${pkg.slug === matrixSlug}" data-matrix="${esc(pkg.slug)}">${esc(pkg.name)}</button>`).join('');
  matrixTabs.querySelectorAll('[data-matrix]').forEach((button) => button.addEventListener('click', () => { matrixSlug = button.dataset.matrix; renderFeatureMatrix(); }));
  const pkg = packages.find((item) => item.slug === matrixSlug);
  const headers = (pkg.profiles || []).map((profile) => `<th>${esc(profile.label)}</th>`).join('');
  const rows = pkg.capabilityMatrix.map((row) => `<tr><td><strong>${esc(row.feature)}</strong></td><td>${stateCell(row.native)}</td>${pkg.profiles.map((profile) => `<td>${stateCell(row.profiles?.[profile.id])}</td>`).join('')}<td class="matrix-note">${esc(row.note || '')}</td></tr>`).join('');
  matrixHost.innerHTML = `<div class="matrix-title"><div><span class="eyebrow">${esc(pkg.name)}</span><h3>Native → browser WASM</h3></div><button type="button" data-open-matrix-package="${esc(pkg.slug)}">Package details</button></div><div class="table-scroll"><table class="comparison capability feature-table"><thead><tr><th>Capability</th><th>Native</th>${headers}<th>Why</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  matrixHost.querySelector('[data-open-matrix-package]')?.addEventListener('click', () => openPackage(pkg.slug));
}

function boolPill(label, value) { return `<span>${esc(label)}: ${value ? 'yes' : 'no'}</span>`; }
function releaseButtons(pkg, profile) {
  if (!pkg.release) return '';
  const asset = releaseUrl(pkg, profile.releaseAsset);
  const playgroundPath = profile.playgroundPath;
  const playground = profile.playground && playgroundPath ? `<a class="detail-action secondary" href="${esc(playgroundPath)}${playgroundPath.includes('?') ? '&' : '?'}profile=${encodeURIComponent(profile.id)}">Try in Playground</a>` : '';
  return `<div class="profile-actions">${asset ? `<a class="detail-action" href="${esc(asset)}">Download ZIP</a>` : ''}${playground}</div>`;
}
function packageQuickActions(pkg) {
  const profile = (pkg.profiles || []).find((item) => item.playground && item.playgroundPath) || (pkg.profiles || [])[0];
  const playgroundPath = profile?.playgroundPath;
  const playground = profile?.playground && playgroundPath ? `<a class="package-quick-action primary" href="${esc(playgroundPath)}${playgroundPath.includes('?') ? '&' : '?'}profile=${encodeURIComponent(profile.id)}"><span>Try in Playground</span><small>Run the published core</small></a>` : '';
  const integration = pkg.integration ? `<button class="package-quick-action" type="button" data-jump-section="integration"><span>Use in your app</span><small>Copy the minimal example</small></button>` : '';
  const download = (pkg.profiles || []).some((item) => item.releaseAsset) ? `<button class="package-quick-action" type="button" data-jump-section="builds"><span>Download</span><small>Choose a published build</small></button>` : '';
  return playground || integration || download ? `<div class="package-quick-actions" aria-label="Package actions">${playground}${integration}${download}</div>` : '';
}
function integrationSection(pkg) {
  const integration = pkg.integration;
  if (!integration) return '';
  const files = Array.isArray(integration.files) && integration.files.length ? `<div class="integration-files"><span>Host these files</span><div>${integration.files.map((file) => `<code>${esc(file)}</code>`).join('')}</div></div>` : '';
  const notes = Array.isArray(integration.notes) && integration.notes.length ? `<ul class="integration-notes">${integration.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>` : '';
  return `<div class="detail-section integration-section" data-detail-section="integration"><div class="integration-title"><div><span class="eyebrow">Integration</span><h3>Use in your app</h3></div><span class="integration-badge">Copy · self-host · run</span></div><p class="integration-summary">${esc(integration.summary)}</p>${files}<div class="integration-code"><div class="integration-code-head"><span>Minimal example</span><button type="button" data-copy-code>Copy</button></div><pre><code>${esc(integration.example)}</code></pre></div>${notes}</div>`;
}
function wireIntegrationActions() {
  dialogContent.querySelectorAll('[data-jump-section]').forEach((button) => button.addEventListener('click', () => {
    const target = dialogContent.querySelector(`[data-detail-section="${button.dataset.jumpSection}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.add('detail-section-highlight');
    setTimeout(() => target.classList.remove('detail-section-highlight'), 1200);
  }));
  dialogContent.querySelectorAll('[data-copy-code]').forEach((button) => button.addEventListener('click', async () => {
    const code = button.closest('.integration-code')?.querySelector('code')?.textContent || '';
    if (!code) return;
    const original = button.textContent;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else { const textarea = document.createElement('textarea'); textarea.value = code; textarea.setAttribute('readonly', ''); textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.append(textarea); textarea.select(); document.execCommand('copy'); textarea.remove(); }
      button.textContent = 'Copied'; button.dataset.copied = 'true';
    } catch { button.textContent = 'Select code'; }
    setTimeout(() => { button.textContent = original; delete button.dataset.copied; }, 1600);
  }));
}

function detailMatrix(pkg) {
  if (!pkg.capabilityMatrix?.length) return '';
  const headers = pkg.profiles.map((profile) => `<th>${esc(profile.label)}</th>`).join('');
  const rows = pkg.capabilityMatrix.map((row) => `<tr><td><strong>${esc(row.feature)}</strong></td><td>${stateCell(row.native)}</td>${pkg.profiles.map((profile) => `<td>${stateCell(row.profiles?.[profile.id])}</td>`).join('')}<td>${esc(row.note || '')}</td></tr>`).join('');
  return `<div class="detail-section"><h3>Native → WASM capability gap</h3><div class="table-scroll"><table class="comparison capability"><thead><tr><th>Capability</th><th>Native</th>${headers}<th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function referenceSection(pkg) {
  const status = upstreamFor(pkg.slug);
  const ref = pkg.referenceWasm;
  return `<div class="detail-section"><h3>Version freshness</h3><table class="comparison"><thead><tr><th>Distribution</th><th>Version</th><th>Notes</th></tr></thead><tbody><tr><td><strong>Upstream latest</strong></td><td><code>${esc(status?.latest || pkg.upstream.version || 'Unknown')}</code></td><td>${status?.updateAvailable ? `Zoo review required; ${esc(status.gap?.label || 'update available')}.` : pkg.upstream.version ? 'Zoo pin is current in the latest watcher snapshot.' : 'Tracked before the first Zoo build is pinned.'}</td></tr><tr><td><strong>WASM Zoo</strong></td><td><code>${esc(pkg.status === 'available' ? pkg.upstream.version : 'Planned')}</code></td><td>${esc(pkg.zoo.buildModel || 'tracking only')}</td></tr>${ref ? `<tr><td><strong>${esc(ref.name)}</strong></td><td><code>${esc(ref.upstreamVersion || ref.packageVersion)}</code></td><td>Reference ${esc(ref.packageVersion)} · checked ${esc(ref.checkedAt)}. ${esc(ref.note)}</td></tr>` : ''}</tbody></table></div>`;
}
function openPackage(slug) {
  const pkg = catalog.packages.find((item) => item.slug === slug);
  if (!pkg) return;
  const matrix = detailMatrix(pkg);
  const profiles = pkg.profiles.length ? `<div class="detail-section" data-detail-section="builds"><h3>Published builds</h3>${pkg.profiles.map((profile) => `<div class="profile-detail"><div class="profile-detail-head"><div><h4>${esc(profile.label)}</h4><div>${esc(profile.output)}</div></div>${profileSize(profile) ? `<strong class="profile-size">${esc(profileSize(profile))}</strong>` : ''}</div><div class="profile-meta">${boolPill('threads', profile.threads)}${boolPill('SIMD', profile.simd)}${boolPill('SharedArrayBuffer', profile.sharedArrayBuffer)}${boolPill('Worker', profile.worker)}${boolPill('network', profile.network)}${boolPill('arbitrary CLI', profile.arbitraryCli)}</div><div class="feature-list">${profile.features.map((feature) => `<span>${esc(feature)}</span>`).join('')}</div><div class="feature-list"><span>license: ${esc(profile.binaryLicense)}</span><span>target: ${esc(profile.target)}</span></div>${releaseButtons(pkg, profile)}</div>`).join('')}</div>` : `<div class="detail-section"><h3>Build status</h3><p>This package is being tracked, but WASM Zoo does not publish a binary for it yet.</p></div>`;
  const quickActions = packageQuickActions(pkg);
  const integration = integrationSection(pkg);
  const notes = pkg.notes?.length ? `<div class="detail-section"><h3>Notes</h3><ul class="notes">${pkg.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></div>` : '';
  const release = pkg.release ? `<div class="detail-section release-links"><h3>Release</h3><div class="profile-actions"><a class="detail-action" href="${esc(pkg.release.page)}">Release ${esc(pkg.release.tag)}</a>${pkg.release.sourceAsset ? `<a class="detail-action secondary" href="${esc(releaseUrl(pkg, pkg.release.sourceAsset))}">Corresponding source</a>` : ''}${pkg.release.checksumsAsset ? `<a class="detail-action secondary" href="${esc(releaseUrl(pkg, pkg.release.checksumsAsset))}">SHA-256</a>` : ''}</div></div>` : '';
  dialogContent.innerHTML = `<div class="dialog-title"><span class="eyebrow">${esc(statusLabel(pkg.status))} · ${esc(pkg.category)}</span><h2>${esc(pkg.name)}</h2><p>${esc(pkg.summary)}</p></div>${quickActions}<div class="version-table"><span>Upstream pin</span><strong>${displayVersion(pkg.upstream.version)}</strong><span>Zoo builder</span><strong>${displayVersion(pkg.zoo.builderVersion, 'Not published')}</strong><span>Freshness</span><strong>${freshnessBadge(pkg)}</strong><span>Upstream license</span><strong>${esc(pkg.upstream.license)}</strong></div>${release}${referenceSection(pkg)}${matrix}${profiles}${integration}${notes}`;
  wireIntegrationActions();
  dialog.showModal();
}

async function enrichReleaseManifests() {
  const tasks = [];
  for (const pkg of catalog.packages) {
    if (pkg.status !== 'available' || !pkg.upstream.version) continue;
    for (const profile of pkg.profiles || []) {
      if (!profile.releaseAsset) continue;
      const url = `./assets/${encodeURIComponent(pkg.slug)}/${encodeURIComponent(pkg.upstream.version)}/${encodeURIComponent(profile.id)}/manifest.json`;
      tasks.push(fetch(url, { cache: 'no-store' }).then(async (response) => { if (!response.ok) return; const manifest = await response.json(); if (manifest.profile === profile.id && manifest.upstream?.version === pkg.upstream.version) profile._manifest = manifest; }).catch(() => {}));
    }
  }
  await Promise.all(tasks);
}

closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active')); button.classList.add('active'); filter = button.dataset.filter; render(); }));

try {
  const [catalogResponse, statusResponse] = await Promise.all([fetch('./catalog.json', { cache: 'no-store' }), fetch('./upstream-status.json', { cache: 'no-store' }).catch(() => null)]);
  if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`);
  catalog = await catalogResponse.json();
  if (statusResponse?.ok) upstreamStatus = await statusResponse.json();
  document.querySelector('#stat-packages').textContent = catalog.stats.packages;
  document.querySelector('#stat-available').textContent = catalog.stats.available;
  document.querySelector('#stat-profiles').textContent = catalog.stats.profiles;
  document.querySelector('#generated-at').textContent = `Catalog v${catalog.project.version}${upstreamStatus.generatedAt ? ` · upstream verified ${verifiedText()}` : ''}`;
  document.querySelector('#hero-zoo-version').textContent = catalog.project.version || '—';
  for (const slug of ['ffmpeg', 'libarchive', 'imagemagick', 'libvips']) {
    const item = catalog.packages.find((pkg) => pkg.slug === slug);
    if (!item) continue;
    const hero = document.querySelector(`#hero-${slug}-version`);
    const featuredVersion = document.querySelector(`#featured-${slug}-version`);
    const releaseLink = document.querySelector(`#featured-${slug}-release`);
    if (hero) hero.textContent = item.upstream.version || '—';
    if (featuredVersion) featuredVersion.textContent = item.upstream.version || 'current';
    if (releaseLink && item.release?.page) { releaseLink.href = item.release.page; releaseLink.textContent = item.release.tag; }
  }
  renderVersionGap();
  renderFeatureMatrix();
  await enrichReleaseManifests();
  render();
} catch (error) {
  grid.innerHTML = `<div class="empty">Catalog could not be loaded. Run <code>npm run build:site</code> and serve the <code>site</code> directory.</div>`;
  console.error(error);
}
