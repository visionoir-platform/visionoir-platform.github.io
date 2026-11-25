// Access only values written by the home page. Game saves and studio projects have their own controls.
const keys = ['visionoir-language', 'visionoir-silent', 'visionoir-motion', 'visionoir-country-v1'];

export function readHomePreferences(storage) {
  const values = {};
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value !== null) values[key] = value;
  }
  return {format:'visionoir-home-preferences',version:1,values};
}

export function eraseHomePreferences(storage) {
  for (const key of keys) storage.removeItem(key);
  return keys.every(key => storage.getItem(key) === null);
}

export function bindHomePreferences({t,onErase}) {
  const box = document.getElementById('home-preferences');
  const review = box.querySelector('[data-prefs-review]');
  const notice = box.querySelector('[role=status]');
  const erase = box.querySelector('[data-prefs=erase]');
  const cancel = box.querySelector('[data-prefs=cancel]');
  let message = '';
  // Other open home pages can cancel any pending country lookup too.
  let channel;
  function connect() {
    if (channel) return;
    try {
      channel = new BroadcastChannel('visionoir-home-preferences');
      channel.onmessage = e => { if (e.data === 'erase') onErase(); };
    } catch {}
  }
  connect();
  window.addEventListener('pagehide', () => { channel?.close(); channel = null; });
  window.addEventListener('pageshow', connect);
  window.addEventListener('storage', event => {
    if (event.newValue === null && (event.key === null || keys.includes(event.key))) onErase();
  });
  const refresh = () => { notice.textContent = message ? t(message) : ''; };
  function showReview(open) {
    review.hidden = !open;
    erase.setAttribute('aria-expanded',String(open));
    (open ? cancel : erase).focus({preventScroll:true});
  }
  box.hidden = false;
  box.addEventListener('click', e => {
    const action = e.target.closest('button')?.dataset.prefs;
    if (!action) return;
    message = '';
    if (action === 'erase') { showReview(true); refresh(); return; }
    if (action === 'cancel') { showReview(false); refresh(); return; }
    try {
      if (action === 'export') {
        const contents = JSON.stringify(readHomePreferences(window.localStorage),null,2)+'\n';
        const link = document.createElement('a');
        const url = URL.createObjectURL(new Blob([contents],{type:'application/json'}));
        link.href = url;
        link.download = 'VISIONOIR-preferences.json';
        box.append(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url),1500); }
      } else if (action === 'confirm') {
        onErase();
        channel?.postMessage('erase');
        if (!eraseHomePreferences(window.localStorage)) throw Error('Incomplete erasure');
        message = 'prefsDone';
        showReview(false);
      }
    } catch { message = 'prefsError'; }
    refresh();
  });
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !review.hidden) { e.preventDefault(); showReview(false); }
  });
  box.closest('details').addEventListener('toggle',e => {
    if (!e.currentTarget.open) { review.hidden = true; erase.setAttribute('aria-expanded','false'); message=''; refresh(); }
  });
  return {refresh};
}
