import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../',import.meta.url));

test('offline build ships verbatim notices, resolvable references and an accessible index', async t => {
  const output = await mkdtemp(join(tmpdir(),'frequency-notices-'));
  t.after(() => rm(output,{recursive:true,force:true}));
  const app = join(output,'frequency');
  const assets = join(output,'assets');
  await mkdir(app); await mkdir(assets);
  await writeFile(join(app,'index.html'),'<!doctype html><html><head><title>FREQUENCY</title></head><body></body></html>');
  for (const font of ['manrope','display']) await copyFile(join(root,'public/assets',font+'.woff2'),join(assets,font+'.woff2'));
  execFileSync(process.execPath,[join(root,'frequency/offline-build.mjs'),output],{cwd:root});
  const sw = await readFile(join(app,'sw.js'),'utf8');
  const cached = new Set(JSON.parse(sw.match(/ASSETS=(\[[^;]+\]);/)[1]));
  const notices = join(app,'licenses');
  // Check exact path casing even on case-insensitive macOS volumes.
  const files = new Set(await readdir(notices));
  const index = await readFile(join(notices,'index.html'),'utf8');
  for (const file of files) {
    assert.ok(cached.has('/frequency/licenses/'+file),file);
    if (file !== 'index.html') assert.ok(index.includes('href="./'+file+'"'),file);
  }
  for (const filename of ['assets.txt','MP3-encoder.txt','user-music.txt','third-party.txt']) {
    const notice = await readFile(join(notices,filename),'utf8');
    for (const [,link] of notice.matchAll(/\]\(([^)]+)\)/g)) if (!link.includes(':')) assert.ok(files.has(link),filename+' → '+link);
  }
  for (const [source,destination] of [
    ['public/assets/Manrope-LICENSE.txt','Manrope-OFL.txt'],['public/assets/Bebas-Neue-LICENSE.txt','Bebas-Neue-OFL.txt'],
    ['public/assets/anton-OFL.txt','Anton-OFL.txt'],['public/assets/earcut-ISC.txt','Earcut-ISC.txt'],
    ['node_modules/vite/LICENSE.md','Vite-NOTICES.txt'],['node_modules/three/LICENSE','Three-MIT.txt'],
    ['frequency/audio/vendor/LAME-NOTICE.txt','LAME-notice.txt'],['frequency/audio/vendor/LGPL-3.0.txt','LGPL-3.0.txt'],
    ['frequency/audio/vendor/GPL-3.0.txt','GPL-3.0.txt'],['frequency/LICENSE','FREQUENCY-MIT.txt'],
  ]) assert.deepEqual(await readFile(join(notices,destination)),await readFile(join(root,source)),destination);
  assert.ok(cached.has('/assets/manrope.woff2') && cached.has('/assets/display.woff2'));
  assert.ok(index.includes('http-equiv="Content-Security-Policy"'));
});
