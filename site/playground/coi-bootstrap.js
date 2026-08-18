const status = document.querySelector('#isolation-status');
const reloadKey = 'wasm-zoo-coi-reload-v2';
const rootScopeUrl = new URL('../', location.href).href;
const rootWorkerUrl = new URL('../coi-serviceworker.js', location.href).href;
const legacyScopeUrl = new URL('./', location.href).href;

const setStatus = (text, state = '') => {
  if (!status) return;
  status.textContent = text;
  status.dataset.state = state;
};

const normalize = (value) => new URL(value).href;

async function unregisterLegacyPlaygroundWorker() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  let removed = false;
  for (const registration of registrations) {
    if (normalize(registration.scope) !== legacyScopeUrl) continue;
    removed = (await registration.unregister()) || removed;
  }
  return removed;
}

async function ensureRootIsolationWorker() {
  const removedLegacy = await unregisterLegacyPlaygroundWorker();
  const registration = await navigator.serviceWorker.register(rootWorkerUrl, { scope: rootScopeUrl });

  // navigator.serviceWorker.ready may resolve an older controller during a
  // migration. Wait for this exact root registration to become active.
  if (!registration.active) {
    await new Promise((resolve) => {
      const candidate = registration.installing || registration.waiting;
      if (!candidate) return resolve();
      const done = () => {
        if (candidate.state === 'activated' || candidate.state === 'redundant') resolve();
      };
      candidate.addEventListener('statechange', done);
      done();
    });
  }

  const controllerUrl = navigator.serviceWorker.controller?.scriptURL;
  const controlledByRoot = controllerUrl && normalize(controllerUrl) === rootWorkerUrl;
  return { removedLegacy, controlledByRoot };
}

if (globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
  // Even if the document is already isolated by the old /playground/ worker,
  // migrate to the root-scoped worker. Pthread worker clients live under
  // /assets/** and must be controlled too.
  if ('serviceWorker' in navigator) {
    try {
      const { removedLegacy, controlledByRoot } = await ensureRootIsolationWorker();
      if (removedLegacy || !controlledByRoot) {
        sessionStorage.setItem(reloadKey, '1');
        location.reload();
      } else {
        sessionStorage.removeItem(reloadKey);
        setStatus('Ready · cross-origin isolated', 'ready');
      }
    } catch (error) {
      console.error(error);
      setStatus(`Isolation setup failed: ${error.message}`, 'error');
    }
  } else {
    setStatus('Ready · cross-origin isolated', 'ready');
  }
} else if (!('serviceWorker' in navigator)) {
  setStatus('This browser does not support the Service Worker setup required by this demo.', 'error');
} else {
  try {
    setStatus('Preparing site-wide cross-origin isolation…', 'working');
    const { removedLegacy, controlledByRoot } = await ensureRootIsolationWorker();

    if (removedLegacy || !controlledByRoot || !globalThis.crossOriginIsolated) {
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1');
        location.reload();
      } else {
        setStatus('Cross-origin isolation could not be enabled. Reload once, or open this page in a current Chromium/Firefox browser.', 'error');
      }
    } else {
      sessionStorage.removeItem(reloadKey);
      setStatus('Ready · cross-origin isolated', 'ready');
    }
  } catch (error) {
    console.error(error);
    setStatus(`Isolation setup failed: ${error.message}`, 'error');
  }
}
