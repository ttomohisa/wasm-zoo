const $ = (selector) => document.querySelector(selector);
const toolSelect = $('#tool');
const loadButton = $('#load-core');
const runButton = $('#run');
const fileInput = $('#input-files');
const fileGuidance = $('#file-guidance');
const argsInput = $('#args');
const outputInput = $('#output-name');
const collectInput = $('#collect-dir');
const logOutput = $('#log');
const coreStatus = $('#core-status');
const manifestSummary = $('#manifest-summary');
const downloadArea = $('#download-area');
const runtimeStatus = $('#runtime-status');

let pkg;
let runner = null;
let loadedTool = null;
let wrapperPromise = null;
let objectUrls = [];
let activePreset = null;

const ZIP_LIKE_EXTENSIONS = new Set([
  'zip', 'jar', 'war', 'apk', 'epub', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'
]);
const ARCHIVE_EXTENSIONS = new Set([
  ...ZIP_LIKE_EXTENSIONS,
  'tar', 'tgz', 'tbz', 'tbz2', 'cpio', '7z', 'rar', 'cab', 'ar', 'xar', 'iso', 'gz', 'bz2'
]);
const OBVIOUS_NON_ARCHIVE_EXTENSIONS = new Set([
  'mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'svg', 'pdf', 'txt', 'md', 'csv',
  'json', 'html', 'htm', 'css', 'js'
]);

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
};

