/** Native FREQUENCY session v1. MIDI pitches, 16th-note time, normalized synth parameters. */
import {additionalSession,EXTRA_DEMOS} from './library.js';
const specs = [
  ['kick','Kick Forge','kick',{pitch:.33,sweep:.72,attack:0,punch:.72,body:.64,decay:.42,tail:.36,click:.28,distortion:.28,saturation:.22,drive:.42,harmonics:.18,transient:.6,tuning:.5,output:.85}],
  ['rumble','Rumble Engine','bass',{tone:.32,decay:.72,drive:.55,feedback:.32,delay:.48,reverb:.37,phase:.4,sidechain:.7,width:.23}],
  ['acid','Acid 303','bass',{wave:.15,cutoff:.35,resonance:.72,env:.68,decay:.34,glide:.26,drive:.42}],
  ['industrial','Industrial Bass','bass',{ratio:.3,mod:.58,cutoff:.46,drive:.5,decay:.4}],
  ['sub','Sub Engine','bass',{phase:0,tone:.27,decay:.52,sidechain:.55}],
  ['schranz','Schranz Drums','drums',{metal:.54,body:.45,decay:.26,drive:.65}],
  ['closed','Closed Hi Hat','drums',{color:.64,decay:.18,metal:.32}],
  ['open','Open Hi Hat','drums',{color:.56,decay:.48,metal:.57}],
  ['snare','Snare & Clap','drums',{body:.40,noise:.65,clap:.65,decay:.34}],
  ['ride','Cymbals & Ride','drums',{bell:.65,shimmer:.61,decay:.48}],
  ['stab','Rave Stab','synths',{detune:.28,color:.47,chord:.4,decay:.36}],
  ['lead','Noir Lead','synths',{wave:.55,cutoff:.52,detune:.2,decay:.44}],
  ['atmos','Dark Atmosphere','synths',{attack:.48,drift:.6,color:.46,decay:.68}],
  ['noise','Noise & FX','fx',{sweep:.76,color:.37,grain:.32,decay:.65}],
  ['fm','FM Machine','synths',{ratio:.44,index:.62,algorithm:.32,decay:.38}],
  ['sampler','Sampler','fx',{start:0,end:1,reverse:0,loop:0,oneShot:1,attack:0,pitch:.5,decay:.72,cutoff:.88,gain:.64,slice:0}]
];
export const INSTRUMENTS = specs.map(([id,name,bus,params])=>({id,name,bus,params}));
export const BUSSES = ['kick','drums','bass','synths','fx','returns'];
const fxNames = [
 ['eq','Parametric EQ'],['compressor','Compressor'],['sidechain','Sidechain compressor'],['limiter','Limiter'],
 ['softclip','Soft clipper'],['hardclip','Hard clipper'],['saturation','Saturation'],['overdrive','Overdrive'],
 ['distortion','Distortion'],['waveshaper','Waveshaper'],['bitcrusher','Bitcrusher'],['reduction','Rate reduction'],
 ['delay','Delay'],['pingpong','Ping-pong delay'],['reverb','Room reverb'],['industrialverb','Industrial reverb'],
 ['filter','Filter'],['resonant','Resonant filter'],['chorus','Chorus'],['phaser','Phaser'],['flanger','Flanger'],
 ['transient','Transient shaper'],['stereo','Stereo utility'],['gate','Noise gate'],['dj','DJ filter'],
 ['freeze','Freeze'],['glitch','Glitch'],['repeat','Beat repeat'],['multiband','Multiband compression'],['mastering','Mastering chain']
];
export const EFFECTS = fxNames.map(([id,name])=>({id,name,amount:.4}));
export const PARAMETER_BANK = Object.fromEntries(INSTRUMENTS.map(x=>[x.id,x.params]));
export const DEMOS = [
 {id:'forge',name:'Furnace Ledger',bpm:155,root:32,swing:.05,ref:'jtRV9DWKTKo'},
 {id:'glass',name:'Glass Meridian',bpm:146,root:38,swing:.115,ref:'MqsQI2Di2xY'},
 {id:'relay',name:'Relay / Black Current',bpm:162,root:31,swing:.025,ref:'ukSiQ34iHvo'},
 {id:'rift',name:'Rift Ceremony',bpm:151,root:35,swing:.08,ref:'VUFr92i5jkA'}
];
export const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export const noteHz=n=>440*Math.pow(2,(n-69)/12);
export function hash(a,b=0,c=0){
 let x=Math.imul(a+0x45d9f3b,0x27d4eb2d)^Math.imul(b+1,0x165667b1)^Math.imul(c+1,0x85ebca6b);
 x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;
}
const gains=[.88,.34,.43,.42,.47,.47,.33,.31,.53,.29,.38,.32,.24,.23,.34,.28];
export function createTrack(instrumentId,index=0){
 const s=INSTRUMENTS.find(i=>i.id===instrumentId);
 if(!s) throw Error('instrument');
 return {id:'ch-'+(index+1),instrument:s.id,name:s.name,params:{...s.params},bus:s.bus,volume:gains[INSTRUMENTS.indexOf(s)],gain:1,pan:0,width:1,invert:false,mute:false,solo:false,fx:[],sendDelay:0,sendReverb:0};
}
const titles=[
 ['Cold start','Pressurise','First strike','Furnace floor','Air pocket','Overload','Second shift','Cooling'],
 ['Prism','Refraction','Chromed glass','Parallel lines','Vapour','Crossing','Fracture','Daylight'],
 ['Carrier','Packet loss','Contact','Pulse train','Dead channel','Retransmit','Black current','Disconnect'],
 ['Threshold','Brass rite','First circle','Obsidian','Still water','Summoning','Rift','Ash']
];
// Selected motifs and percussion placements are authored independently for each composition.
const basslines=[
 [0,0,12,0,3,0,7,1,0,10,0,7,3,0,1,-2],
 [0,7,0,10,5,12,7,3,0,5,10,7,5,3,-2,0],
 [0,0,1,13,1,0,-5,7,0,12,1,0,6,1,-5,0],
 [0,-5,0,3,7,12,10,7,3,0,-2,3,8,7,3,-2]
];
const bassHits=[[2,3,6,9,10,13,14],[1,4,6,10,11,13],[0,3,5,7,8,11,14,15],[2,5,6,9,10,14]];
const leads=[[0,12,7,3,1,0,-2,7],[12,10,7,5,3,5,7,10],[0,1,7,6,1,13,12,-5],[7,3,0,-2,3,8,7,0]];
const phrases=[[8,8,16,16,8,8,16,8],[8,16,16,8,8,8,16,8],[8,8,16,8,8,8,24,8],[8,8,16,16,16,8,16,8]];
const energy=[.26,.49,.75,.96,.32,.64,1,.38];
const baseNotes=[36,32,38,38,32,47,72,72,48,64,56,64,52,40,59,60];
const event=(note,velocity,extra={})=>({note,velocity,gate:.8,probability:1,ratchet:1,offset:0,accent:false,slide:false,flam:false,condition:1,locks:{},...extra});
function demoPattern(t,i,s,d){
 const length=(i===6||i===5)&&d===1?24 : i===12||i===13||i===11?64 : i===2||i===10?32:16;
 const steps=Array(length).fill(null),root=DEMOS[d].root, e=energy[s], salt=d*71+s*19+i*7;
 for(let n=0;n<length;n++){
  const p=n%16,beat=p%4,cycle=n>>4,r=hash(n,salt),mel=basslines[d][(n+cycle*3+s)%16];
  let on=false,note=baseNotes[i],velocity=.65+.19*r,gate=.7,locks={},ratchet=1,slide=false,flam=false;
  switch(t.instrument){
   case 'kick': on=s===4 ? (p===0&&d===2) : s===0? p%8===0 : beat===0 || (s===6&&p===15&&d%2===0);velocity=beat===0?.94:.57;break;
   case 'rumble':on=s!==4&&s!==0&&beat===1;note=root;gate=2.8;break;
   case 'acid':on=s!==0&&s!==7&&bassHits[d].includes(p);note=root+mel+(cycle&&p>8?12:0);slide=(p===6||p===14);gate=slide?1.6:.64;locks={cutoff:clamp(.15+e*.38+(.04*cycle)+.12*r,0,1)};break;
   case 'industrial':on=(s===2||s===3||s===6)&&([1,7,11,15].includes((p+d*2)%16));note=root+(p===15?7:0);break;
   case 'sub':on=(s===4||s===2||s===6)&&[0,6,12].includes(p);note=root-(d===1?12:0);gate=2.7;break;
   case 'schranz':on=e>.48&&[3,7,9,14].includes((p+d)%16);flam=p===14&&s===6;break;
   case 'closed':on=s!==4&&(beat===0||beat===2||e>.6&&r<.40);velocity=beat===2?.79:.35+.20*r;ratchet=s===5&&p===15?3:1;break;
   case 'open':on=e>.47&&beat===2&&((p>>2)+d)%3!==0;velocity=.72+.17*r;gate=1.6;break;
   case 'snare':on=s!==0&&s!==4&&(p===4||p===12||s===5&&p>11);velocity=s===5?.48+.45*(p%4)/3:.86;flam=p===12&&d===1;break;
   case 'ride':on=e>.7&&(beat===2||d===2&&p%2===1);velocity=.45+.25*r;break;
   case 'stab':on=e>.45&&[2,8,14].includes((p+3*d)%16)&&((n>>3)+s)%3!==1;note=root+24+([0,3,5,7][(cycle+d)%4]);gate=1.7;break;
   case 'lead':on=(s===3||s===4||s===6)&&([0,3,7,10,14].includes((p+2*d)%16));note=root+36+leads[d][(cycle*2+(p>>1))%8];gate=p<5?2.1:.9;break;
   case 'atmos':on=(s===0||s===4||s===5||s===7)&&n%32===0;note=root+12+(n===32?7:0);gate=23;break;
   case 'noise':on=(s===1||s===5||s===7)&&n===48;gate=14;locks={sweep:s===7?.16:.95};break;
   case 'fm':on=(s===1||s===3||s===6)&&[5,11,15].includes((p+d)%16);note=root+24+mel;gate=.85;break;
   case 'sampler':on=(s===2||s===6)&&p===(11+d)%16;note=60+d*2;break;
  }
  if(on)steps[n]=event(note,velocity,{gate,locks,ratchet,flam,slide,accent:p===0||p===10});
 }
 return {length,steps};
}
export function createProject(demoId='blank'){
 if(EXTRA_DEMOS.some(item=>item.id===demoId))return additionalSession(createProject('blank'),demoId);
 const d=DEMOS.findIndex(i=>i.id===demoId),demo=DEMOS[d];
 const tracks=INSTRUMENTS.map((s,i)=>createTrack(s.id,i));
 if(d>=0){
  for(const [i,t] of tracks.entries()){
   if(i>=5)t.pan=(hash(i,d)-.5)*.48;
   if([2,10,11,14].includes(i))t.sendDelay=.10+.04*d;
   if([8,9,10,12,13].includes(i))t.sendReverb=.16+i*.008;
  }
  tracks[0].params.pitch=[.33,.46,.30,.36][d];tracks[0].params.decay=[.4,.34,.28,.47][d];
  tracks[2].params.wave=[.1,.9,.17,.56][d];tracks[2].params.resonance=[.71,.62,.83,.76][d];
  tracks[5].fx=[{id:d===2?'bitcrusher':'overdrive',amount:.19+.04*d,bypass:false}];
 }
 return {version:1,name:demo?.name??'Untitled',bpm:demo?.bpm??155,swing:demo?.swing??0,seed:d+730,tracks,
   scenes:Array.from({length:8},(_,s)=>({id:'scene-'+(s+1),name:demo?titles[d][s]:'Scene '+(s+1),
    patterns:tracks.map((t,i)=>demo?demoPattern(t,i,s,d):{length:16,steps:Array(16).fill(null)})})),
   arrangement:Array.from({length:8},(_,scene)=>({scene,bars:demo?phrases[d][scene]:1})),
   master:{volume:.88,ceiling:.91,fx:[]},midiMappings:{},buses:Object.fromEntries(BUSSES.map(bus=>[bus,{volume:1,mute:false}]))};
}
const finite=(n,l,h)=>Number.isFinite(n)&&n>=l&&n<=h;
const effectNames=new Set(EFFECTS.map(f=>f.id));
const plain=o=>!!o&&typeof o==='object'&&!Array.isArray(o)&&(Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const label=s=>typeof s==='string'&&s.length<=512;
const optionalNumber=(o,key,min,max)=>o[key]===undefined||finite(o[key],min,max);
function instrumentValues(o,kind){
 return plain(o)&&Object.entries(o).every(([key,value])=>Object.hasOwn(PARAMETER_BANK[kind],key)&&finite(value,0,1));
}
function validRack(list){
 return list===undefined||Array.isArray(list)&&list.length<=12&&list.every(f=>plain(f)&&effectNames.has(f.id)&&finite(f.amount,0,1)&&(f.bypass===undefined||typeof f.bypass==='boolean'));
}
function validNote(n,kind){
 if(n===null)return true;if(!plain(n)||!Number.isInteger(n.note)||!finite(n.note,0,127)||!finite(n.velocity,0,1))return false;
 if(!optionalNumber(n,'gate',.01,128)||!optionalNumber(n,'offset',-.49,.49)||!optionalNumber(n,'probability',0,1))return false;
 for(const [key,max] of [['condition',128],['ratchet',8]])if(n[key]!==undefined&&(!Number.isInteger(n[key])||!finite(n[key],1,max)))return false;
 return (!n.chord||Array.isArray(n.chord)&&n.chord.length<=7&&n.chord.every(interval=>Number.isInteger(interval)&&finite(interval,-48,48)))
  &&(!n.locks||instrumentValues(n.locks,kind));
}
export function validateProject(p){
 if(!plain(p)||p.version!==1||!label(p.name)||!finite(p.bpm,40,300)||!finite(p.swing,0,.5))throw Error('project.header');
 if(!Array.isArray(p.tracks)||p.tracks.length<1||p.tracks.length>32||!Array.isArray(p.scenes)||!p.scenes.length||p.scenes.length>128)throw Error('project.size');
 const ids=new Set();let totalPCM=0;
 for(const t of p.tracks){
  if(!plain(t)||!label(t.id)||ids.has(t.id)||!label(t.name)||!Object.hasOwn(PARAMETER_BANK,t.instrument)||!finite(t.volume,0,1)||!finite(t.pan,-1,1))throw Error('project.track');
  if(!instrumentValues(t.params,t.instrument)||!BUSSES.includes(t.bus)||!validRack(t.fx)||!optionalNumber(t,'gain',0,3)||!optionalNumber(t,'width',0,2)
    ||!finite(t.sendReverb,0,1)||!finite(t.sendDelay,0,1))throw Error('project.mixer');
  ids.add(t.id);
  if(t.sample){const sample=t.sample;
   if(!plain(sample)||!finite(sample.rate,8000,192000)||typeof sample.pcm!=='string'||sample.pcm.length>12e6||sample.pcm.length<4
    ||sample.pcm.length%4!==0||/[^A-Za-z0-9+/=]/.test(sample.pcm)||!/^={0,2}$/.test(sample.pcm.slice(sample.pcm.indexOf('=')<0?sample.pcm.length:sample.pcm.indexOf('='))))throw Error('project.sample');
   totalPCM+=sample.pcm.length;
  }
 }
 if(totalPCM>64e6||!plain(p.master)||!finite(p.master.volume,0,2)||!finite(p.master.ceiling,.1,.999)||!validRack(p.master.fx))throw Error('project.master');
 if(p.buses!==undefined&&(!plain(p.buses)||!Object.entries(p.buses).every(([key,bus])=>BUSSES.includes(key)&&plain(bus)&&finite(bus.volume,0,2))))throw Error('project.bus');
 let cells=0;
 for(const s of p.scenes){if(!plain(s)||!label(s.name)||!Array.isArray(s.patterns)||s.patterns.length!==p.tracks.length)throw Error('project.scene');
  for(let i=0;i<s.patterns.length;i++){const pat=s.patterns[i];if(!plain(pat)||!Number.isInteger(pat.length)||!finite(pat.length,1,128)||!Array.isArray(pat.steps)||pat.steps.length<pat.length||pat.steps.length>128)throw Error('project.pattern');
   cells+=pat.steps.length;for(const n of pat.steps)if(!validNote(n,p.tracks[i].instrument))throw Error('project.note');
  }
 }
 if(cells>350000||!Array.isArray(p.arrangement)||!p.arrangement.length||p.arrangement.length>2048||p.arrangement.some(c=>!plain(c)||!Number.isInteger(c.scene)||!p.scenes[c.scene]||!Number.isInteger(c.bars)||!finite(c.bars,1,4096)))throw Error('project.arrangement');
 for(const clip of p.arrangement){
  if(clip.marker!==undefined&&!label(clip.marker))throw Error('project.marker');
  if(clip.trackScenes!==undefined&&(!Array.isArray(clip.trackScenes)||clip.trackScenes.length>p.tracks.length||clip.trackScenes.some(id=>id!=null&&id!==-1&&(!Number.isInteger(id)||!p.scenes[id]))))throw Error('project.clip');
 }
 return p;
}
export function totalBars(p){return p.arrangement.reduce((n,a)=>n+a.bars,0);}
export function projectFile(p){validateProject(p);return new Blob([JSON.stringify(p)],{type:'application/json'});}
export async function readProject(file){if(file.size>80e6)throw Error('project.size');return validateProject(JSON.parse(await file.text()));}
