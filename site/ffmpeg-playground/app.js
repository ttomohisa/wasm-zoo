const $ = (selector) => document.querySelector(selector);
const profileSelect = $('#profile');
const loadButton = $('#load-core');
const runButton = $('#run');
const fileInput = $('#input-file');
const argsInput = $('#args');
const outputInput = $('#output-name');
const logOutput = $('#log');
const coreStatus = $('#core-status');
const manifestSummary = $('#manifest-summary');
const downloadArea = $('#download-area');
let catalog;
let ffmpegPackage;
let runner = null;
let loadedProfileId = null;
let currentObjectUrl = null;
let wrapperPromise = null;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
};

const log = (message, stream = 'info') => {
  const line = document.createElement('div');
  line.className = `log-line ${stream}`;
  line.textContent = message;
  logOutput.append(line);
  logOutput.scrollTop = logOutput.scrollHeight;
};

const setCoreStatus = (text, state = '') => {
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

function selectedProfile() {
  return ffmpegPackage?.profiles.find((profile) => profile.id === profileSelect.value);
}

function assetBase(profileId) {
  return new URL(`../assets/ffmpeg/${ffmpegPackage.upstream.version}/${profileId}/`, location.href);
}

async function loadManifest(profileId) {
  const response = await fetch(new URL('manifest.json', assetBase(profileId)), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Release manifest is unavailable (HTTP ${response.status}).`);
  return response.json();
}

async function renderManifest(profileId) {
  try {
    const manifest = await loadManifest(profileId);
    const wasm = manifest.files?.['ffmpeg-core.wasm']?.bytes;
    const gzip = manifest.files?.['ffmpeg-core.wasm.gz']?.bytes;
    manifestSummary.innerHTML = `<strong>${manifest.profileLabel}</strong><span>FFmpeg ${manifest.upstream.version}</span><span>WASM ${formatBytes(wasm)}</span><span>gzip ${formatBytes(gzip)}</span><span>${manifest.build.binaryLicense}</span>`;
  } catch (error) {
    manifestSummary.innerHTML = `<span>${error.message}</span>`;
  }
}

function ensureWrapper() {
  if (window.WasmZooFFmpeg) return Promise.resolve();
  if (wrapperPromise) return wrapperPromise;
  wrapperPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('browser-ffmpeg.js', assetBase('browser-full')).href;
    script.onload = () => window.WasmZooFFmpeg ? resolve() : reject(new Error('WASM Zoo runtime wrapper did not initialize.'));
    script.onerror = () => reject(new Error('Could not load browser-ffmpeg.js from the staged release.'));
    document.head.append(script);
  });
  return wrapperPromise;
}

async function loadRuntime(profileId) {
  if (runner && loadedProfileId === profileId) return runner;
  runner?.dispose();
  runner = null;
  loadedProfileId = null;
  setCoreStatus('Loading release core…', 'working');
  logOutput.textContent = '';

  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error('SharedArrayBuffer is not available. Reload the page after the isolation setup completes.');
  }
  await ensureWrapper();

  const base = assetBase(profileId);
  runner = await window.WasmZooFFmpeg.loadHosted({
    coreJsUrl: new URL('ffmpeg-core.js', base).href,
    wasmUrl: new URL('ffmpeg-core.wasm', base).href
  });
  loadedProfileId = profileId;
  setCoreStatus(`Loaded · ${profileId}`, 'ready');
  return runner;
}

function virtualInputName(file) {
  if (!file) return '/input.bin';
  const match = file.name.match(/(\.[a-z0-9]{1,8})$/i);
  return `/input${match ? match[1].toLowerCase() : '.bin'}`;
}

function replaceTokens(args, inputName, outputName) {
  return args.map((arg) => arg.replaceAll('{input}', inputName).replaceAll('{output}', outputName));
}

function prepareDownload(file) {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(new Blob([file.data]));
  const link = document.createElement('a');
  link.href = currentObjectUrl;
  link.download = file.name.replace(/^\//, '') || 'output.bin';
  link.className = 'download-button';
  link.textContent = `Download ${link.download} · ${formatBytes(file.data.byteLength)}`;
  downloadArea.replaceChildren(link);
}

async function runCommand() {
  runButton.disabled = true;
  loadButton.disabled = true;
  downloadArea.textContent = '';
  try {
    const profile = selectedProfile();
    const activeRunner = await loadRuntime(profile.id);
    const file = fileInput.files?.[0] || null;
    const inputName = virtualInputName(file);
    const outputName = outputInput.value.trim() || '/output.mp4';
    let args = splitArgs(argsInput.value);
    args = replaceTokens(args, inputName, outputName);
    const needsInput = args.includes(inputName) || argsInput.value.includes('{input}');
    const wantsOutput = args.includes(outputName) || argsInput.value.includes('{output}');
    if (needsInput && !file) throw new Error('This command uses {input}. Choose an input file first.');

    log(`$ ffmpeg ${args.join(' ')}`, 'command');
    const result = await activeRunner.exec(args, {
      files: file ? [{ name: inputName, data: file }] : [],
      outputs: wantsOutput ? [outputName] : [],
      onLog: ({ stream, message }) => log(message, stream)
    });
    log(`Completed with exit code ${result.exitCode}.`, 'success');
    if (result.files?.[0]) prepareDownload(result.files[0]);
  } catch (error) {
    console.error(error);
    log(error.message || String(error), 'error');
  } finally {
    runButton.disabled = false;
    loadButton.disabled = false;
  }
}

const presets = {
  version: {
    profile: 'browser-full',
    args: '-hide_banner -version',
    output: '/output.mp4'
  },
  remux: {
    profile: 'browser-full',
    args: '-hide_banner -y -threads:v 1 -i {input} -t 1 -c copy {output}',
    output: '/output.mp4'
  },
  x264: {
    profile: 'browser-full-gpl',
    args: '-hide_banner -y -filter_threads 1 -filter_complex_threads 1 -threads:v 1 -i {input} -frames:v 1 -an -threads:v 1 -c:v libx264 -preset ultrafast -tune zerolatency {output}',
    output: '/output.mp4'
  }
};

document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', async () => {
  const preset = presets[button.dataset.preset];
  profileSelect.value = preset.profile;
  argsInput.value = preset.args;
  outputInput.value = preset.output;
  await renderManifest(preset.profile);
}));

profileSelect.addEventListener('change', async () => {
  const profile = selectedProfile();
  if (runner && loadedProfileId !== profile.id) {
    runner.dispose();
    runner = null;
    loadedProfileId = null;
    setCoreStatus('Not loaded');
  }
  await renderManifest(profile.id);
});

loadButton.addEventListener('click', async () => {
  loadButton.disabled = true;
  try { await loadRuntime(profileSelect.value); }
  catch (error) { console.error(error); setCoreStatus(error.message, 'error'); }
  finally { loadButton.disabled = false; }
});
runButton.addEventListener('click', runCommand);

try {
  const response = await fetch('../catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
  catalog = await response.json();
  ffmpegPackage = catalog.packages.find((item) => item.slug === 'ffmpeg');
  if (!ffmpegPackage) throw new Error('FFmpeg package metadata was not found.');
  const versionLabel = document.querySelector('#playground-ffmpeg-version');
  const releaseLabel = document.querySelector('#playground-release-tag');
  if (versionLabel) versionLabel.textContent = ffmpegPackage.upstream.version || 'current';
  if (releaseLabel) releaseLabel.textContent = ffmpegPackage.release?.tag || 'published release';
  document.title = `FFmpeg ${ffmpegPackage.upstream.version || ''} Playground · WASM Zoo`.replace('  ', ' ');
  profileSelect.innerHTML = ffmpegPackage.profiles.filter((profile) => profile.playground !== false).map((profile) => `<option value="${profile.id}">${profile.label}</option>`).join('');
  const requestedProfile = new URLSearchParams(location.search).get('profile');
  profileSelect.value = ffmpegPackage.profiles.some((profile) => profile.id === requestedProfile) ? requestedProfile : 'browser-full';
  await renderManifest(profileSelect.value);
  if (!globalThis.crossOriginIsolated) {
    runButton.disabled = true;
    loadButton.disabled = true;
  }
} catch (error) {
  console.error(error);
  setCoreStatus(error.message, 'error');
  runButton.disabled = true;
  loadButton.disabled = true;
}
