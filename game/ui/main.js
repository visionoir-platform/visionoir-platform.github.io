import './style.css';
import { names,matchLocale } from '../../src/locales.js';
import { acceptFooterEntry } from '../../src/unseen-door.js';
import { STAGES,HEROES,BOSSES,createRun,step,groundAt,canEnter,sanitizeProgress,finishRun,rankOf } from '../engine/index.js';
import { playCinematic } from '../art/cinematic.js';
import { createCadence } from './cadence.js';
import { checkpointOf,restoreCheckpoint } from './checkpoint.js';
import { createRenderer } from '../art/render.js';
import { heroLine,objectiveLine,bossLine } from './narrative.js';
import { defaultKeys,defaultPad,createInput } from './input.js';
import { clock,mountLab } from './lab.js';

const root=document.querySelector('#screen'),select=document.querySelector('#lang');
const safe=(s)=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const el=(selector)=>root.querySelector(selector);
const button=(id,label,attributes='')=>'<button type="button" data-act="'+id+'" '+attributes+'>'+label+'</button>';
const mainKey='visionoir-unseen-save-v1',settingsKey='visionoir-unseen-settings-v1';
const storage={read(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},write(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}};
const bounded=(x,a,b,otherwise)=>typeof x==='number'&&Number.isFinite(x)?Math.max(a,Math.min(b,x)):otherwise;
const saved=storage.read(settingsKey)||{};
const settings={volume:bounded(saved.volume,0,100,40),music:bounded(saved.music,0,100,82),sfx:bounded(saved.sfx,0,100,80),scale:bounded(saved.scale,75,120,100),opacity:bounded(saved.opacity,35,100,88),side:!!saved.side,mute:!!saved.mute,motion:saved.motion??!matchMedia('(prefers-reduced-motion: reduce)').matches,keys:{...defaultKeys},pad:{...defaultPad}};
for(const key of Object.keys(defaultKeys)){
  if(typeof saved.keys?.[key]==='string' && /^[A-Za-z0-9]{2,24}$/.test(saved.keys[key]))settings.keys[key]=saved.keys[key];
  if(Number.isInteger(saved.pad?.[key])&&saved.pad[key]>=0&&saved.pad[key]<40)settings.pad[key]=saved.pad[key];
}
const initialSave=storage.read(mainKey);
let progress=sanitizeProgress(initialSave),hero=progress.lastHero,mode='story',target=0;
let savedMark=initialSave?.checkpoint||null,loadMark=false;
const saveProgress=()=>storage.write(mainKey,{...progress,checkpoint:savedMark});
const fan=import.meta.env.VITE_UNSEEN_PROFILE==='fan';
const art=fan?'/__fan-art/':'/unseen/art/';
const heroNames=fan?['Sonic','Shadow','Silver','Knuckles','Tails']:HEROES.map(v=>v.name);
const formNames=fan?['Chrome Ascension','Obsidian Chaos','Quantum Ascension','Crimson Overdrive','Solar Circuit']:['Perihelion','Null Echo','Tidal Field','Redshift','Solar Loom'];
const feats=['velocity','phase','gravity','impact','engineer'],zoneKeys=['neon','forge','arcade','frost','aura','orbit','fortress','moon'];
let siteLang;try{siteLang=localStorage.getItem('visionoir-language');}catch{}
const available=Object.keys(names);
let lang=matchLocale(new URLSearchParams(location.search).get('lang'),available)||matchLocale(siteLang,available)||navigator.languages.map(l=>matchLocale(l,available)).find(Boolean)||'it';
let dict={},localeToken=0,page='title',pageSource='menu',storyCards=[],sceneIndex=0,sceneNext,sceneTitle='',sceneArt=0,active=false;
const cadence=createCadence();
let hudAt=0;
let run=null,portalReturn=null,lab=null,renderer=null,renderPromise=null,audio,gameHasFocus=false,prevStamp=0,lastHud='',musicTimer=0,revision=0;
let sceneKind=null,sceneBoss=0;
let effectNames={},messageTimer,labValues,stopCinema=null;
const canvas=document.createElement('canvas');canvas.id='world';canvas.width=480;canvas.height=270;
const t=k=>dict[k]??k;
const notify=s=>{const box=document.querySelector('#message');box.textContent=s;clearTimeout(messageTimer);messageTimer=setTimeout(()=>box.textContent='',3200);};
function applySettings(){
  storage.write(settingsKey,settings);
  document.documentElement.classList.toggle('still',!settings.motion);
  document.documentElement.style.setProperty('--pad-size',settings.scale+'%');
  document.documentElement.style.setProperty('--pad-opacity',settings.opacity/100);
  audio?.setVolume(settings.mute?0:settings.volume/100,settings.music/100,settings.sfx/100);
}
const volume=value=>{settings.volume=value;applySettings();};
function music(id,loop=true){clearTimeout(musicTimer);if(!id || !active || !audio)return;void audio.play(String(id).padStart(2,'0'),{loop}).catch(()=>{if(!document.hidden)notify(t('error'));});}
function fx(id){if(!active||!audio)return;void audio.sfx(id).catch(()=>{});}
const home=document.querySelector('#home');
function returnToStudio(event){
  if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  if(!['/','/'+lang.toLowerCase()+'/'].includes(history.state?.visionoirFooter) || history.length<2)return;
  event.preventDefault();audio?.stop();history.back();
}
document.addEventListener('click',e=>{if(e.target.closest('#home,.back-site'))returnToStudio(e);});
function updateLocaleChrome(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  select.value=lang;select.setAttribute('aria-label',t('language'));home.href='/'+lang.toLowerCase()+'/#unseen-door';
}
async function language(next,initial=false){
  const serial=++localeToken;
  const res=await fetch('/unseen/i18n/'+encodeURIComponent(next)+'.json');
  if(!res.ok)throw Error('Language unavailable');
  const data=await res.json();if(serial!==localeToken)return;
  lang=next;dict=data;updateLocaleChrome();effectNames={};
  if(page==='lab')await loadEffectNames();
  if(!initial){const url=new URL(location.href);url.searchParams.set('lang',lang);history.replaceState(history.state,'',url);try{localStorage.setItem('visionoir-language',lang);}catch{}}
  if(serial===localeToken)render(true);
}
async function loadEffectNames(){
  const target=lang;
  try{const res=await fetch('/unseen/audio/names/'+target+'.json');if(res.ok){const data=await res.json();if(target===lang)effectNames=data;}}catch{}
}
select.innerHTML=available.map(k=>'<option value="'+k+'" lang="'+k+'">'+names[k]+'</option>').join('');
select.onchange=()=>{if(page==='play')pauseRun();language(select.value).catch(()=>notify(t('error')));};
function header(title){
  return '<div class="page-head">'+button('back','← '+t('back'))+'<h1>'+safe(title)+'</h1></div>';
}
function focusScreen(){root.focus({preventScroll:true});window.scrollTo(0,0);}
function go(next,{track,from}={}){
  if(from)pageSource=from;
  if(lab){lab.destroy();lab=null;labValues=null;}
  ++revision;clearTimeout(musicTimer);input.cancel();input.clear();
  page=next;gameHasFocus=next==='play';if(!gameHasFocus)document.body.classList.remove('in-play');
  if(track)music(track);
  render();focusScreen();
}
function photo(i,large=false){
  return '<span aria-hidden="true" class="portrait'+(large?' large':'')+'" style="--hero:'+i+';--portrait:url('+art+(large && settings.motion && !fan?'portraits-motion.png':'portraits.png')+')"></span>';
}
function startScene({title,cards,zone=0,track=1,next,kind=null,boss=0}){
  sceneKind=kind;sceneBoss=boss;
  storyCards=cards;sceneIndex=0;sceneNext=next;sceneTitle=title;sceneArt=zone;go('scene',{track});
}
function scene(){
  const card=storyCards[sceneIndex];
  return '<section class="cinema" style="--sky:url(/unseen/art/sky-'+sceneArt+'.png);--far:url(/unseen/art/scenery-'+sceneArt+'-0.png);--near:url(/unseen/art/scenery-'+sceneArt+'-1.png)"><div class="scene-far"></div><div class="scene-near"></div><canvas class="film" width="480" height="270" aria-hidden="true"></canvas><div class="dialogue">'+(typeof card.actor==='number'?photo(card.actor):'')+'<div><p class="over">'+safe(typeof card.actor==='number'?heroNames[card.actor]:card.actor||sceneTitle)+'</p><h2>'+safe(t(card.line))+'</h2><p class="scene-nav">'+button('scene-next',t('next')+' →','class="primary"')+button('scene-skip',t('skip'))+'</p></div></div></section>';
}
function sceneFor(stage){return stage.special?objectiveLine(stage.id):zoneKeys[stage.zone];}
function stageIntro(id,withHero=true){
  const stage=STAGES[id];
  startScene({title:stage.title,cards:[{actor:stage.title,line:sceneFor(stage)},...(withHero?[{actor:hero,line:heroLine(hero)}]:[])],zone:stage.zone,track:stage.track,next:()=>startRun(id)});
}
function startRun(id,existing=null){
  run=existing||createRun({stage:id,hero,mode,cores:progress.cores});target=id;
  if(existing)run.cores=[...progress.cores];
  else if(loadMark){restoreCheckpoint(run,savedMark,groundAt);loadMark=false;}
  audio?.special(run.stage.special?id-13:0);audio?.transform(run.player.super,hero);audio?.setIntensity(.2);
  cadence.reset();prevStamp=0;lastHud='';go('play',{track:mode==='time'?37:mode==='rush'?38:run.stage.track});
}
function pauseRun(){
  if(page!=='play')return;clearTimeout(musicTimer);audio?.pause();go('pause');
}
function resumeRun(){
  if(!run){go('menu',{track:2});return;}prevStamp=0;go('play');
  if(run.boss){music(run.boss.track||((run.boss.id===15)?28:23));}else if(audio?.state().id)audio.resume().catch(()=>notify(t('error')));else music(run.stage.track);
}
function newStory(){loadMark=false;mode='story';target=0;hero=progress.lastHero;portalReturn=null;go('heroes',{track:3,from:'story'});}
function footerReturn(){return '<a class="back-site" href="/'+lang.toLowerCase()+'/#unseen-door">↗ VISIONOIR</a>';}
function title(){
  return '<section class="title-screen"><div class="cover-art"></div><div class="cover-type"><p class="over" dir="ltr">VISIONOIR / NOIR CITY</p><h1 lang="en" dir="ltr">'+(fan?'<span class="fan-title">SONIC: VISIONOIR</span>':'')+'<span>THE UNSEEN</span><span>PROTOCOL<i>.</i></span></h1><p class="synopsis">'+safe(t('synopsis'))+'</p>'+button('start',t('start')+' <span aria-hidden="true">↗</span>','class="primary start"')+'</div></section>';
}
function menu(){
  return '<section class="menu-page"><div class="menu-cover"><img src="/unseen/art/noir-city.png" alt=""><h1 lang="en">The Unseen<br>Protocol</h1></div><div class="menu-list">'+['story','continue','trial','rush','stages','extras','options','credits'].map(k=>button(k,safe(t(k))+' <span aria-hidden="true">'+(k==='rush'&&!progress.storyEnding?'◇':'→')+'</span>',((k==='rush'&&!progress.storyEnding)||(k==='continue'&&!progress.cleared.length&&!savedMark))?'disabled title="'+safe(t('locked'))+'"':'')).join('')+footerReturn()+'</div></section>';
}
const stageList=()=>'<div class="page">'+header(t(mode==='time'?'trial':'stages'))+'<div class="stage-grid">'+STAGES.map(s=>{
  const open=canEnter(progress,s.id,mode);return button('stage-'+s.id,'<small>'+String(s.id+1).padStart(2,'0')+' / '+t(s.special?'bonus':'campaign')+'</small><b dir="auto">'+safe(s.title)+'</b><span>'+(!open?t('locked'):progress.cleared.includes(s.id)?'✓':'→')+'</span>',open?'':'disabled');
}).join('')+'</div></div>';
function heroes(){
  return '<div class="page">'+header(t('heroes'))+'<div class="hero-list">'+HEROES.map((h,i)=>button('hero-'+i,photo(i,true)+'<b>'+safe(heroNames[i])+'</b><span>'+safe(t(feats[i]))+'</span><small>'+safe(formNames[i])+'</small>','style="--hero-color:'+h.accent+'" aria-pressed="'+(hero===i)+'"')).join('')+'</div><div class="bottom-actions">'+button('launch',t('choose')+' →','class="primary"')+'</div></div>';
}
function options(){
  const slider=(key,min,max)=>'<label>'+safe(t(key))+'<input type="range" data-set="'+key+'" min="'+min+'" max="'+max+'" value="'+settings[key]+'"></label>';
  return '<div class="page">'+header(t('options'))+'<div class="options-grid"><section><h2>'+t('volume')+'</h2>'+slider('volume',0,100)+slider('music',0,100)+slider('sfx',0,100)+button('mute',t('mute'),'aria-pressed="'+settings.mute+'"')+'</section><section><h2>'+t('controls')+'</h2>'+slider('scale',75,120)+slider('opacity',35,100)+button('side',t('side'),'aria-pressed="'+settings.side+'"')+button('motion',t('movement'),'aria-pressed="'+settings.motion+'"')+'</section><section class="keys">'+Object.keys(defaultKeys).map(k=>button('bind-'+k,'<span>'+t(k)+'</span><kbd>'+safe(settings.keys[k].replace(/^Key/,''))+' / '+settings.pad[k]+'</kbd>')).join('')+'</section><section>'+button('lab',t('lab'))+button('export',t('save'))+'<label class="file">'+t('load')+'<input type="file" id="import" accept=".json,application/json"></label></section></div></div>';
}
function extras(){
  const stageIds=[...new Set(progress.cleared)];
  return '<div class="page">'+header(t('extras'))+'<div class="bottom-actions">'+button('lab',t('lab'),'class="primary"')+button('records',t('records'))+'</div><h2>'+t('replay')+'</h2><div class="stage-grid">'+button('prologue',t('story'))+stageIds.map(i=>button('replay-'+i,safe(STAGES[i].title))).join('')+(progress.storyEnding?button('ending',t('ending')):'')+(progress.secretEnding?button('trueEnd',t('trueEnd')):'')+'</div></div>';
}
function credits(){
  return '<div class="page credits">'+header(t('credits'))+'<p class="over">VISIONOIR</p><h2>'+safe(t('original'))+'</h2><p>'+t('direction')+'<br><b>Flavio Giorgio Guarini</b></p><p>VISIONOIR · Logo<br><b>Maria Bellini</b></p><p>'+t('aiCredit')+'</p><p lang="en">© 2026 Flavio Giorgio Guarini. All rights reserved for original contributions.</p>'+(fan?'<p lang="en">An independent fan project by VISIONOIR. Sonic and related characters belong to their respective owners. Unofficial and unaffiliated with SEGA.</p>':'')+footerReturn()+'</div>';
}
function records(){
  return '<div class="page">'+header(t('records'))+'<div class="record-list">'+(Object.entries(progress.records).length?Object.entries(progress.records).map(([key,v])=>{const [m,s,h]=key.split(':');return '<p><b>'+safe(STAGES[+s].title)+'</b> · '+heroNames[+h]+' · '+t(({time:'trial',rush:'rush',story:'story'})[m])+' · '+clock(v.time)+' · '+v.rank+'</p>';}).join(''):'<p>—</p>')+'</div></div>';
}
const hudButtons={left:'←',right:'→',up:'↑',down:'↓',jump:'↥',attack:'✦',special:'◈',transform:'✧',dash:'»'};
function playScreen(){
  const pad=keys=>keys.map(k=>'<button type="button" data-input="'+k+'" aria-label="'+t(k)+'"><span aria-hidden="true">'+hudButtons[k]+'</span><small>'+t(k)+'</small></button>').join('');
  root.innerHTML='<section class="arena"><div class="hud"><div><span class="over">'+safe(heroNames[hero])+'</span><strong>'+safe(run.stage.title)+'</strong></div><div class="readout" id="telemetry"></div>'+button('pause','Ⅱ','aria-label="'+t('pause')+'"')+'</div><div class="viewport"></div><div class="pad'+(settings.side?' mirrored':'')+'" dir="ltr"><div class="dpad">'+pad(['up','left','down','right'])+'</div><div class="actionpad">'+pad(['dash','transform','special','attack','jump'])+'</div></div><p class="instructions">'+t(run.stage.special?objectiveLine(run.stageId):'help')+'</p></section>';
  el('.viewport').append(canvas);input.bindTouch(root);document.body.classList.add('in-play');lastHud='';
  if(!renderPromise){
    renderPromise=createRenderer(canvas,{hero,zone:run.stage.zone,characterBase:art,reducedMotion:()=>!settings.motion}).then(x=>renderer=x).catch(()=>{renderPromise=null;pauseRun();notify(t('error'));});
  }
  renderer?.draw(run);
}
function result(){
  return '<div class="page results">'+header(t(run.status==='won'?'done':'lost'))+'<p class="over">'+safe(run.stage.title)+'</p><h2>'+safe(heroNames[hero])+'</h2><dl>'+[['score',run.score],['time',clock(run.time)],['rings',run.rings],['secrets',run.secrets],['rank',rankOf(run)]].map(([k,v])=>'<div><dt>'+t(k)+'</dt><dd>'+safe(v)+'</dd></div>').join('')+'</dl><div class="bottom-actions">'+button(run.status==='won'?'after':'retry',t(run.status==='won'?'next':'retry'),'class="primary"')+button('leave',t('exit'))+'</div></div>';
}
function render(localized=false){
  stopCinema?.();stopCinema=null;
  if(lab){labValues=lab.snapshot();lab.destroy(false);lab=null;}
  if(page==='play'){root.dataset.page=page;playScreen();return;}
  if(page==='lab'){
    root.dataset.page=page;lab=mountLab({node:root,audio,t,button,html:safe,back,settings,volume,notify,prior:labValues,effectName:id=>effectNames[id]||id});return;
  }
  const surfaces={title,menu,scene,stages:stageList,heroes,extras,options,credits,records,result,
    pause:()=>'<div class="page pause-page">'+header(t('pause'))+'<h2>'+safe(run.stage.title)+'</h2><div class="bottom-actions">'+['resume','retry','options','leave'].map(k=>button(k,t(k==='leave'?'exit':k),k==='resume'?'class="primary"':'')).join('')+'</div></div>'};
  root.innerHTML=surfaces[page]();root.dataset.page=page;
  if(page==='scene'){
    const line=storyCards[sceneIndex]?.line;
    const kind=sceneKind||(line==='prologue'?'prologue':line==='threat'?'boss':line==='secretEnd'?'secret':line==='normalEnd'?'ending':line==='post'?'credits':'zone');
    stopCinema=playCinematic(el('.film'),{zone:sceneArt,hero,kind,bossId:sceneBoss,characterBase:art,reducedMotion:!settings.motion});
  }
}
function back(){
  if(page==='title')return home.click();
  if(page==='play')return pauseRun();
  if(page==='pause')return resumeRun();
  if(page==='lab')return go(labOrigin,{track:labOrigin==='extras'?6:5});
  if(page==='options' && pageSource==='pause')return go('pause');
  if(page==='records')return go('extras',{track:6});
  if(page==='menu')return go('title',{track:2});
  if(page==='scene'){sceneNext?.();return;}
  if(page==='heroes' && pageSource==='stages')return go('stages',{track:4});
  go('menu',{track:2});
}
let labOrigin='extras';
async function enterLab(){
  const origin=page,serial=revision;
  try{await Promise.all([audio.load(),loadEffectNames()]);if(serial!==revision)return;
    labOrigin=origin;audio.stop();audio.setIntensity(0);audio.special(0);audio.transform(false);go('lab');
  }catch{notify(t('error'));}
}
function ending(secret,replay=false){
  startScene({title:t(secret?'trueEnd':'ending'),zone:secret?7:0,track:secret?35:34,cards:[{actor:hero,line:secret?'secretEnd':'normalEnd'},{line:'post'}],next:()=>go(replay?'extras':'credits',{track:replay?6:36})});
}
function continueAfter(){
  if(portalReturn){
    const previous=portalReturn;portalReturn=null;startRun(previous.stageId,previous);return;
  }
  if(mode!=='story')return go('records',{track:39});
  if(run.stageId===12||run.stageId===13)return ending(run.stageId===13);
  if(run.stage.special)return go('stages',{track:4});
  stageIntro(run.stageId+1,false);
}
function saveFile(){
  const url=URL.createObjectURL(new Blob([JSON.stringify({...progress,checkpoint:savedMark})],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='visionoir-unseen-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function importFile(file){
  if(!file)return;
  try{if(file.size>150000)throw Error();const data=JSON.parse(await file.text());
    if(data?.version!==1||!Array.isArray(data.cleared)||!Array.isArray(data.cores)||!data.records||typeof data.records!=='object')throw Error();
    progress=sanitizeProgress(data);savedMark=data.checkpoint||null;saveProgress();notify(t('saved'));
  }catch{notify(t('badSave'));}
}
root.addEventListener('input',event=>{const k=event.target.dataset.set;if(k&&['volume','music','sfx','scale','opacity'].includes(k)){settings[k]=+event.target.value;applySettings();}});
root.addEventListener('change',e=>{if(e.target.id==='import')void importFile(e.target.files[0]);});
root.addEventListener('click',event=>{
  const action=event.target.closest('[data-act]')?.dataset.act;if(!action||page==='lab')return;
  if(action==='start'){active=true;go('menu',{track:2});return;}
  fx(action==='back'?'menu-back':'menu-select');
  if(action==='back')return back();
  if(action==='story')return newStory();
  if(action==='continue'){
    mode='story';portalReturn=null;
    loadMark=!!savedMark && canEnter(progress,savedMark.stage) && !!HEROES[savedMark.hero];
    hero=loadMark?savedMark.hero:progress.lastHero;return stageIntro(loadMark?savedMark.stage:progress.lastStage);
  }
  if(action==='trial'||action==='stages'){mode=action==='trial'?'time':'story';portalReturn=null;return go('stages',{track:4});}
  if(action==='rush'&&progress.storyEnding){mode='rush';target=12;portalReturn=null;return go('heroes',{track:38,from:'rush'});}
  if(action.startsWith('stage-')){target=+action.slice(6);if(canEnter(progress,target,mode))go('heroes',{track:3,from:'stages'});return;}
  if(action.startsWith('hero-')){hero=+action.slice(5);render();el('[data-act="'+action+'"]')?.focus();return;}
  if(action==='launch'){
    if(pageSource==='story')return startScene({title:'NOIR CITY',cards:[{line:'prologue'},{actor:'Dr. Larpking',line:'threat'}],track:1,next:()=>stageIntro(target)});
    return stageIntro(target);
  }
  if(action==='scene-next' && sceneIndex+1<storyCards.length){sceneIndex++;render();el('[data-act=scene-next]')?.focus();return;}
  if(action==='scene-next'||action==='scene-skip')return sceneNext?.();
  if(action==='options')return go('options',{from:page,track:page==='pause'?undefined:5});
  if(action==='extras'||action==='credits'||action==='records')return go(action,{track:{extras:6,credits:36,records:39}[action]});
  if(action==='lab')return void enterLab();
  if(action==='prologue')return startScene({title:'NOIR CITY',cards:[{line:'prologue'},{actor:'Dr. Larpking',line:'threat'}],next:()=>go('extras',{track:6})});
  if(action==='ending'||action==='trueEnd')return ending(action==='trueEnd',true);
  if(action.startsWith('replay-')){const s=STAGES[+action.slice(7)];return startScene({title:s.title,zone:s.zone,track:s.track,cards:[{line:sceneFor(s)}],next:()=>go('extras',{track:6})});}
  if(action==='pause')return pauseRun();if(action==='resume')return resumeRun();
  if(action==='retry')return startRun(run.stageId);
  if(action==='leave'){if(portalReturn){const r=portalReturn;portalReturn=null;return startRun(r.stageId,r);}run=null;return go('menu',{track:2});}
  if(action==='after')return continueAfter();
  if(['side','mute','motion'].includes(action)){settings[action]=!settings[action];applySettings();render();el('[data-act="'+action+'"]')?.focus();return;}
  if(action==='export')return saveFile();
  if(action.startsWith('bind-')){notify(t('rebind'));input.rebind(action.slice(5));}
});
const input=createInput({settings,playing:()=>gameHasFocus,onPause:pauseRun,changed:()=>{applySettings();render();notify('✓');},
  menu:action=>{
    if(action==='back')return back();
    const nodes=[...document.querySelectorAll('button:not(:disabled),a[href],select,input:not([type=file])')].filter(n=>n.getClientRects().length);
    if(!nodes.length)return;
    const i=nodes.indexOf(document.activeElement);
    if(action==='select'){(nodes[i]||nodes[0]).click();return;}
    const next=i<0?0:(i+(action==='prev'?-1:1)+nodes.length)%nodes.length;nodes[next].focus();
  }});
window.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&!event.defaultPrevented&&page!=='play'&&event.target.tagName!=='SELECT'){event.preventDefault();back();}
});
const sfx={jump:'jump',ring:'ring',dash:'dash-release',attack:'punch',hit:'hit',down:'respawn',checkpoint:'checkpoint',spring:'spring',rail:'rail-grind',shield:'shield-gain',enemy:'spin-hit',secret:'secret-route',core:'core-spark',boss:'boss-enter',bossPhase:'boss-phase',bossHit:'boss-hit',bossDefeated:'boss-fall',transform:'transform',revert:'transform-end',telegraph:'boss-telegraph',vulnerable:'boss-exposed',loop:'loop-apex',charge:'charge-dash',portal:'portal-in',land:'land',terminal:'amber-compute',break:'crumble',throw:'aura-throw',beacon:'amber-beacon',chainLost:'energy-drain'};
function eventAudio(e){
  if(e.type==='checkpoint' && run.mode==='story' && !run.stage.special){savedMark=checkpointOf(run);saveProgress();}
  if(e.type==='ability')fx(['velocity-air-step','noir-stasis','aura-lift','crimson-breach','amber-flight'][hero]);
  else if(sfx[e.type])fx(sfx[e.type]);
  if(e.type==='boss' || e.type==='bossDefeated'){
    const r=run,id=e.id,after=e.type==='bossDefeated';
    if(!after && run.boss)run.boss.track=e.battleTrack;
    startScene({title:BOSSES[id].name,boss:id,kind:'boss',zone:r.stage.zone,track:after?31:22,
      cards:[{actor:after?hero:BOSSES[id].name,line:bossLine(id,after)}],next:()=>{
        prevStamp=0;go('play',{track:after?r.stage.track:e.battleTrack});
      }});
  }
  if(e.type==='bossPhase'){if(run.boss)run.boss.track=e.track;music(e.track);audio?.setIntensity(.85);}
  if(e.type==='transform'){audio?.transform(true,hero);music(29);}
  if(e.type==='revert'){audio?.transform(false);music(run.boss?23:run.stage.track);}
}
function gameFrame(stamp){
  const keys=input.poll(stamp);
  if(page==='play'&&run&&renderer){
    const delta=prevStamp?stamp-prevStamp:0;
    const events=step(run,keys,delta/1000);prevStamp=stamp;
    for(const e of events){eventAudio(e);if(page!=='play')break;if(e.type==='portal' && !portalReturn){portalReturn=run;stageIntro(e.stage,false);break;}}
    if(page==='play'){
      if(cadence.shouldPaint(stamp,delta))renderer.draw(run);
      if(run.status!=='playing'){
        if(run.status==='won'){progress=finishRun(progress,run);if(savedMark?.stage===run.stageId&&run.mode==='story')savedMark=null;saveProgress();}
        audio?.transform(false);audio?.special(0);go('result',{track:run.status!=='won'?33:run.stage.special?32:30});
      }else if(stamp>=hudAt || !lastHud){
        hudAt=stamp+115;
        const data=[[t('time'),clock(run.stage.special?run.stage.limit-run.time:run.time)],[t('rings'),run.rings],[t('energy'),Math.floor(run.energy)],[t('cores'),run.cores.length+'/7'],[t('score'),Math.floor(run.score)],[t('tries'),4-run.retries],[t('health'),run.player.hp],[t('special'),run.player.cooldown>.15?Math.ceil(run.player.cooldown)+'s':t('ready')]];
        if(run.player.super)data.push([t('transform'),formNames[hero]]);
        if(run.stage.special)data.push([t('bonus'),run.objectiveCount+'/'+run.stage.goal]);
        if(run.boss)data.push([BOSSES[run.boss.id].name,run.boss.hp+'/'+run.boss.maxHp]);
        const hud=data.map(([k,v])=>'<span>'+safe(k)+' <b>'+safe(v)+'</b></span>').join('');
        if(hud!==lastHud){el('#telemetry').innerHTML=hud;lastHud=hud;}
      }
    }
  }
  requestAnimationFrame(gameFrame);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(page==='play')pauseRun();else audio?.pause();}});
window.addEventListener('pagehide',()=>{input.clear();audio?.stop();});
async function boot(){
  const moduleUrl=new URL('/unseen/audio/engine.js', window.location.origin).href;
  const module=await import(/* @vite-ignore */ moduleUrl);
  audio=module.createGameAudio();applySettings();await language(lang,true);void audio.load().catch(()=>{});
  if(import.meta.env.DEV && ['127.0.0.1','localhost','[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('qa')==='1'){
    window.__unseenQA={start(stage,character=0,gameMode='story'){active=true;hero=character;mode=gameMode;portalReturn=null;startRun(stage);},get run(){return run;}};
  }
  requestAnimationFrame(gameFrame);
}
const developmentPreview = import.meta.env.DEV && ['127.0.0.1','localhost','[::1]'].includes(location.hostname);
if (acceptFooterEntry() || developmentPreview) {
  boot().catch(()=>{root.innerHTML='<a class="back-site" href="/">← VISIONOIR</a>';notify('The Unseen Protocol · '+(t('error')==='error'?'Caricamento non riuscito':t('error')));});
} else {
  document.querySelector('#console').hidden = true;
  location.replace('/'+lang.toLowerCase()+'/#unseen-door');
}
