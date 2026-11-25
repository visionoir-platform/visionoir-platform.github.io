// Indices are part of the saved .vfreq instrument-to-visual mapping.
export const modes = [
  ['chrome-pulse','Chrome Pulse','#b4ddff'], ['liquid-collapse','Liquid Collapse','#ccdcff'],
  ['inferno','Inferno','#ff7848'], ['atomic-disintegration','Atomic Disintegration','#d3e5ff'],
  ['acid-mutation','Acid Mutation','#cbff46'], ['black-hole','Black Hole','#b9a9ff'],
  ['digital-fracture','Digital Fracture','#ff9271'], ['obsidian-core','Obsidian Core','#cd96ff'],
  ['mercury-rain','Mercury Rain','#c4f3ff'], ['spectral-echo','Spectral Echo','#eeb3ff'],
  ['techno-vortex','Techno Vortex','#5ae1d5'], ['fractal-machine','Fractal Machine','#f2ba82'],
  ['quantum-distortion','Quantum Distortion','#a2c1ff'], ['industrial-meltdown','Industrial Meltdown','#e5a87c'],
  ['retro-media-player','Retro Media Player','#77edda'], ['the-unseen','The Unseen','#d0cbff'],
];
export const instruments = ['Kick Forge','Rumble Engine','Acid 303','Industrial Bass','Sub Engine','Schranz Drums','Closed Hi-Hat','Open Hi-Hat','Snare & Clap','Cymbals & Ride','Rave Stab','Noir Lead','Dark Atmosphere','Noise & FX','FM Machine','Sampler'];
export const routes = ['impact','melt','acid','fracture','mass','spark','glint','trail','shock','rain','burst','twist','haze','noise','fm','scatter'];
export const parameters = {
  intensity: .66, sensitivity: .9, warp: .45, turbulence:.32, dissolve:0, density:.66, size:.42,
  rebuild:.55, refraction:.44, reflection:.8, distortion:.24, light:.65, camera:.25, rotation:.44,
  depth:.46, kick:.8, bass:.78, treble:.68, decay:.5, phase:0,
};
export const defaultVisual=()=>({version:1,mode:'chrome-pulse',...parameters,color:'',sync:true,auto:false,freeze:false,reduced:false,quality:'auto',mapping:routes.slice(),automation:[],midi:{}});
export const unit=(v,f=0)=>Number.isFinite(v)?Math.min(1,Math.max(0,v)):f;
export function normalizeVisual(raw={}) {
  if(!raw || typeof raw!=='object') raw={};
  const s=defaultVisual();
  for(const [name,initial] of Object.entries(parameters)) s[name]=unit(raw[name],initial);
  if(modes.some(m=>m[0]===raw.mode)) s.mode=raw.mode;
  if(/^#[\da-f]{6}$/i.test(raw.color)) s.color=raw.color;
  for(const name of ['sync','auto','freeze','reduced']) if(typeof raw[name]==='boolean') s[name]=raw[name];
  if(['auto','low','high'].includes(raw.quality)) s.quality=raw.quality;
  if(Array.isArray(raw.mapping)) s.mapping=s.mapping.map((normal,i)=>routes.includes(raw.mapping[i])?raw.mapping[i]:normal);
  if(Array.isArray(raw.automation)) s.automation=raw.automation.slice(0,256).filter(v=>Number.isInteger(v?.scene)&&v.scene>=0&&v.scene<=4095&&modes.some(m=>m[0]===v.mode)).map(v=>({scene:v.scene,mode:v.mode}));
  if(raw.midi && typeof raw.midi==='object' && !Array.isArray(raw.midi)){
    for(const [key,param] of Object.entries(raw.midi).slice(0,128)){
      if(/^([0-9]|1[0-5]):([0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(key)&&Object.hasOwn(parameters,param))s.midi[key]=param;
    }
  }
  return s;
}
export function normalizeSignal(raw={}) {
  return {bass:unit(raw.bass),mid:unit(raw.mid),high:unit(raw.high),level:unit(raw.level),
    bpm:Number.isFinite(raw.bpm)?Math.max(20,Math.min(360,raw.bpm)):140,
    beat:Number.isFinite(raw.beat)?Math.max(0,raw.beat):0,
    scene:Number.isInteger(raw.scene)?Math.max(0,raw.scene):0,
    voices:Array.from({length:16},(_,i)=>unit(raw.voices?.[i]))};
}
