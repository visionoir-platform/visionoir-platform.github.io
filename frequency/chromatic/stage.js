import * as T from 'three';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { vertex, fragment } from './shaders.js';
import { makeHistory } from './history.js';
import { spatialScore } from './spatial.js';
import { defaultVisual, modes, normalizeVisual, normalizeSignal, routes, unit } from './model.js';

const base=import.meta.env?.BASE_URL||'/';
async function logoAsset(signal){
 const response=await fetch(base+'assets/logo-geometry.json',{signal});
 if(!response.ok)throw Error('Logo geometry unavailable');
 const {contours}=await response.json();
 const xyz=curve=>curve.map(([x,y])=>new T.Vector2(x,-y));
 const shape=new T.Shape(xyz(contours[0]));
 for(const hole of contours.slice(1))shape.holes.push(new T.Path(xyz(hole)));
 const rest=new T.ExtrudeGeometry(shape,{depth:30,bevelEnabled:true,bevelSegments:3,bevelSize:5,bevelThickness:5,steps:1});
 rest.center();rest.scale(.00455,.00455,.00455);
 const out=new TessellateModifier(.28,7).modify(rest);rest.dispose();
 return {geometry:out};
}

function shaderUniforms(){
 return Object.fromEntries(Object.entries({uAlbedo:null,uTime:0,uMode:0,uNext:0,uMix:0,uActive:0,uWarp:.45,uNoise:.32,uDist:.24,uCut:0,uSize:.42,uPhase:0,uDepth:.46,uEcho:0,uParticle:0,uRefract:.44,uReflect:.8,uLight:.65,uCreator:0,uSound:new T.Vector4(),uVoices:new Float32Array(16),uTint:new T.Color(0xb4ddff)}).map(([k,value])=>[k,{value}]));
}
function samples(geometry,n){
 const sampler=new MeshSurfaceSampler(new T.Mesh(geometry)).build(),p=new T.Vector3(),normal=new T.Vector3();
 let seed=17593;
 const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};sampler.setRandomGenerator(rand);
 const positions=new Float32Array(n*3),normals=new Float32Array(n*3),seeds=new Float32Array(n);
 for(let i=0;i<n;i++){
   sampler.sample(p,normal);p.toArray(positions,3*i);normal.toArray(normals,3*i);seeds[i]=rand();
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('normal',new T.BufferAttribute(normals,3));g.setAttribute('aSeed',new T.BufferAttribute(seeds,1));return g;
}
function gpuMaterial(uniforms,extra={}){
 return new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,side:T.DoubleSide,...extra});
}
export async function buildStage(host,{getSignal=()=>({}),getState=()=>defaultVisual(),assetLoader=logoAsset,creator=false,poster,canDraw=()=>true}={}){
 const abort=new AbortController();let closed=false,visible=true,raf=0,lost=false,failed=false,box={width:1,height:1};
 const fallback=document.createElement('img');
 fallback.className='chromatic-poster';fallback.src=poster||base+'assets/logo.svg';fallback.alt='';fallback.setAttribute('aria-hidden','true');
 host.append(fallback);host.dataset.render='fallback';
 let gpu;
 try{gpu=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}
 catch{return {dispose(){closed=true;fallback.remove();},invalidate(){},trigger(){},getRenderState:()=>host.dataset.render};}
 const scene=new T.Scene(), camera=new T.PerspectiveCamera(35,1,.08,58),world=new T.Group();scene.add(world);
 const canvas=gpu.domElement;canvas.setAttribute('aria-hidden','true');canvas.className='chromatic-canvas';host.append(canvas);
 gpu.setClearColor(0x080a0e,0);gpu.toneMapping=T.ACESFilmicToneMapping;gpu.outputColorSpace=T.SRGBColorSpace;
 const ambient=new T.HemisphereLight(0xfff8eb,0x526078,1.45);scene.add(ambient);
 const key=new T.DirectionalLight(0xffffff,2.35);key.position.set(-3,5,5);scene.add(key);
 const rim=new T.DirectionalLight(0xafcbf3,1.6);rim.position.set(3,2,-2);scene.add(rim);
 const history=makeHistory(gpu);let historyOn=false;
 const u=shaderUniforms();u.uCreator.value=Number(creator);
 let elapsed=0,last=0,logicalMode=0,fromMode=0,mix=1,tweenTime=.66,lastState=null,quality=1,slowFrames=0,reduced=false;
 let geometry,points,solid,cloud,natural,assetCleanup,face,pointMat,echoMat,mood='metal';
 let echoes=[];const scores=new Map(), envelope=new Float32Array(16),hits=new Float32Array(16);
 const tempBands=new T.Vector4(),colorA=new T.Color(),colorB=new T.Color();
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const frameWindow=host.ownerDocument.defaultView||window;
 const cancel=()=>{frameWindow.cancelAnimationFrame(raf);raf=0;last=0;};
 function request(){if(!closed&&!failed&&!raf&&visible&&!lost&&!document.hidden)raf=frameWindow.requestAnimationFrame(draw);}
 function resize(){
   if(closed)return;
   const rect=host.getBoundingClientRect();
   box={width:Math.max(1,rect.width),height:Math.max(1,rect.height)};
   const aspect=box.width/box.height;camera.aspect=aspect;camera.updateProjectionMatrix();
   const state=getState()||{};const cap=state.quality==='low'?.85:state.quality==='high'?1.8:1.38;
   gpu.setPixelRatio(Math.min(devicePixelRatio||1,cap)*quality);gpu.setSize(box.width,box.height,false);request();
 }
 function showFallback(reason){host.dataset.render=reason;canvas.style.visibility='hidden';fallback.hidden=false;}
 function hit(i,v){if(Number.isInteger(i)&&i>=0&&i<16)hits[i]=Math.max(hits[i],unit(v,1));request();}
 const lose=e=>{e.preventDefault();lost=true;cancel();showFallback('context-lost');};
 const restore=()=>{lost=false;failed=false;resize();};
 canvas.addEventListener('webglcontextlost',lose);canvas.addEventListener('webglcontextrestored',restore);
 gpu.debug.onShaderError=(gl,program,vs,fs)=>{failed=true;showFallback('shader-error');console.warn('VISIONOIR shader:',gl.getShaderInfoLog(vs),gl.getShaderInfoLog(fs));};
 const obs=new IntersectionObserver(([o])=>{visible=o.isIntersecting;if(visible)request();else cancel();});obs.observe(host);
 const size=new ResizeObserver(resize);size.observe(host);
 const visibility=()=>{if(document.hidden)cancel();else request();};document.addEventListener('visibilitychange',visibility);
 motion.addEventListener?.('change',request);
 function selectScore(index){
   if(!scores.has(index)){const score=spatialScore(index);scene.add(score.group);scores.set(index,score);}
   return scores.get(index);
 }
 let lastTimeToken=-Infinity;
 function draw(now){
  raf=0;if(closed||lost||!visible||document.hidden||!solid||failed)return;
  const state=getState()||defaultVisual(),simple=state.reduced||motion.matches, frozen=state.freeze;
  const interval=last?now-last:16.6,dt=Math.min(.08,interval/1000);last=now;
  if(!canDraw())return;
  const raw=getSignal()||{};let s=normalizeSignal(raw);
  const index=Math.max(0,modes.findIndex(m=>m[0]===state.mode));
  if(host.dataset.visualMode!==state.mode)host.dataset.visualMode=state.mode;
  if(index!==logicalMode){fromMode=mix>.5?logicalMode:fromMode;logicalMode=index;mix=0;tweenTime=.45+(1-state.rebuild)*.85;}
  const changed=state!==lastState||simple!==reduced;
  if(simple&&!changed&&now-lastTimeToken<220){request();return;}
  lastTimeToken=now;
  if(!frozen||changed){
   mix=simple?1:Math.min(1,mix+dt/tweenTime);
   if(!frozen&&!simple)elapsed+=dt;
   const t=elapsed*(state.sync?Math.min(2.4,s.bpm/125):1);
   u.uTime.value=t;u.uPhase.value=state.phase+(state.sync?(s.beat%4)*.025:0);
   u.uMode.value=fromMode;u.uNext.value=logicalMode;u.uMix.value=mix;
   const decay=Math.exp(-dt*(3.5+(1-state.decay)*8));
   const voice=u.uVoices.value;voice.fill(0);
   for(let i=0;i<16;i++){hits[i]*=decay;envelope[i]=Math.max(envelope[i]*decay,s.voices[i],hits[i]);const route=routes.indexOf(state.mapping?.[i]||routes[i]);if(route>=0)voice[route]=Math.max(voice[route],envelope[i]*state.sensitivity);}
   tempBands.set(unit(s.bass*state.bass*1.35*state.sensitivity),unit(s.mid*state.sensitivity),unit(s.high*state.treble*1.45*state.sensitivity),unit(s.level*state.sensitivity));
   u.uSound.value.lerp(tempBands,simple?1:1-Math.exp(-dt*16));voice[0]*=state.kick;
   const peak=voice.reduce((a,b)=>Math.max(a,b),0);
   u.uActive.value=state.intensity*(simple?.16:1)*Math.min(1,.55*u.uSound.value.w+.58*u.uSound.value.x+.65*peak);
   u.uWarp.value=state.warp;u.uNoise.value=state.turbulence;u.uDist.value=state.distortion;u.uSize.value=state.size;
   u.uCut.value=simple?0:state.dissolve;u.uRefract.value=state.refraction;u.uReflect.value=state.reflection;u.uLight.value=state.light;u.uDepth.value=state.depth;
   colorA.set(modes[fromMode][2]);colorB.set(modes[logicalMode][2]);u.uTint.value.copy(colorA.lerp(colorB,mix));if(state.color)u.uTint.value.set(state.color);
   const ghost=(Number(fromMode===9)*(1-mix)+Number(logicalMode===9)*mix)*(!simple&&mood!=='natural'?1:0);
   for(let i=0;i<echoes.length;i++)echoes[i].visible=ghost>(i+1)*.18;
   points.setDrawRange(0,Math.max(0,Math.round(points.attributes.position.count*state.density*quality*(simple?.18:1))));
   if(!creator){
    // The Unseen moves between physical states on musical phrase boundaries.
    if(logicalMode===15&&s.level>.005){const seq=[7,5,4,1,10,2,3,9];const part=Math.floor((s.beat+s.scene*4)/8);u.uNext.value=seq[part%seq.length];u.uMode.value=seq[(part+seq.length-1)%seq.length];u.uMix.value=Math.min(1,(s.beat%8)*.85);}
    for(const [i,score] of scores){if(i!==logicalMode&&i!==fromMode){score.dispose();scene.remove(score.group);scores.delete(i);}}
    selectScore(fromMode).update(1-mix,t,u.uActive.value,u.uTint.value,state.depth);
    selectScore(logicalMode).update(mix,t,u.uActive.value,u.uTint.value,state.depth);
   }
   world.rotation.y=creator?-.24+Math.sin(t*.22)*.08*state.camera: -.30+Math.sin(t*.28)*state.rotation*.68;
   world.rotation.x=creator?.015: -.095+Math.sin(t*.3)*state.camera*.10;
   world.rotation.z=creator?0:-.095+Math.sin(t*.20)*state.rotation*.055;
   const portrait=box.width/box.height;
   camera.position.set(creator?.07:0,creator?.48:0,creator?Math.max(3.34,2.02/portrait):Math.max(6.85,6.35/portrait));
   camera.lookAt(0,creator?.24:0,0);
  }
  lastState=state;reduced=simple;
  const persistent=!creator&&!simple&&state.quality!=='low'&&quality>.71&&[9,14,15].includes(logicalMode);
  if(persistent){history.render(scene,camera,box.width,box.height,.65+.17*state.decay);historyOn=true;}
  else {if(historyOn){history.release();historyOn=false;}gpu.render(scene,camera);}
  if(!failed){canvas.style.visibility='visible';fallback.hidden=true;host.dataset.render='webgl';}
  if(!simple&&!frozen&&state.quality==='auto'){
   slowFrames=interval>35?Math.min(60,slowFrames+1):Math.max(0,slowFrames-.35);
   if(slowFrames>38&&quality>.62){quality=Math.max(.60,quality-.16);slowFrames=0;resize();}
  }
  if(!simple&&!frozen)request();
 }
 function dispose(){
  if(closed)return;closed=true;abort.abort();cancel();obs.disconnect();size.disconnect();motion.removeEventListener?.('change',request);document.removeEventListener('visibilitychange',visibility);
  canvas.removeEventListener('webglcontextlost',lose);canvas.removeEventListener('webglcontextrestored',restore);
  history.dispose();for(const s of scores.values())s.dispose();geometry?.dispose();points?.dispose();face?.dispose();pointMat?.dispose();echoMat?.dispose();assetCleanup?.();gpu.dispose();canvas.remove();fallback.remove();
 }
 try{
  const asset=await assetLoader(abort.signal);if(closed){asset.geometry.dispose();asset.dispose?.();return {dispose};}
  geometry=asset.geometry;assetCleanup=asset.dispose;natural=asset.natural;u.uAlbedo.value=natural?.map||null;
  geometry.setAttribute('aSeed',new T.BufferAttribute(new Float32Array(geometry.attributes.position.count),1));
  face=gpuMaterial(u);solid=new T.Mesh(geometry,face);world.add(solid);
  points=samples(geometry,creator?9500:6200);
  pointMat=gpuMaterial({...u,uParticle:{value:1}},{transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  cloud=new T.Points(points,pointMat);cloud.frustumCulled=false;world.add(cloud);
  echoMat=gpuMaterial({...u,uEcho:{value:1}},{transparent:true,depthWrite:false});
  for(let i=0;i<2;i++){const echo=new T.Mesh(geometry,echoMat);echo.visible=false;echo.position.set(-.22*i,.08*i,-.20*i);world.add(echo);echoes.push(echo);}
  resize();request();
 }catch(error){if(error.name!=='AbortError'){showFallback('asset-error');console.warn('VISIONOIR scene:',error.message);}}
 return {getRenderState:()=>host.dataset.render,dispose,resize,invalidate:request,trigger:hit,setLook(value){mood=value==='natural'&&natural?'natural':'metal';if(solid){solid.material=mood==='natural'?natural:face;cloud.visible=mood!=='natural';}request();}};
}
