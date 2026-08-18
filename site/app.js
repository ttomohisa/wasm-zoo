const grid = document.querySelector('#package-grid');
const dialog = document.querySelector('#package-dialog');
const dialogContent = document.querySelector('#dialog-content');
const closeButton = document.querySelector('#dialog-close');
let catalog;
let filter = 'all';

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const displayVersion = (value, fallback = 'Not pinned') => value ? esc(value) : fallback;
const statusLabel = (status) => ({available:'Available',experimental:'Experimental',planned:'Planned',paused:'Paused'}[status] || status);
const mark = (value) => value === true ? '✓' : value === false ? '—' : esc(value ?? '—');

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
  const wasm = formatBytes(manifest.files?.['ffmpeg-core.wasm']?.bytes);
  const gzip = formatBytes(manifest.files?.['ffmpeg-core.wasm.gz']?.bytes);
  return wasm && gzip ? `${wasm} · gzip ${gzip}` : wasm || gzip || profile.size || null;
}

function card(pkg) {
  const zooVersion = pkg.status === 'available' ? pkg.upstream.version : null;
  const profiles = pkg.profiles.length
    ? pkg.profiles.map((profile) => `<span class="profile-pill"><span>${esc(profile.label)}</span>${profile._manifest ? `<small>${esc(formatBytes(profile._manifest.files?.['ffmpeg-core.wasm']?.bytes) || '')}</small>` : ''}</span>`).join('')
    : `<span class="profile-pill">Build profile not published yet</span>`;
  const release = pkg.release?.tag ? `<span class="release-chip">${esc(pkg.release.tag)}</span>` : '';
  return `<article class="package-card" data-status="${esc(pkg.status)}">
    <div class="package-top">
      <div class="package-title"><div class="package-icon">${esc(pkg.name.slice(0,2).toUpperCase())}</div><div><h3>${esc(pkg.name)}</h3><div class="category">${esc(pkg.category)}</div></div></div>
      <span class="status ${esc(pkg.status)}">${statusLabel(pkg.status)}</span>
    </div>
    <p class="package-summary">${esc(pkg.summary)}</p>
    <div class="version-table">
      <span>Upstream pinned</span><strong>${displayVersion(pkg.upstream.version)}</strong>
      <span>WASM Zoo</span><strong>${displayVersion(zooVersion, pkg.status === 'planned' ? 'Planned' : '—')}</strong>
    </div>
    <div class="profile-pills">${profiles}</div>
    <div class="card-footer"><small>${release || (pkg.zoo.reproducible ? 'Reproducible build' : 'Tracking only')}</small><button class="details-button" data-open="${esc(pkg.slug)}">Details</button></div>
  </article>`;
}

function render() {
  const packages = catalog.packages.filter((pkg) => filter === 'all' || pkg.status === filter);
  grid.innerHTML = packages.length ? packages.map(card).join('') : `<div class="empty">No packages in this view.</div>`;
  grid.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => openPackage(button.dataset.open)));
}

function boolPill(label, value) { return `<span>${esc(label)}: ${value ? 'yes' : 'no'}</span>`; }

function releaseButtons(pkg, profile) {
  if (!pkg.release) return '';
  const asset = releaseUrl(pkg, profile.releaseAsset);
  const playground = profile.playground ? `<a class="detail-action secondary" href="./playground/?profile=${encodeURIComponent(profile.id)}">Try in Playground</a>` : '';
  return `<div class="profile-actions">${asset ? `<a class="detail-action" href="${esc(asset)}">Download ZIP</a>` : ''}${playground}</div>`;
}

