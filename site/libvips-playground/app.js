const $ = (query) => document.querySelector(query);
const coreStatus = $('#core-status');
const manifestSummary = $('#manifest-summary');
const profileComparison = $('#profile-comparison');
const profileSelect = $('#profile-select');
const loadButton = $('#load-core');
const runButton = $('#run');
const fileInput = $('#input-file');
const operation = $('#operation');
const widthInput = $('#target-width');
const format = $('#format');
const logArea = $('#log');
const downloadArea = $('#download-area');

let pkg = null;
let vips = null;
let outputUrl = null;

const log = (message, type = 'info') => {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = message;
  logArea.append(line);
  logArea.scrollTop = logArea.scrollHeight;
};
const fmt = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`;
const activeProfile = () => profileSelect.value;
const baseUrl = (profile = activeProfile()) => new URL(`../assets/libvips/${pkg.upstream.version}/${profile}/`, location.href).href;
function setCore(text, state = '') { coreStatus.textContent = text; coreStatus.dataset.state = state; }
function setAcceptedInputs() {
  fileInput.accept = activeProfile() === 'browser-full'
    ? 'image/jpeg,image/png,image/webp,image/gif,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.tif,.tiff'
    : 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
}

async function fetchManifest(profile) {
  const response = await fetch(new URL('manifest.json', baseUrl(profile)), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${profile} manifest HTTP ${response.status}`);
  return response.json();
}

async function renderManifest() {
  try {
    const manifest = await fetchManifest(activeProfile());
    const wasm = manifest.files?.['vips.wasm'];
    const gzip = manifest.files?.['vips.wasm.gz'];
    manifestSummary.innerHTML = `<span><strong>${manifest.profileLabel || manifest.profile}</strong></span><span>WASM ${wasm ? fmt(wasm.bytes) : '—'}</span><span>gzip ${gzip ? fmt(gzip.bytes) : '—'}</span>`;
  } catch (error) {
    manifestSummary.textContent = `Release core not staged yet · ${error.message}`;
  }
}

async function renderComparison() {
  try {
    const [core, full] = await Promise.all([fetchManifest('browser-core'), fetchManifest('browser-full')]);
    const transfer = (manifest) => (manifest.files?.['vips.wasm.gz']?.bytes || 0) + (manifest.files?.['vips.js.gz']?.bytes || 0);
    const coreBytes = transfer(core);
    const fullBytes = transfer(full);
    const saved = Math.max(0, fullBytes - coreBytes);
    const percent = fullBytes ? saved / fullBytes * 100 : 0;
    profileComparison.innerHTML = `<span><strong>Core vs Full</strong></span><span>gzip transfer −${fmt(saved)}</span><span>${percent.toFixed(1)}% smaller</span>`;
  } catch (error) {
    profileComparison.textContent = `Size comparison appears after both profiles are published · ${error.message}`;
  }
}

async function loadRuntime() {
  if (vips) return vips;
  if (!pkg) throw new Error('Catalog is not ready.');
  setCore('Loading…', 'working');
  await new Promise((resolve, reject) => {
    if (globalThis.WasmZooLibvips) return resolve();
    const script = document.createElement('script');
    script.src = new URL('browser-libvips.js', baseUrl());
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load browser-libvips.js'));
    document.head.append(script);
  });
  vips = await WasmZooLibvips.loadHosted({ baseUrl: baseUrl(), printErr: (message) => log(message, 'stderr') });
  profileSelect.disabled = true;
  setCore(`Loaded · ${vips.version()} · ${activeProfile()}`, 'ready');
  return vips;
}

function outputSpec() {
  if (format.value === 'png') return { suffix: '.png', mime: 'image/png', name: 'output.png' };
  if (format.value === 'webp') return { suffix: '.webp[Q=82]', mime: 'image/webp', name: 'output.webp' };
  return { suffix: '.jpg[Q=85]', mime: 'image/jpeg', name: 'output.jpg' };
}
function clearOutput() {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  downloadArea.textContent = '';
}

async function run() {
  runButton.disabled = true;
  loadButton.disabled = true;
  clearOutput();
  let image = null;
  let result = null;
  try {
    const file = fileInput.files?.[0];
    if (!file) throw new Error('Choose a local image first.');
    const api = await loadRuntime();
    const bytes = new Uint8Array(await file.arrayBuffer());
    image = api.Image.newFromBuffer(bytes);
    log(`Input: ${file.name} · ${image.width}x${image.height} · ${image.bands} bands · ${image.interpretation}`, 'command');
    if (operation.value === 'info') {
      log(`Format=${image.format}, coding=${image.coding}, resolution=${image.xres.toFixed(3)}x${image.yres.toFixed(3)} px/mm`, 'success');
      return;
    }
    if (operation.value === 'resize') {
      const target = Math.max(1, Number(widthInput.value) || 640);
      result = image.resize(target / image.width);
      log(`Resize: ${image.width}x${image.height} -> ${result.width}x${result.height}`, 'command');
    } else if (operation.value === 'grayscale') {
      result = image.colourspace('b-w');
      log('Colourspace: grayscale', 'command');
    } else {
      result = image.copy();
      log('Convert without geometric changes', 'command');
    }
    const spec = outputSpec();
    const out = result.writeToBuffer(spec.suffix);
    outputUrl = URL.createObjectURL(new Blob([out], { type: spec.mime }));
    const link = document.createElement('a');
    link.className = 'download-button';
    link.href = outputUrl;
    link.download = spec.name;
    link.textContent = `${spec.name} · ${fmt(out.byteLength)}`;
    const imagePreview = document.createElement('img');
    imagePreview.className = 'output-preview';
    imagePreview.src = outputUrl;
    imagePreview.alt = 'libvips output preview';
    downloadArea.append(link, imagePreview);
    log(`Output: ${result.width}x${result.height} · ${fmt(out.byteLength)}`, 'success');
  } catch (error) {
    console.error(error);
    log(error.message || String(error), 'error');
  } finally {
    try { result?.delete(); } catch {}
    try { image?.delete(); } catch {}
    runButton.disabled = false;
    loadButton.disabled = false;
  }
}

loadButton.addEventListener('click', async () => {
  loadButton.disabled = true;
  try { await loadRuntime(); }
  catch (error) { console.error(error); setCore(error.message, 'error'); }
  finally { loadButton.disabled = false; }
});
runButton.addEventListener('click', run);
operation.addEventListener('change', () => { widthInput.disabled = operation.value !== 'resize'; });
profileSelect.addEventListener('change', async () => {
  setAcceptedInputs();
  clearOutput();
  await renderManifest();
  const url = new URL(location.href);
  url.searchParams.set('profile', activeProfile());
  history.replaceState(null, '', url);
});

try {
  const response = await fetch('../catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json();
  pkg = catalog.packages.find((entry) => entry.slug === 'libvips');
  if (!pkg) throw new Error('libvips package metadata was not found.');
  const requested = new URL(location.href).searchParams.get('profile');
  if (pkg.profiles.some((profile) => profile.id === requested)) profileSelect.value = requested;
  $('#version').textContent = pkg.upstream.version;
  document.title = `libvips ${pkg.upstream.version} Playground · WASM Zoo`;
  setAcceptedInputs();
  await Promise.all([renderManifest(), renderComparison()]);
} catch (error) {
  console.error(error);
  setCore(error.message, 'error');
  runButton.disabled = true;
  loadButton.disabled = true;
}
