import { mkdir, readdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPagesCsp } from '../scripts/pages-csp.mjs';

const root = process.argv[2] || fileURLToPath(new URL('../dist/', import.meta.url));
await applyPagesCsp(root);
for (const name of ['manifest.webmanifest','icon-192.png','icon-512.png']) {
  await copyFile(new URL(name,import.meta.url), join(root,'frequency',name));
}
// Vite may fingerprint the manifest. Keep installed icon URLs relative to the stable scope.
const page=join(root,'frequency/index.html');
const html=await readFile(page,'utf8');
await writeFile(page,html.replace(/<link rel="manifest" href="[^"]+">/,'<link rel="manifest" href="/frequency/manifest.webmanifest">'));
// Distribute source and asset notices alongside the executable application.
const notices = [
  ['frequency/LICENSE','FREQUENCY-MIT.txt'],
  ['ASSET_LICENSES.md','assets.txt'],
  ['frequency/audio/vendor/NOTICE.md','MP3-encoder.txt'],
  ['frequency/audio/vendor/LGPL-3.0.txt','LGPL-3.0.txt'],
  ['frequency/audio/vendor/GPL-3.0.txt','GPL-3.0.txt'],
  ['frequency/audio/vendor/LAME-NOTICE.txt','LAME-notice.txt'],
  ['node_modules/three/LICENSE','Three-MIT.txt']
];
const noticeDir=join(root,'frequency/licenses');
await mkdir(noticeDir,{recursive:true});
for (const [source,name] of notices) await writeFile(join(noticeDir,name),await readFile(source));
const found = new Set();
const candidates = new Map();
async function walk(dir) {
  for (const entry of await readdir(dir,{withFileTypes:true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else candidates.set('/'+relative(root,path), path);
  }
}
await walk(root);
async function discover(url) {
  if (found.has(url) || !candidates.has(url)) return;
  found.add(url);
  if (!/\.(html|js|css|webmanifest)$/.test(url)) return;
  const source = await readFile(candidates.get(url), 'utf8');
  for(const match of source.matchAll(/["'(](\/?(?:\.\.?\/)?(?:assets\/)?[\w./@-]+\.(?:js|css|json|woff2?|svg|webmanifest|wasm|png))["')]/g)) {
    const target = new URL(match[1], 'https://local.invalid'+url).pathname;
    if(candidates.has(target)) await discover(target);
    else if(candidates.has('/'+match[1])) await discover('/'+match[1]);
    else if(candidates.has('/assets/'+match[1])) await discover('/assets/'+match[1]);
  }
}
await discover('/frequency/index.html');
for(const url of ['/favicon.svg','/assets/logo.svg','/assets/manrope.woff2','/assets/display.woff2','/assets/logo-geometry.json','/frequency/manifest.webmanifest','/frequency/icon-192.png','/frequency/icon-512.png']) await discover(url);
for(const url of candidates.keys()) if (url.startsWith('/frequency/') && !url.endsWith('/sw.js')) await discover(url);
const digest = createHash('sha256');
for(const url of [...found].sort()) { digest.update(url); digest.update(await readFile(candidates.get(url))); }
const version=digest.digest('hex').slice(0,14);
const paths=JSON.stringify([...found]);
const sw = `const CACHE='frequency-${version}', ASSETS=${paths};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('frequency-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>clients.claim())));
self.addEventListener('message',e=>{if(e.data==='ready')e.ports[0]?.postMessage(CACHE);});
self.addEventListener('fetch',event=>{const r=event.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin)return;
if(r.mode==='navigate'&&u.pathname==='/frequency/') {event.respondWith(caches.open(CACHE).then(c=>c.match('/frequency/index.html')).then(v=>v||fetch(r)));return}
if(ASSETS.includes(u.pathname))event.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname)).then(v=>v||fetch(r)));
});`;
await writeFile(join(root,'frequency/sw.js'),sw);
const sizes=await Promise.all([...found].map(p=>stat(candidates.get(p))));
console.log(`FREQUENCY offline · ${found.size} resources · ${sizes.reduce((s,f)=>s+f.size,0)} bytes · ${version}`);
