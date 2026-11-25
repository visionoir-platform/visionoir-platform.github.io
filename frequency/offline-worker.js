// The build prepends CACHE, ASSETS and an [encoded size, integrity] entry for each URL.
async function inspectPack() {
  const keys = await caches.has(CACHE) ? await (await caches.open(CACHE)).keys() : [];
  const stored = new Set(keys.map(request => request.url));
  const missing = ASSETS.filter(path => !stored.has(new URL(path, self.location.origin).href));
  return {missing, bytes: missing.reduce((sum, path) => sum + FILES[path][0], 0)};
}

let preparing;
function preparePack() {
  if (!preparing) {
    preparing = (async () => {
      const {missing, bytes} = await inspectPack();
      if (!missing.length) return;
      const space = await self.navigator.storage?.estimate?.().catch(() => undefined);
      if (Number.isFinite(space?.quota) && Number.isFinite(space?.usage) && space.quota - space.usage < bytes) {
        throw new DOMException('Insufficient cache space', 'QuotaExceededError');
      }
      const cache = await caches.open(CACHE);
      // addAll commits the entire batch together. SRI also checks stable names
      // such as index.html during a repair that spans two Pages releases.
      await cache.addAll(missing.map(path => new Request(new URL(path, self.location.origin), {
        cache: 'reload', integrity: FILES[path][1],
      })));
    })().finally(() => { preparing = undefined; });
  }
  return preparing;
}

self.addEventListener('install', event => event.waitUntil(preparePack()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('frequency-') && key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  if (event.data === 'ready') { port.postMessage(CACHE); return; }
  if (!['frequency.inspect','frequency.prepare'].includes(event.data)) return;
  event.waitUntil((async () => {
    try {
      if (event.data === 'frequency.prepare') await preparePack();
      const {missing, bytes} = await inspectPack();
      port.postMessage({id:CACHE, missing:missing.length, bytes});
    } catch (error) {
      port.postMessage({error:error.name === 'QuotaExceededError' ? 'offlineSpace' : 'offlineRetry'});
    }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = request.mode === 'navigate' && url.pathname === '/frequency/' ? '/frequency/index.html' : url.pathname;
  if (!ASSETS.includes(path)) return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(path)).then(response=>response || fetch(request)));
});
