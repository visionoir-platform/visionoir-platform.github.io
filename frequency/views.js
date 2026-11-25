import {escape as h, attr, pad, noteName, option, act, number, slider, dial, select} from './ui-kit.js';
const data=(key,n)=>`data-${key}="${attr(n)}"`;
const scroller=(html)=>`<div class="scroll-zone" tabindex="0">${html}</div>`;
export function renderEditor(state,t,audio){
 const {p,scene,channel,page,view}=state;
 const tr=p.tracks[channel], pat=p.scenes[scene].patterns[channel], ins=audio.INSTRUMENTS.find(i=>i.id===tr.instrument);
 const head=`<header class="panelhead"><div><small>${h(t(view==='live'?'performance':'project'))} / ${h(p.name)}</small><h2>${h(t(view==='live'?'performance':view))}</h2></div><div class="zone-options">${select(t('scene'),'scene',p.scenes.map((s,i)=>option(i,pad(i+1)+' · '+s.name,i===scene)).join(''))}</div></header>`;
 const rows=state.bank*Math.max(1,state.bankSize), cut=p.tracks.slice(rows,rows+state.bankSize);
 const ctrls=`<div class="matrix-commands">${act('bank-prev','◂',{title:t('previous'),disabled:!state.bank})}<span>${pad(rows+1)}–${pad(rows+cut.length)}</span>${act('bank-next','▸',{title:t('next'),disabled:rows+cut.length>=p.tracks.length})}<i></i>${act('page-prev','‹',{title:t('previous'),disabled:!page})}<span>${pad(page*16+1)}–${pad(page*16+16)}</span>${act('page-next','›',{title:t('next'),disabled:page>=7})}</div>`;
 const rowLabel=(tr,i)=>act('channel',tr.name,{classes:'row-label',data:data('index',i),pressed:i===channel});
 const steps=()=>cut.map((tr,j)=>{
   const ci=rows+j,pat=p.scenes[scene].patterns[ci];
   const steps=Array.from({length:16},(_,i)=>{
     const n=page*16+i,e=pat.steps[n],outside=n>=pat.length;
     return `<button type="button" class="cell ${i%4===0?'downbeat':''} ${e&&!outside?'on':''} ${e?.accent?'accent':''}" data-action="step" data-channel="${ci}" data-pos="${n}" data-beat="${i}" aria-label="${attr(tr.name+' · '+t('step')+' '+(n+1))}" aria-pressed="${!!e&&!outside}" ${outside?'disabled':''} style="--vel:${e?.velocity??0}"></button>`;
   }).join('');
   return `<div class="step-row ${ci===channel?'selected':''}" style="--voice:${channelColor(ci)}">${rowLabel(tr,ci)}${steps}</div>`;
 }).join('');
 const stepHeader=`<div class="step-row step-numbers"><span>${h(t('instrument'))}</span>${Array.from({length:16},(_,i)=>`<span data-beat="${i}">${pad(page*16+i+1)}</span>`).join('')}</div>`;
 if(view==='sequencer')return head+ctrls+scroller(`<div class="step-matrix" dir="ltr">${stepHeader}${steps()}</div>`)+`<div class="bar-tools">${select(t('length'),'length',[...new Set([8,12,15,16,24,32,48,64,96,128,pat.length])].sort((a,b)=>a-b).map(n=>option(n,n,n===pat.length)).join(''))}${act('edit-step',t('edit')+' '+t('step'))}${act('pattern-tools',t('tools'))}${act('add-channel','+ '+t('instrument'),{disabled:p.tracks.length>=32})}</div>`+instrumentPanel(state,t,audio);
 if(view==='piano'){
   const start=state.octave*12, scale=[0,2,4,5,7,9,11];
   const body=Array.from({length:12},(_,j)=>{
     const n=start+11-j;
     return `<div class="piano-row ${scale.includes(n%12)?'white':'black'}"><button data-action="audition" data-note="${n}">${noteName(n)}</button>${Array.from({length:16},(_,i)=>{
       const pos=page*16+i,ev=pat.steps[pos],on=ev?.note===n;
       return `<button class="piano-cell ${on?'note':''} ${on&&state.selected.has(pos)?'picked':''}" data-action="piano-cell" data-pos="${pos}" data-note="${n}" data-beat="${i}" aria-label="${noteName(n)} · ${t('step')} ${pos+1}" aria-pressed="${on}" ${pos>=pat.length?'disabled':''}>${on?'●':''}</button>`;
     }).join('')}</div>`;
   }).join('');
   return head+ctrls+`<div class="bar-tools">${select(t('instrument'),'channel',p.tracks.map((c,i)=>option(i,c.name,i===channel)).join(''))}${select(t('pitch'),'octave',Array.from({length:9},(_,i)=>option(i,noteName(i*12)+'–'+noteName(i*12+11),i===state.octave)).join(''))}${act('multi',t('multiSelection'),{pressed:state.multi})}</div>`+scroller(`<div class="piano" dir="ltr">${body}</div>`)+`<div class="bar-tools">${act('transpose-down','−1 ♩',{title:t('transpose')+' −1'})}${act('transpose-up','+1 ♩',{title:t('transpose')+' +1'})}${act('move-prev','← ♩',{title:t('shift')+' · '+t('previous')})}${act('move-next','♩ →',{title:t('shift')+' · '+t('next')})}${act('copy-notes',t('copy'))}${act('paste-notes',t('paste'))}${act('delete-notes',t('deleteStep'))}${act('edit-step',t('edit')+' '+t('note'))}</div>`;
 }
 if(view==='arrangement'){
   let bar=1; const clips=p.arrangement.map((clip,i)=>{
     const at=bar;bar+=clip.bars;
     return `<li class="clip"><span class="clip-no">${pad(at)}</span>${select(t('scene'),'clip-scene:'+i,p.scenes.map((s,j)=>option(j,s.name,j===clip.scene)).join(''))}${number(t('bars'),'clip-bars:'+i,clip.bars,1,4096)}<div>${act('clip-up','↑',{title:t('previous'),data:data('index',i),disabled:i===0})}${act('clip-down','↓',{title:t('next'),data:data('index',i),disabled:i===p.arrangement.length-1})}${act('clip-duplicate','⧉',{title:t('duplicate'),data:data('index',i)})}${act('clip-delete','×',{title:t('remove'),data:data('index',i),disabled:p.arrangement.length===1})}</div></li>`;
   }).join('');
   const timeline=scroller(`<div class="timeline" style="--count:${p.arrangement.length}" dir="ltr"><div class="timeline-row"><span>${h(t('bars'))}</span>${p.arrangement.map((clip,i)=>`<button data-action="clip-marker" data-index="${i}" title="${attr(t('marker'))}">${pad(i+1)} · ${h(clip.marker||p.scenes[clip.scene].name)}</button>`).join('')}</div>${p.tracks.map((tr,ti)=>`<div class="timeline-row" style="--voice:${channelColor(ti)}"><span>${h(tr.name)}</span>${p.arrangement.map((clip,j)=>{const source=clip.trackScenes?.[ti]??clip.scene;const evt=source>=0&&p.scenes[source]?.patterns[ti]?.steps.some(Boolean);return `<button class="${evt?'clip-sounding':''}" data-action="clip-source" data-index="${j}" data-channel="${ti}" title="${attr(tr.name+' · '+t('source'))}">${source===-1?'—':pad(source+1)}</button>`;}).join('')}</div>`).join('')}</div>`);
   return head+timeline+`<div class="bar-tools">${act('play-song',t('play')+' · '+t('arrangement'),{icon:'▶'})}${act('add-clip','+ '+t('scene'))} ${act('loop',t('loop'),{pressed:!!p.loop?.on})} ${number(t('start'), 'loop-start',(p.loop?.start??0)+1,1,bar-1)} ${number(t('end'),'loop-end',p.loop?.end??bar-1,1,bar-1)} ${act('rename-scene',t('edit')+' · '+t('scene'))}<span>${bar-1} ${h(t('bars'))}</span></div><ol class="clips">${clips}</ol>`;
 }
 if(view==='mixer'){
   const buses=`<section class="instrument-panel"><h3>Bus</h3><div class="buses">${audio.BUSSES.map((bus,i)=>{const b=p.buses?.[bus]||{volume:1,mute:false};return `<article><meter data-meter="bus:${i}" min="0" max="1" value="0" aria-label="${attr(bus)}"></meter>${slider(bus.toUpperCase(),'bus:'+bus+':volume',b.volume,0,2)}${act('bus-mute','M',{title:t('mute')+' · '+bus,data:data('id',bus),pressed:!!b.mute})}</article>`;}).join('')}</div></section>`;
   return head+scroller(`<div class="mixer">${p.tracks.map((tr,i)=>`<article class="channel" style="--voice:${channelColor(i)}"><header><small>CH ${pad(i+1)}</small>${rowLabel(tr,i)}</header><div class="meters"><meter data-meter="peak:${i}" min="0" max="1" value="0" title="Peak"></meter><meter data-meter="rms:${i}" min="0" max="1" value="0" title="RMS"></meter></div>${slider(t('gain'),'track:'+i+':gain',tr.gain??1,0,2)}${slider(t('volume'),'track:'+i+':volume',tr.volume)}${slider('Pan','track:'+i+':pan',tr.pan,-1,1)}<div class="pair">${act('mute','M',{title:t('mute')+' · '+tr.name,pressed:tr.mute,data:data('index',i)})}${act('solo','S',{title:'Solo · '+tr.name,pressed:tr.solo,data:data('index',i)})}</div></article>`).join('')}</div>`)+buses+instrumentPanel(state,t,audio);
 }
 if(view==='live'){
   return head+`<div class="bar-tools">${act('protect',t('protectedMode'),{pressed:state.protect})}${act('add-scene','+ '+t('scene'))}${act('master-mute','Master mute',{pressed:p.master.volume===0})}${act('tap','Tap tempo')}</div><div class="scene-pads">${p.scenes.map((s,i)=>act('launch',pad(i+1)+' / '+s.name,{classes:'scene-pad',pressed:state.playScene===i,data:data('index',i)})).join('')}</div><h3>${h(t('instrument'))}</h3><div class="pads">${p.tracks.map((tr,i)=>`<button data-pad="${i}" style="--voice:${channelColor(i)}"><small>${pad(i+1)}</small>${h(tr.name)}</button>`).join('')}</div>`+masterPanel(state,t);
 }
 return head;
}
export function channelColor(i){return ['#e5f997','#9ad7bd','#a8e5cc','#b6cbe1','#94b2da','#e6ab91','#ddd1ab','#c1ad8b','#d59d94','#bdc9bb','#a9bdf0','#a4adf0','#b99cd2','#babfc8','#9dd9d5','#e1bd9c'][i%16];}
export function masterPanel(state,t){const m=state.p.master;return `<section class="instrument-panel"><div class="panelhead"><h3>${h(t('master'))}</h3><span class="meter-label">L / R</span></div><div class="knobs">${slider(t('volume'),'master:volume',m.volume)}${slider('Limiter','master:ceiling',m.ceiling,.1,1)}</div>${act('master-fx','Master FX')}</section>`;}
function instrumentPanel(state,t,audio){
 const tr=state.p.tracks[state.channel],params=Object.entries(tr.params);
 return `<section class="instrument-panel"><header class="panelhead"><div><small>CH ${pad(state.channel+1)} / ${h(tr.bus.toUpperCase())}</small><h3>${h(tr.name)}</h3></div><div>${act('preview','▷',{title:t('play')+' · '+tr.name})} ${act('patches',t('presets'))+' '+act('track-settings','FX / I/O')}</div></header><div class="knobs">${params.map(([key,v])=>dial(key,'param:'+key,v)).join('')}</div>${tr.instrument==='sampler'?`<label class="import-sample">${h(t('importFile'))} <input type="file" id="sample-file" accept="audio/*"></label>`:''}</section>`;
}
