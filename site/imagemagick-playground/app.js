const $ = (selector) => document.querySelector(selector);
const loadButton = $('#load-core');
const runButton = $('#run');
const fileInput = $('#input-files');
const argsInput = $('#args');
const outputInput = $('#output-name');
const collectInput = $('#collect-dir');
const logOutput = $('#log');
const coreStatus = $('#core-status');
const manifestSummary = $('#manifest-summary');
const downloadArea = $('#download-area');
const runtimeStatus = $('#runtime-status');
const fileGuidance = $('#file-guidance');

let pkg;
let runner = null;
let wrapperPromise = null;
let objectUrls = [];

const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
};

const log = (message, stream = 'info') => {
  const el = document.createElement('div');
  el.className = `log-line ${stream}`;
  el.textContent = message;
  logOutput.append(el);
  logOutput.scrollTop = logOutput.scrollHeight;
};

const setCore = (text, state = '') => {
  coreStatus.textContent = text;
  coreStatus.dataset.state = state;
};

function splitArgs(text) {
  const args = [];
  let current = '';
  let quote = '';
  let escape = false;
  for (const ch of text.trim()) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error('Unclosed quote in arguments.');
  if (escape) current += '\\';
  if (current) args.push(current);
  return args;
}

const assetBase = () => new URL(`../assets/imagemagick/${pkg.upstream.version}/browser-full/`, location.href);

