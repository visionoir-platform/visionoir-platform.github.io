import assert from 'node:assert/strict';
import {readFile,stat,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {names,localePath} from '../src/locales.js';
import {tracks} from '../src/tracks.js';
const root=resolve(process.argv[2]||'dist');
const load=path=>readFile(resolve(root,path),'utf8');
for(const lang of Object.keys(names)){
 const route=localePath(lang).slice(1);
 const localized=await load(route+'index.html');
 for(const id of ['logo-scene','creator-stage','unseen-door'])assert(localized.includes('id="'+id+'"'),lang+' '+id);
 assert.match(localized,/visionoir\.platform@gmail\.com/);
 for(const [,address] of localized.matchAll(/mailto:([^?"<\\ ]+)/g))assert.equal(address,'visionoir.platform@gmail.com');
 for(const section of ['support','legal']){
  const html=await load(section+'/'+route+'index.html');
  assert(html.includes('<html lang="'+lang+'" dir="'+(lang==='ar'?'rtl':'ltr')+'"'));
  assert(html.includes('visionoir.platform@gmail.com'));
  assert(!html.includes('undefined'));
  if (section==='legal') assert(html.includes('id="requests"') && html.includes('Wikidata'));
  assert(!html.includes('https://buy.stripe.com/')&&!html.includes('revolut.me/'));
 }
}
const models={};
for(const level of ['desktop','mobile']){
 const bytes=await readFile(resolve(root,'creator/creator-'+level+'.glb'));
 assert.equal(bytes.toString('ascii',0,4),'glTF');
 const chunk=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
 assert(!chunk.animations?.length&&!chunk.skins?.length);
 assert(chunk.meshes?.length>0);
 models[level]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
assert(models.mobile.bytes<models.desktop.bytes);assert((await stat(resolve(root,'creator/poster.webp'))).size>10000);
const sw=await load('frequency/sw.js');
const manifest=JSON.parse(await load('frequency/manifest.webmanifest'));
assert.equal(manifest.scope,'/frequency/');
assert(!/creator-desktop|creator-mobile|\/unseen\/|\.mp3/.test(sw));
const assets=JSON.parse(sw.match(/ASSETS=(\[[^;]+\]);/)?.[1]||'[]');
assert(assets.some(p=>p.includes('processor-')));assert(assets.some(p=>p.includes('export-worker-')));
for(const p of assets)assert((await stat(resolve(root,'.'+p))).isFile());
const hashes=new Set();
for(const track of tracks){
 const asset=await readFile(resolve(root,'assets',track.file));
 hashes.add(createHash('sha256').update(asset).digest('hex'));
}
assert.equal(hashes.size,6);
const disallowed=/(?:^|\/)(?:pasted-text|Animazione\(1\)|\.env|FREQUENCY_MASTER_SPEC|VISIONOIR_FISCAL_REVIEW|__pycache__|private-unseen-build)/i;
for(const path of await readdir(root,{recursive:true}))assert(!disallowed.test(path),'Private resource '+path);
console.log(JSON.stringify({locales:Object.keys(names).length,distinctSiteTracks:hashes.size,models,offlineResources:assets.length},null,2));