const log = (message, stream = 'info') => {
  const line = document.createElement('div');
  line.className = `log-line ${stream}`;
  line.textContent = message;
  logOutput.append(line);
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
  for (const char of text.trim()) {
    if (escape) { current += char; escape = false; continue; }
    if (char === '\\') { escape = true; continue; }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (/\s/.test(char)) {
      if (current) { args.push(current); current = ''; }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error('Unclosed quote in arguments.');
  if (escape) current += '\\';
  if (current) args.push(current);
  return args;
}

const assetBase = () => new URL(`../assets/libarchive/${pkg.upstream.version}/browser-full/`, location.href);

async function loadManifest() {
  const response = await fetch(new URL('manifest.json', assetBase()), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Release manifest unavailable (HTTP ${response.status}).`);
  return response.json();
}

async function renderManifest() {
  try {
    const manifest = await loadManifest();
    const wasm = Object.entries(manifest.files || {})
      .filter(([name]) => name.endsWith('-core.wasm'))
      .reduce((sum, [, file]) => sum + (file.bytes || 0), 0);
    const gzip = Object.entries(manifest.files || {})
      .filter(([name]) => name.endsWith('-core.wasm.gz'))
      .reduce((sum, [, file]) => sum + (file.bytes || 0), 0);
    manifestSummary.innerHTML = `<strong>${esc(manifest.profileLabel || 'Browser Full')}</strong><span>libarchive ${esc(manifest.upstream.version)}</span><span>4 CLI cores</span><span>WASM ${formatBytes(wasm)}</span><span>gzip ${formatBytes(gzip)}</span>`;
  } catch (error) {
    manifestSummary.innerHTML = `<span>${esc(error.message)}</span>`;
  }
}

function ensureWrapper() {
  if (window.WasmZooLibarchive) return Promise.resolve();
  if (wrapperPromise) return wrapperPromise;
  wrapperPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('browser-libarchive.js', assetBase()).href;
    script.onload = () => window.WasmZooLibarchive
      ? resolve()
      : reject(new Error('libarchive runtime wrapper did not initialize.'));
    script.onerror = () => reject(new Error('Could not load browser-libarchive.js.'));
    document.head.append(script);
  });
  return wrapperPromise;
}

async function loadRuntime(tool) {
  await ensureWrapper();
  if (!runner) runner = window.WasmZooLibarchive.loadHosted({ baseUrl: assetBase().href });
  if (loadedTool === tool) return runner;
  setCore(`Loading ${tool}…`, 'working');
  await runner.loadTool(tool);
  loadedTool = tool;
  setCore(`Loaded · ${tool}`, 'ready');
  return runner;
}

function safeName(name, index) {
  const base = (name || `file-${index}`)
    .replace(/[\\/]+/g, '_')
    .replace(/[^a-z0-9._ -]/gi, '_');
  return base || `file-${index}`;
}

function extensionOf(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.tar.gz')) return 'tgz';
  if (name.endsWith('.tar.bz2')) return 'tbz2';
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : '';
}

function isZipLike(file) {
  return ZIP_LIKE_EXTENSIONS.has(extensionOf(file));
}

function looksLikeArchive(file) {
  return ARCHIVE_EXTENSIONS.has(extensionOf(file));
}

function isObviousNonArchive(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type.startsWith('video/') || type.startsWith('audio/') || type.startsWith('image/')) return true;
  return OBVIOUS_NON_ARCHIVE_EXTENSIONS.has(extensionOf(file));
}

function archiveReadMode(tool, args) {
  if (activePreset === 'list' || activePreset === 'extract') return 'archive';
  if (activePreset === 'unzip') return 'zip';
  if (activePreset === 'create') return '';

  if (tool === 'bsdunzip' && args.some((arg) => arg.startsWith('/input/'))) return 'zip';
  if (tool === 'bsdtar' && args.some((arg) => arg.startsWith('/input/'))) {
    const readsArchive = args.some((arg) => /^-[^-]*[tx]/.test(arg) || arg === '--list' || arg === '--extract');
    if (readsArchive) return 'archive';
  }
  return '';
}

function validateReadInput(mode, selected) {
  if (!mode || !selected.length) return;
  const file = selected[0];
  const ext = extensionOf(file);

  if (mode === 'zip') {
    if (isZipLike(file)) return;
    if (looksLikeArchive(file)) {
      throw new Error(`“${file.name}” is not a ZIP-compatible archive. bsdunzip is for ZIP-compatible containers; use bsdtar for other archive formats.`);
    }
    if (isObviousNonArchive(file)) {
      throw new Error(`“${file.name}” is a ${ext ? `.${ext}` : 'regular'} file, not an archive. Use “Create TAR” if you want to put this file into an archive.`);
    }
    return; // libarchive detects by content, so unknown/custom extensions are allowed through.
  }

  if (mode === 'archive' && isObviousNonArchive(file)) {
    throw new Error(`“${file.name}” is a ${ext ? `.${ext}` : 'regular'} file, not an archive. List/Extract expects an archive such as ZIP or TAR. Use “Create TAR” to archive arbitrary files.`);
  }
}

function setFileGuidance(mode = '') {
  fileGuidance.dataset.mode = mode;
  if (mode === 'list' || mode === 'extract') {
    fileGuidance.textContent = 'Choose an archive file (ZIP, TAR, TAR.GZ, TAR.BZ2, etc.). {input} uses the first file.';
    fileInput.multiple = false;
  } else if (mode === 'unzip') {
    fileGuidance.textContent = 'Choose a ZIP-compatible file (.zip, .jar, .apk, .docx, etc.).';
    fileInput.multiple = false;
  } else if (mode === 'create') {
    fileGuidance.textContent = 'Any files are allowed. All selected files are staged under /input/ and packed into the TAR.';
    fileInput.multiple = true;
  } else {
    fileGuidance.textContent = 'Files are staged under /input/. {input} means the first selected file.';
    fileInput.multiple = true;
  }
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

async function runCommand() {
  runButton.disabled = true;
  loadButton.disabled = true;
  clearDownloads();
  try {
    const tool = toolSelect.value;
    const selected = [...(fileInput.files || [])];
    const staged = selected.map((file, index) => ({
      name: `/input/${safeName(file.name, index)}`,
      data: file
    }));
    const first = staged[0]?.name || '/input/input.bin';
    const output = outputInput.value.trim() || '/output.tar';
    let args = splitArgs(argsInput.value).map((arg) => arg
      .replaceAll('{input}', first)
      .replaceAll('{output}', output));

    if (argsInput.value.includes('{input}') && !selected.length) {
      throw new Error('This command uses {input}. Choose a local file first.');
    }

    validateReadInput(archiveReadMode(tool, args), selected);

    const active = await loadRuntime(tool);
    const collect = collectInput.value.trim();
    const outputs = args.includes(output) ? [output] : [];
    const dirs = ['/input', ...(collect ? [collect] : [])];
    log(`$ ${tool} ${args.join(' ')}`, 'command');
    const result = await active.exec(tool, args, {
      files: staged,
      outputs,
      collectDirs: collect ? [collect] : [],
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
  list: { tool: 'bsdtar', args: '-tf {input}', output: '/output.tar', collect: '' },
  extract: { tool: 'bsdtar', args: '-xf {input} -C /out', output: '/output.tar', collect: '/out' },
  create: { tool: 'bsdtar', args: '-cf {output} -C /input .', output: '/output.tar', collect: '' },
  unzip: { tool: 'bsdunzip', args: '-l {input}', output: '/output.tar', collect: '' }
};

document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
  const key = button.dataset.preset;
  const preset = presets[key];
  activePreset = key;
  toolSelect.value = preset.tool;
  argsInput.value = preset.args;
  outputInput.value = preset.output;
  collectInput.value = preset.collect;
  setFileGuidance(key);
  setCore(loadedTool === preset.tool ? `Loaded · ${preset.tool}` : 'Not loaded', loadedTool === preset.tool ? 'ready' : '');
}));

argsInput.addEventListener('input', () => {
  activePreset = null;
  setFileGuidance();
});

toolSelect.addEventListener('change', () => {
  activePreset = null;
  setFileGuidance();
  setCore(loadedTool === toolSelect.value ? `Loaded · ${toolSelect.value}` : 'Not loaded', loadedTool === toolSelect.value ? 'ready' : '');
});

loadButton.addEventListener('click', async () => {
  loadButton.disabled = true;
  try {
    await loadRuntime(toolSelect.value);
  } catch (error) {
    console.error(error);
    setCore(error.message, 'error');
  } finally {
    loadButton.disabled = false;
  }
});

runButton.addEventListener('click', runCommand);
setFileGuidance();

try {
  const response = await fetch('../catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  const catalog = await response.json();
  pkg = catalog.packages.find((item) => item.slug === 'libarchive');
  if (!pkg) throw new Error('libarchive package metadata was not found.');
  $('#version').textContent = pkg.upstream.version || 'current';
  document.title = `libarchive ${pkg.upstream.version} Playground · WASM Zoo`;
  runtimeStatus.textContent = 'Ready · Worker + MEMFS';
  runtimeStatus.dataset.state = 'ready';
  await renderManifest();
} catch (error) {
  console.error(error);
  runtimeStatus.textContent = error.message;
  runtimeStatus.dataset.state = 'error';
  setCore(error.message, 'error');
  runButton.disabled = true;
  loadButton.disabled = true;
}
