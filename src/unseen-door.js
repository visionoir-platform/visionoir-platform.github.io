const key = 'visionoir-footer-entry';
const prefix = key + ':';

// Hand off to a new document in the same tab. A copied game URL carries no entry.
export function enterFromFooter(url) {
  const entry = { path: location.pathname.replace(/\/index\.html$/, '/'), time: Date.now() };
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Same-origin window names work in browsers that disable Web Storage.
    window.name = prefix + JSON.stringify({ ...entry, priorName: window.name });
  }
  location.assign(url);
}

export function acceptFooterEntry() {
  if (typeof history.state?.visionoirFooter === 'string') return true;
  let entry;
  try {
    const saved = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (saved) entry = JSON.parse(saved);
  } catch { /* Storage is optional. */ }
  if (window.name.startsWith(prefix)) {
    const saved = window.name.slice(prefix.length);
    window.name = '';
    try {
      entry = JSON.parse(saved);
      window.name = typeof entry.priorName === 'string' ? entry.priorName : '';
    } catch { return false; }
  }
  const age = Date.now() - entry?.time;
  if (!entry || !Number.isFinite(age) || age < 0 || age > 120000 || !/^\/(?:[\w-]+\/)?$/.test(entry.path)) return false;
  history.replaceState({ ...history.state, visionoirFooter: entry.path }, '');
  return true;
}