async function loadManifest() {
  const response = await fetch(new URL('manifest.json', assetBase()), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Release manifest unavailable (HTTP ${response.status}).`);
  return response.json();
}

async function renderManifest() {
  try {
    const manifest = await loadManifest();
    const wasm = Object.entries(manifest.files || {})
      .filter(([name]) => name.endsWith('.wasm') && !name.endsWith('.wasm.gz'))
      .reduce((sum, [, file]) => sum + (file.bytes || 0), 0);
    const gzip = Object.entries(manifest.files || {})
      .filter(([name]) => name.endsWith('.wasm.gz'))
      .reduce((sum, [, file]) => sum + (file.bytes || 0), 0);
    manifestSummary.innerHTML = `<strong>${esc(manifest.profileLabel || 'Browser Full')}</strong><span>ImageMagick ${esc(manifest.upstream.version)}</span><span>1 CLI core</span><span>WASM ${formatBytes(wasm)}</span><span>gzip ${formatBytes(gzip)}</span>`;
  } catch (error) {
    manifestSummary.innerHTML = `<span>${esc(error.message)}</span>`;
  }
}

function ensureWrapper() {
  if (window.WasmZooImageMagick) return Promise.resolve();
  if (wrapperPromise) return wrapperPromise;
  wrapperPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('browser-imagemagick.js', assetBase()).href;
    script.onload = () => window.WasmZooImageMagick ? resolve() : reject(new Error('ImageMagick runtime wrapper did not initialize.'));
    script.onerror = () => reject(new Error('Could not load browser-imagemagick.js.'));
    document.head.append(script);
  });
  return wrapperPromise;
}

async function loadRuntime() {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    throw new Error('ImageMagick browser-full requires Web Workers and WebAssembly support.');
  }
  await ensureWrapper();
  if (!runner) {
    setCore('Loading magick…', 'working');
    runner = window.WasmZooImageMagick.loadHosted({ baseUrl: assetBase().href });
    if (typeof runner.load === 'function') await runner.load();
  }
  setCore('Loaded · magick', 'ready');
  return runner;
}

function safeName(name, index) {
  const base = (name || `file-${index}`)
    .replace(/[\\/]+/g, '_')
    .replace(/[^a-z0-9._ -]/gi, '_');
  return base || `file-${index}`;
}

function clearDownloads() {
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  downloadArea.textContent = '';
}

function showFiles(files) {
  clearDownloads();
  if (!files.length) return;
  const note = document.createElement('div');
  note.className = 'extracted-note';
  note.textContent = `${files.length} output file${files.length === 1 ? '' : 's'}`;
  downloadArea.append(note);
  for (const file of files) {
    const url = URL.createObjectURL(new Blob([file.data]));
    objectUrls.push(url);
    const link = document.createElement('a');
    link.className = 'download-button';
    link.href = url;
    link.download = file.name.replace(/^\/+/, '').replaceAll('/', '__') || 'output.bin';
    link.textContent = `${link.download} · ${formatBytes(file.data.byteLength)}`;
    downloadArea.append(link);
  }
}

function activePresetName() {
  return document.querySelector('[data-preset].active')?.dataset.preset || '';
}

function updateGuidance() {
  const map = {
    identify: 'Choose one PNG or JPEG file to inspect.',
    resize: 'Choose one PNG or JPEG file. Output will be written to {output}.',
    grayscale: 'Choose one PNG or JPEG file. Output will be written to {output}.',
    version: 'No local file is required for -version.'
  };
  fileGuidance.querySelector('.label-hint').textContent = map[activePresetName()] || 'staged under /input/';
}

async function runCommand() {
  runButton.disabled = true;
  loadButton.disabled = true;
  clearDownloads();
  try {
    const active = await loadRuntime();
    const selected = [...(fileInput.files || [])];
    const staged = selected.map((file, index) => ({ name: `/input/${safeName(file.name, index)}`, data: file }));
    const firstInput = staged[0]?.name || '/input/input.png';
    let args = splitArgs(argsInput.value).map((arg) => arg.replaceAll('{input}', firstInput).replaceAll('{output}', outputInput.value.trim() || '/output.jpg'));
    if (argsInput.value.includes('{input}') && !selected.length) throw new Error('This command uses {input}. Choose a local file first.');
    const collectDir = collectInput.value.trim();
    const output = outputInput.value.trim() || '/output.jpg';
    const outputs = args.includes(output) ? [output] : [];
    const dirs = ['/input', ...(collectDir ? [collectDir] : [])];
    log(`$ magick ${args.join(' ')}`, 'command');
    const result = await active.exec(args, {
      files: staged,
      outputs,
      collectDirs: collectDir ? [collectDir] : [],
      dirs,
      onLog: ({ stream, message }) => log(message, stream)
    });
    log(`Completed with exit code ${result.exitCode}.`, 'success');
    showFiles(result.files);
  } catch (error) {
    console.error(error);
    log(error.message || String(error), 'error');
  } finally {
    runButton.disabled = false;
    loadButton.disabled = false;
  }
}

const presets = {
  identify: { args: 'identify {input}', output: '/output.jpg', collect: '' },
  resize: { args: '{input} -resize 640x640> -strip {output}', output: '/output.jpg', collect: '' },
  grayscale: { args: '{input} -colorspace Gray {output}', output: '/output.png', collect: '' },
  version: { args: '-version', output: '/output.jpg', collect: '' }
};

document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-preset]').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  const preset = presets[button.dataset.preset];
  argsInput.value = preset.args;
  outputInput.value = preset.output;
  collectInput.value = preset.collect;
  updateGuidance();
}));

loadButton.addEventListener('click', async () => {
  loadButton.disabled = true;
  try {
    await loadRuntime();
  } catch (error) {
    console.error(error);
    setCore(error.message, 'error');
  } finally {
    loadButton.disabled = false;
  }
});

runButton.addEventListener('click', runCommand);

try {
  const response = await fetch('../catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json();
  pkg = catalog.packages.find((item) => item.slug === 'imagemagick');
  if (!pkg) throw new Error('ImageMagick package metadata was not found.');
  $('#version').textContent = pkg.upstream.version || 'current';
  document.title = `ImageMagick ${pkg.upstream.version} Playground · WASM Zoo`;
  if (typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined') {
    runtimeStatus.textContent = 'Ready · single-thread + Worker + MEMFS';
    runtimeStatus.dataset.state = 'ready';
  }
  await renderManifest();
  document.querySelector('[data-preset="identify"]').click();
} catch (error) {
  console.error(error);
  runtimeStatus.textContent = error.message;
  runtimeStatus.dataset.state = 'error';
  setCore(error.message, 'error');
  runButton.disabled = true;
  loadButton.disabled = true;
}
