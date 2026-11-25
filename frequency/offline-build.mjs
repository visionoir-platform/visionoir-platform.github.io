import { readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDistributionNotices } from './distribution-notices.mjs';
import { applyPagesCsp } from '../scripts/pages-csp.mjs';

const root = process.argv[2] || fileURLToPath(new URL('../dist/', import.meta.url));
for (const name of ['manifest.webmanifest','icon-192.png','icon-512.png']) {
  await copyFile(new URL(name,import.meta.url), join(root,'frequency',name));
}
// Vite may fingerprint the manifest. Keep installed icon URLs relative to the stable scope.
const page=join(root,'frequency/index.html');
const html=await readFile(page,'utf8');
await writeFile(page,html.replace(/<link rel="manifest" href="[^"]+">/,'<link rel="manifest" href="/frequency/manifest.webmanifest">'));
await writeDistributionNotices(join(root,'frequency/licenses'));
await applyPagesCsp(root);
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
for(const url of ['/favicon.svg','/assets/logo.svg','/assets/manrope.woff2','/assets/display.woff2','/frequency/manifest.webmanifest','/frequency/icon-192.png','/frequency/icon-512.png']) await discover(url);
for(const url of candidates.keys()) if (url.startsWith('/frequency/') && !url.endsWith('/sw.js')) await discover(url);
// The estimate is available before registration, including when installation fails.
const infoPath = '/frequency/offline-package.json';
found.delete(infoPath);
const files = {};
const contents = new Map();
for (const path of found) contents.set(path,await readFile(candidates.get(path)));
const bytes = [...contents.values()].reduce((sum, data) => sum + data.length, 0);
let total = bytes, info;
do {
  info = Buffer.from(JSON.stringify({bytes:total, fileCount:found.size+1}));
  if (total === bytes+info.length) break;
  total = bytes+info.length;
} while (true);
await writeFile(join(root,infoPath), info);
found.add(infoPath);
contents.set(infoPath,info);
const digest = createHash('sha256');
for (const path of [...found].sort()) {
  const data = contents.get(path);
  digest.update(path).update(data);
  files[path] = [data.length, 'sha256-'+createHash('sha256').update(data).digest('base64')];
}
const version=digest.digest('hex').slice(0,14);
const worker = await readFile(new URL('offline-worker.js',import.meta.url),'utf8');
const sw = `const CACHE='frequency-${version}', ASSETS=${JSON.stringify([...found])};\nconst FILES=${JSON.stringify(files)};\n${worker}`;
await writeFile(join(root,'frequency/sw.js'),sw);
console.log(`FREQUENCY offline · ${found.size} resources · ${total} bytes · ${version}`);
