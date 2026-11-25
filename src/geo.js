export function storageValue(key, value) {
  try {
    if (value !== undefined) localStorage.setItem(key,value);
    else return localStorage.getItem(key);
  } catch { /* Storage can be unavailable in private and embedded browsers. */ }
}

export async function approximateCountry(endpoint, timeout = 420, signal) {
  if (!endpoint || signal?.aborted) return null;
  const key = 'visionoir-country-v1';
  try {
    const cached = JSON.parse(storageValue(key) || 'null');
    if (/^[A-Z]{2}$/.test(cached?.country) && cached.expires > Date.now()) return cached.country;
  } catch { /* Ignore stale or invalid cache. */ }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  let timer;
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(null); },timeout);
  });
  const result = fetch(endpoint, {
    signal:controller.signal, credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store',
  }).then(async response => {
    if (!response.ok) return null;
    const { country } = await response.json();
    return /^[A-Z]{2}$/.test(country) ? country : null;
  }).catch(()=>null);
  try {
    const country = await Promise.race([result,deadline]);
    if (signal?.aborted) return null;
    if (country) storageValue(key,JSON.stringify({country,expires:Date.now()+6*3600e3}));
    return country;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',abort);
  }
}
