import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,readdir,stat } from 'node:fs/promises';
import { resolve,relative } from 'node:path';
import { STAGES,HEROES,BOSSES } from '../engine/index.js';
import { catalogs } from '../ui/catalogs.mjs';

const dist=resolve(process.argv[2]||'dist');
const data=async file=>JSON.parse(await readFile(resolve(dist,file),'utf8'));
const text=file=>readFile(resolve(dist,file),'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const all=await catalogs(),music=await data('unseen/audio/soundtrack.json'),fx=await data('unseen/audio/sound-effects.json');
assert.equal(STAGES.length,21);assert.equal(STAGES.filter(x=>x.special).length,7);assert.equal(HEROES.length,5);
assert.equal(new Set(STAGES.filter(x=>!x.special).flatMap(x=>x.bosses)).size,16);
assert.equal(BOSSES.length,23);assert.equal(music.length,39);assert.equal(fx.length,118);
assert.deepEqual(music.map(t=>t.id),Array.from({length:39},(_,i)=>String(i+1).padStart(2,'0')));
const sums=new Set();const register=[];
for(const item of [...music,...fx]){
  assert(item.file.startsWith('/unseen/audio/') && !item.file.includes('..'));
  assert(item.credits && item.license && item.provenance && item.scenes?.length && item.duration>0,item.id);
  if(item.loop)assert(item.loop.start>=0 && item.loop.end<=item.duration+.05 && item.loop.end>item.loop.start);
  const buf=await readFile(resolve(dist,item.file.slice(1)));assert.equal(buf.toString('ascii',4,8),'ftyp');
  const signature=hash(buf);assert(!sums.has(signature));sums.add(signature);register.push({id:item.id,file:item.file,sha256:signature});
}
const validated=JSON.parse(await readFile(new URL('./audio-digests.json',import.meta.url),'utf8'));
assert.deepEqual(register,validated);
const art=await data('unseen/art/provenance.json');
assert.equal(art.profile,'VISIONOIR ORIGINAL');
for(const file of art.files){const b=await readFile(resolve(dist,'unseen/art',file));assert.equal(b.subarray(1,4).toString(),'PNG');}
const folders=await readdir(dist,{recursive:true});
assert(!folders.some(s=>/(?:__fan-art|fan-studio|\.wav$|\.als$|\.mid$|\.zip$|driver\.dev|codex-clipboard|UNSEEN_PROTOCOL_MASTER_SPEC)/i.test(s)));
const bundles=(await readdir(resolve(dist,'assets'))).filter(s=>/^unseen-.*\.js$/.test(s));assert.equal(bundles.length,1);
const runtime=await text('assets/'+bundles[0]);
for(const forbidden of ['__fan-art','SONIC: VISIONOIR','__unseenQA'])assert(!runtime.includes(forbidden),'Public runtime includes '+forbidden);
for(const [l,rows] of Object.entries(all)){
  const html=await text(l.toLowerCase()+'/index.html');assert(html.includes('id="unseen-door"'));assert(html.includes('visionoir.platform@gmail.com'));assert(html.includes('packX'));assert(!html.includes('/unseen/audio/'));
  assert.deepEqual(await data('unseen/i18n/'+l+'.json'),rows);
  const soundNames=await data('unseen/audio/names/'+l+'.json');assert.equal(Object.keys(soundNames).length,fx.length);for(const e of fx)assert(soundNames[e.id]);
}
const cover=await text('unseen/index.html');assert(cover.includes('The Unseen Protocol') && cover.includes(bundles[0]));
assert(cover.includes('name="robots" content="noindex, nofollow"'));
assert(!(await text('sitemap.xml')).includes('/unseen/'));
const reference=JSON.parse(await readFile(new URL('../research/sound-reference.json',import.meta.url),'utf8'));
assert.equal(reference.files.length,118);
console.log(JSON.stringify({profile:art.profile,stageCount:STAGES.length,campaignBosses:16,guardians:7,music:music.length,effects:fx.length,artwork:art.files.length,languages:Object.keys(all).length,catalogKeys:Object.keys(all.it).length,bundleBytes:(await stat(resolve(dist,'assets',bundles[0]))).size}));
