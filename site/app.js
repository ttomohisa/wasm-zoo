const grid = document.querySelector("#package-grid");
const dialog = document.querySelector("#package-dialog");
const dialogContent = document.querySelector("#dialog-content");
const closeButton = document.querySelector("#dialog-close");
let catalog;
let filter = "all";

const esc = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const displayVersion = (value, fallback = "Not pinned") => value ? esc(value) : fallback;
const statusLabel = (status) => ({available:"Available",experimental:"Experimental",planned:"Planned",paused:"Paused"}[status] || status);
const mark = (value) => value === true ? "✓" : value === false ? "—" : esc(value ?? "—");

function card(pkg) {
  const zooVersion = pkg.status === "available" ? pkg.upstream.version : null;
  const profiles = pkg.profiles.length
    ? pkg.profiles.map((profile) => `<span class="profile-pill">${esc(profile.label)}</span>`).join("")
    : `<span class="profile-pill">Build profile not published yet</span>`;
  return `<article class="package-card" data-status="${esc(pkg.status)}">
    <div class="package-top">
      <div class="package-title"><div class="package-icon">${esc(pkg.name.slice(0,2).toUpperCase())}</div><div><h3>${esc(pkg.name)}</h3><div class="category">${esc(pkg.category)}</div></div></div>
      <span class="status ${esc(pkg.status)}">${statusLabel(pkg.status)}</span>
    </div>
    <p class="package-summary">${esc(pkg.summary)}</p>
    <div class="version-table">
      <span>Upstream pinned</span><strong>${displayVersion(pkg.upstream.version)}</strong>
      <span>WASM Zoo</span><strong>${displayVersion(zooVersion, pkg.status === "planned" ? "Planned" : "—")}</strong>
    </div>
    <div class="profile-pills">${profiles}</div>
    <div class="card-footer"><small>${pkg.zoo.reproducible ? "Reproducible build" : "Tracking only"}</small><button class="details-button" data-open="${esc(pkg.slug)}">Details</button></div>
  </article>`;
}

function render() {
  const packages = catalog.packages.filter((pkg) => filter === "all" || pkg.status === filter);
  grid.innerHTML = packages.length ? packages.map(card).join("") : `<div class="empty">No packages in this view.</div>`;
  grid.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => openPackage(button.dataset.open)));
}

function boolPill(label, value) { return `<span>${esc(label)}: ${value ? "yes" : "no"}</span>`; }

function openPackage(slug) {
  const pkg = catalog.packages.find((item) => item.slug === slug);
  if (!pkg) return;
  const comparison = pkg.comparison.length ? `<div class="detail-section"><h3>Version comparison</h3><table class="comparison"><thead><tr><th>Distribution</th><th>Version</th><th>Notes</th></tr></thead><tbody>${pkg.comparison.map((row) => `<tr><td><strong>${esc(row.name)}</strong></td><td><code>${esc(row.version)}</code></td><td>${esc(row.note)}</td></tr>`).join("")}</tbody></table></div>` : "";
  const matrix = pkg.capabilityMatrix?.length ? `<div class="detail-section"><h3>Native → WASM capability gap</h3><div class="table-scroll"><table class="comparison capability"><thead><tr><th>Capability</th><th>Native</th><th>Full</th><th>Full GPL</th></tr></thead><tbody>${pkg.capabilityMatrix.map((row) => `<tr><td><strong>${esc(row.feature)}</strong></td><td>${mark(row.native)}</td><td>${mark(row.browserFull)}</td><td>${mark(row.browserFullGpl)}</td></tr>`).join("")}</tbody></table></div></div>` : "";
  const profiles = pkg.profiles.length ? `<div class="detail-section"><h3>Published builds</h3>${pkg.profiles.map((profile) => `<div class="profile-detail"><h4>${esc(profile.label)}</h4><div>${esc(profile.output)}</div><div class="profile-meta">${boolPill("threads", profile.threads)}${boolPill("SIMD", profile.simd)}${boolPill("SharedArrayBuffer", profile.sharedArrayBuffer)}${boolPill("Worker", profile.worker)}${boolPill("network", profile.network)}${boolPill("arbitrary CLI", profile.arbitraryCli)}</div><div class="feature-list">${profile.features.map((feature) => `<span>${esc(feature)}</span>`).join("")}</div><div class="feature-list"><span>license: ${esc(profile.binaryLicense)}</span><span>target: ${esc(profile.target)}</span>${profile.size ? `<span>size: ${esc(profile.size)}</span>` : ""}</div></div>`).join("")}</div>` : `<div class="detail-section"><h3>Build status</h3><p>This package is being tracked, but WASM Zoo does not publish a binary for it yet.</p></div>`;
  const notes = pkg.notes?.length ? `<div class="detail-section"><h3>Notes</h3><ul class="notes">${pkg.notes.map((note) => `<li>${esc(note)}</li>`).join("")}</ul></div>` : "";
  dialogContent.innerHTML = `<div class="dialog-title"><span class="eyebrow">${esc(statusLabel(pkg.status))} · ${esc(pkg.category)}</span><h2>${esc(pkg.name)}</h2><p>${esc(pkg.summary)}</p></div><div class="version-table"><span>Upstream pin</span><strong>${displayVersion(pkg.upstream.version)}</strong><span>Zoo builder</span><strong>${displayVersion(pkg.zoo.builderVersion, "Not published")}</strong><span>Upstream license</span><strong>${esc(pkg.upstream.license)}</strong></div>${comparison}${matrix}${profiles}${notes}`;
  dialog.showModal();
}

closeButton.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  filter = button.dataset.filter;
  render();
}));

try {
  const response = await fetch("./catalog.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  catalog = await response.json();
  document.querySelector("#stat-packages").textContent = catalog.stats.packages;
  document.querySelector("#stat-available").textContent = catalog.stats.available;
  document.querySelector("#stat-profiles").textContent = catalog.stats.profiles;
  document.querySelector("#generated-at").textContent = `Catalog v${catalog.project.version}`;
  render();
} catch (error) {
  grid.innerHTML = `<div class="empty">Catalog could not be loaded. Run <code>npm run build:site</code> and serve the <code>site</code> directory.</div>`;
  console.error(error);
}