function openPackage(slug) {
  const pkg = catalog.packages.find((item) => item.slug === slug);
  if (!pkg) return;
  const comparison = pkg.comparison.length ? `<div class="detail-section"><h3>Version comparison</h3><table class="comparison"><thead><tr><th>Distribution</th><th>Version</th><th>Notes</th></tr></thead><tbody>${pkg.comparison.map((row) => `<tr><td><strong>${esc(row.name)}</strong></td><td><code>${esc(row.version)}</code></td><td>${esc(row.note)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const matrix = pkg.capabilityMatrix?.length ? `<div class="detail-section"><h3>Native → WASM capability gap</h3><div class="table-scroll"><table class="comparison capability"><thead><tr><th>Capability</th><th>Native</th><th>Full</th><th>Full GPL</th></tr></thead><tbody>${pkg.capabilityMatrix.map((row) => `<tr><td><strong>${esc(row.feature)}</strong></td><td>${mark(row.native)}</td><td>${mark(row.browserFull)}</td><td>${mark(row.browserFullGpl)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  const profiles = pkg.profiles.length ? `<div class="detail-section"><h3>Published builds</h3>${pkg.profiles.map((profile) => `<div class="profile-detail"><div class="profile-detail-head"><div><h4>${esc(profile.label)}</h4><div>${esc(profile.output)}</div></div>${profileSize(profile) ? `<strong class="profile-size">${esc(profileSize(profile))}</strong>` : ''}</div><div class="profile-meta">${boolPill('threads', profile.threads)}${boolPill('SIMD', profile.simd)}${boolPill('SharedArrayBuffer', profile.sharedArrayBuffer)}${boolPill('Worker', profile.worker)}${boolPill('network', profile.network)}${boolPill('arbitrary CLI', profile.arbitraryCli)}</div><div class="feature-list">${profile.features.map((feature) => `<span>${esc(feature)}</span>`).join('')}</div><div class="feature-list"><span>license: ${esc(profile.binaryLicense)}</span><span>target: ${esc(profile.target)}</span></div>${releaseButtons(pkg, profile)}</div>`).join('')}</div>` : `<div class="detail-section"><h3>Build status</h3><p>This package is being tracked, but WASM Zoo does not publish a binary for it yet.</p></div>`;
  const notes = pkg.notes?.length ? `<div class="detail-section"><h3>Notes</h3><ul class="notes">${pkg.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></div>` : '';
  const release = pkg.release ? `<div class="detail-section release-links"><h3>Release</h3><div class="profile-actions"><a class="detail-action" href="${esc(pkg.release.page)}">Release ${esc(pkg.release.tag)}</a>${pkg.release.sourceAsset ? `<a class="detail-action secondary" href="${esc(releaseUrl(pkg, pkg.release.sourceAsset))}">Corresponding source</a>` : ''}${pkg.release.checksumsAsset ? `<a class="detail-action secondary" href="${esc(releaseUrl(pkg, pkg.release.checksumsAsset))}">SHA-256</a>` : ''}</div></div>` : '';
  dialogContent.innerHTML = `<div class="dialog-title"><span class="eyebrow">${esc(statusLabel(pkg.status))} · ${esc(pkg.category)}</span><h2>${esc(pkg.name)}</h2><p>${esc(pkg.summary)}</p></div><div class="version-table"><span>Upstream pin</span><strong>${displayVersion(pkg.upstream.version)}</strong><span>Zoo builder</span><strong>${displayVersion(pkg.zoo.builderVersion, 'Not published')}</strong><span>Upstream license</span><strong>${esc(pkg.upstream.license)}</strong></div>${release}${comparison}${matrix}${profiles}${notes}`;
  dialog.showModal();
}

async function enrichReleaseManifests() {
  const tasks = [];
  for (const pkg of catalog.packages) {
    if (pkg.status !== 'available' || !pkg.upstream.version) continue;
    for (const profile of pkg.profiles || []) {
      if (!profile.releaseAsset) continue;
      const url = `./assets/${encodeURIComponent(pkg.slug)}/${encodeURIComponent(pkg.upstream.version)}/${encodeURIComponent(profile.id)}/manifest.json`;
      tasks.push(fetch(url, { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) return;
        const manifest = await response.json();
        if (manifest.profile === profile.id && manifest.upstream?.version === pkg.upstream.version) profile._manifest = manifest;
      }).catch(() => {}));
    }
  }
  await Promise.all(tasks);
}

closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  filter = button.dataset.filter;
  render();
}));

try {
  const response = await fetch('./catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  catalog = await response.json();
  document.querySelector('#stat-packages').textContent = catalog.stats.packages;
  document.querySelector('#stat-available').textContent = catalog.stats.available;
  document.querySelector('#stat-profiles').textContent = catalog.stats.profiles;
  document.querySelector('#generated-at').textContent = `Catalog v${catalog.project.version}`;
  const featured = catalog.packages.find((pkg) => pkg.slug === 'ffmpeg');
  if (featured) {
    const upstream = document.querySelector('#hero-ffmpeg-upstream');
    const zoo = document.querySelector('#hero-ffmpeg-zoo');
    const release = document.querySelector('#hero-ffmpeg-release');
    const featuredVersion = document.querySelector('#featured-ffmpeg-version');
    const releaseLink = document.querySelector('#featured-release-link');
    if (upstream) upstream.textContent = featured.upstream.version || '—';
    if (zoo) zoo.textContent = featured.upstream.version || '—';
    if (release) release.textContent = featured.release?.tag || 'not published';
    if (featuredVersion) featuredVersion.textContent = featured.upstream.version || 'current';
    if (releaseLink && featured.release?.page) {
      releaseLink.href = featured.release.page;
      releaseLink.textContent = `View ${featured.release.tag} release`;
    }
  }
  await enrichReleaseManifests();
  render();
} catch (error) {
  grid.innerHTML = `<div class="empty">Catalog could not be loaded. Run <code>npm run build:site</code> and serve the <code>site</code> directory.</div>`;
  console.error(error);
}
