const status = document.querySelector('#isolation-status');
const reloadKey = 'wasm-zoo-coi-reload-v1';

const setStatus = (text, state = '') => {
  if (!status) return;
  status.textContent = text;
  status.dataset.state = state;
};

if (globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
  sessionStorage.removeItem(reloadKey);
  setStatus('Ready · cross-origin isolated', 'ready');
} else if (!('serviceWorker' in navigator)) {
  setStatus('This browser does not support the Service Worker setup required by this demo.', 'error');
} else {
  try {
    setStatus('Preparing cross-origin isolation…', 'working');
    await navigator.serviceWorker.register('./coi-serviceworker.js', { scope: './' });
    await navigator.serviceWorker.ready;

    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 1500);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }

    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      location.reload();
    } else {
      setStatus('Cross-origin isolation could not be enabled. Reload once, or open this page in a current Chromium/Firefox browser.', 'error');
    }
  } catch (error) {
    console.error(error);
    setStatus(`Isolation setup failed: ${error.message}`, 'error');
  }
}
