import {INSTRUMENTS,BUSSES,clamp,noteHz,totalBars} from './model.js';
import {arrangementAt,planStep} from './sequencer.js';
import {Effect} from './fx.js';
import {MasterLimiter} from './limiter.js';
import {Voice,decodePCM,factoryGlass} from './voice.js';
const kinds=new Map(INSTRUMENTS.map((x,i)=>[x.id,i]));
const busIndex=Object.fromEntries(BUSSES.map((x,i)=>[x,i]));
function rack(spec,previous,rate,bpm){
 return (spec||[]).slice(0,12).map((s,i)=>{if(previous?.[i]?.id===s.id){previous[i].configure(s,bpm);return previous[i];}return new Effect(s,rate,bpm);});
}
export class DSP {
 constructor(project,rate,options={}){
  this.rate=rate;this.options=options;this.channels=[];this.bar=0;this.scene=0;this.step=-1;this.frame=0;
  this.masterPeak=[0,0];this.squareL=this.squareR=this.dot=this.meterN=0;this.clipped=false;
  this.running=false;this.arranging=false;this.queue=null;this.events=[];this.masterFx=[];
  this.histL=0;this.histR=0;this.dcL=0;this.dcR=0;this.dcCoeff=Math.exp(-2*Math.PI*12/rate);
  this.limiter=new MasterLimiter(rate);
  this.delay=new Effect({id:'pingpong',amount:.43},rate,project.bpm);
  this.reverb=new Effect({id:'reverb',amount:.47},rate,project.bpm);
  this.busGain=new Float32Array(BUSSES.length);this.busLv=new Float32Array(BUSSES.length);
  this.update(project);
 }
 update(p){
  const oldBpm=this.p?.bpm;
  this.p=p;this.stepSamples=this.rate*15/p.bpm;this.total=totalBars(p)*16;
  if(this.running&&oldBpm&&oldBpm!==p.bpm){this.nextBoundary=this.frame+Math.max(0,this.nextBoundary-this.frame)*oldBpm/p.bpm;}
  const solo=p.tracks.some(t=>t.solo);
  this.channels=p.tracks.map((t,i)=>{
   let c=this.channels[i];if(!c||c.id!==t.id||c.kind!==kinds.get(t.instrument)){
    c={id:t.id,kind:kinds.get(t.instrument),voices:Array.from({length:4},()=>new Voice(this.rate)),peak:0,energy:0,prevHz:0,voice:0,g:0,fx:[]};
   }
   c.t=t;c.b=busIndex[t.bus]??3;
   if(c.kind===1){
    c.rumble??={buffer:new Float32Array(Math.round(this.rate*.6)),head:0,low:0};
    c.echoOffset=Math.max(4,Math.round((.03+.19*t.params.delay)*this.rate));
    c.verbOffset=Math.max(4,Math.round(.04721*this.rate));
   }
   c.to=t.mute||solo&&!t.solo?0:t.volume*(t.gain??1);c.lp=Math.cos((t.pan+1)*Math.PI/4);c.rp=Math.sin((t.pan+1)*Math.PI/4);
   c.fx=rack(t.fx,c.fx,this.rate,p.bpm);
   if(c.kind===15&&!t.sample)c.sample=factoryGlass();
   if(c.pcm!==t.sample?.pcm){c.sample=decodePCM(t.sample)??factoryGlass();c.pcm=t.sample?.pcm;}
   return c;
  });
  this.masterFx=rack(p.master?.fx,this.masterFx,this.rate,p.bpm);this.ceil=clamp(p.master?.ceiling??.91,.1,.999);
  this.volume=clamp(p.master?.volume??.88,0,2);this.gSmooth=1-Math.exp(-1/(.005*this.rate));
  this.delay.configure({amount:.43},p.bpm);this.reverb.configure({amount:.47},p.bpm);
  for(const key of BUSSES){const b=p.buses?.[key];this.busGain[busIndex[key]]=b?.mute?0:clamp(b?.volume??1,0,2);}
 }
 start({scene=0,arrangement=false}={}){
  this.stop();this.running=true;this.arranging=arrangement;this.scene=scene;this.liveScene=scene;this.liveBase=0;
  this.frame=0;this.nextBoundary=0;this.step=-1;this.planned=-1;this.bar=0;this.queue=null;this.ended=false;this.clickFrames=0;this.clickPhase=0;
 }
 queueScene(scene){
  if(!this.p.scenes[scene])return;
  this.queue=scene;this.queueAt=(Math.floor(Math.max(0,this.step)/16)+1)*16;
  if(this.planned>=this.queueAt){this.events=this.events.filter(e=>e.step<this.queueAt);this.planned=this.queueAt-1;this.schedule(this.queueAt,this.nextBoundary);}
 }
 stop(){
  this.running=false;this.clickFrames=0;this.limiter.reset();this.events.length=0;for(const c of this.channels){for(const v of c.voices)v.active=false;c.peak=0;c.energy=0;c.prevHz=0;if(c.rumble){c.rumble.buffer.fill(0);c.rumble.low=0;}}
  for(const effect of [this.delay,this.reverb,...this.masterFx,...this.channels.flatMap(c=>c.fx)]){
   effect.bufL?.fill(0);effect.bufR?.fill(0);effect.env=effect.lastL=effect.lastR=effect.lowL=effect.lowR=effect.highL=effect.highR=effect.zL=effect.zR=0;
  }
  this.histL=this.histR=this.dcL=this.dcR=0;
 }
 trigger(i,note,vel=.85,gate=.25,event={},seed=13){
  const c=this.channels[i];if(!c)return;
  if(c.kind===6){for(const channel of this.channels)if(channel.kind===7)for(const v of channel.voices)if(v.active)v.choke();}
  const mono=c.kind===2||c.kind===4||c.kind===1;
  let voice=c.voices.find(v=>!v.active);if(!voice)voice=c.voices[c.voice++%c.voices.length];
  if(mono){for(const v of c.voices)if(v.active&&v!==voice)v.choke();}
  voice.start(c.kind,note,vel,gate,c.t.params,event.locks,seed,c.prevHz,event.slide,event.accent,c.sample);
  c.prevHz=noteHz(note);
 }
 release(i,note){for(const voice of this.channels[i]?.voices||[])if(voice.note===note)voice.stopGate();}
 position(step){
  if(this.queue!==null&&step>=this.queueAt)return {scene:this.queue,local:step-this.queueAt};
  if(!this.arranging)return {scene:this.liveScene,local:step-this.liveBase};
  const region=this.p.loop;
  if(!this.options.offline&&region?.on){const start=region.start*16,end=region.end*16;if(start>=0&&end<=this.total&&end>start&&step>=end)step=start+(step-start)%(end-start);}
  return arrangementAt(this.p,step);
 }
 schedule(step,boundary){
  if(step<0||step<=this.planned)return;
  const pos=this.position(step);if(!pos)return;this.planned=step;
  planStep(this.p,step,pos.scene,pos.local,(track,s,offset,gate,vel,absolute,n)=>{
   this.events.push({step,at:Math.max(this.frame,Math.round(boundary+offset*this.stepSamples)),track,s,vel,
    gate:gate*this.stepSamples/this.rate,seed:Math.imul(absolute+1,8191)+Math.imul(track+1,65537)+n+(this.p.seed|0)});
  },pos.clip);
  this.events.sort((a,b)=>b.at-a.at);
 }
 boundary(){
  this.step++;this.bar=Math.floor(this.step/16);
  if(this.queue!==null&&this.step>=this.queueAt){this.liveScene=this.queue;this.liveBase=this.step;this.arranging=false;this.queue=null;}
  const at=this.position(this.step);
  if(!at){this.running=false;this.ended=true;return;}
  this.scene=at.scene;this.local=at.local;
  if(this.p.metronome&&!this.options.offline&&this.step%4===0){
   this.clickFrames=Math.round(.030*this.rate);this.clickPhase=0;this.clickHz=this.step%16===0?1470:980;
  }
  this.schedule(this.step,this.nextBoundary);
  this.nextBoundary+=this.stepSamples;this.schedule(this.step+1,this.nextBoundary);
 }
 render(left,right,n=left.length){
  const selected=this.options.track,busFilter=this.options.bus;
  for(let j=0;j<n;j++,this.frame++){
   if(this.running&&this.frame>=this.nextBoundary)this.boundary();
   while(this.events.length&&this.events[this.events.length-1].at<=this.frame){
    const e=this.events.pop();this.trigger(e.track,e.s.note,e.vel,e.gate,e.s,e.seed);
   }
   let l=0,r=0,dl=0,dr=0,vl=0,vr=0,detector=0;const channels=this.channels;
   for(let i=0;i<channels.length;i++){
    const c=channels[i],t=c.t;let signal=0;
    for(let k=0;k<c.voices.length;k++){const v=c.voices[k];if(v.active)signal+=v.next();}
    if(c.kind===0)detector=Math.max(detector,Math.abs(signal));
    if(c.kind===1||c.kind===4)signal/=1+detector*(t.params.sidechain||0)*7;
    c.g+=(c.to-c.g)*this.gSmooth;
    let stereoReturn=0;
    if(c.rumble){const b=c.rumble,m=b.buffer.length,pos=b.head;
     const echo=b.buffer[(pos-c.echoOffset+m)%m],room=b.buffer[(pos-c.verbOffset+m)%m];
     const tail=echo*t.params.feedback*.48+room*(t.params.reverb??.37)*.36;
     b.buffer[pos]=clamp(signal+tail,-1.6,1.6);b.head=(pos+1)%m;
     b.low+=(room-b.low)*this.gSmooth;stereoReturn=(room-b.low)*t.params.width*.25*c.g;
     signal+=tail;
    }
    const dry=signal*c.g*(t.invert?-1:1);let x=dry*c.lp+stereoReturn,y=dry*c.rp-stereoReturn;
    for(let k=0;k<c.fx.length;k++){const fx=c.fx[k];fx.step(x,y,detector);x=fx.L;y=fx.R;}
    const width=t.width??1;
    if(width!==1){const m=(x+y)*.5,s=(x-y)*.5*width;x=m+s;y=m-s;}
    const power=(x*x+y*y)*.5;c.energy+=(power-c.energy)*.0015;c.peak=Math.max(Math.abs(x),Math.abs(y),c.peak*.9997);
    this.busLv[c.b]=Math.max(this.busLv[c.b]*.9992,Math.abs(x),Math.abs(y));
    if(selected!=null&&selected!==i||busFilter&&busFilter!=='returns'&&t.bus!==busFilter)continue;
    x*=this.busGain[c.b];y*=this.busGain[c.b];if(busFilter!=='returns'){l+=x;r+=y;}
    dl+=x*t.sendDelay;dr+=y*t.sendDelay;vl+=x*t.sendReverb;vr+=y*t.sendReverb;
   }
   this.delay.step(dl,dr);this.reverb.step(vl,vr);
   l+=((this.delay.L-dl)+(this.reverb.L-vl))*this.busGain[5];r+=((this.delay.R-dr)+(this.reverb.R-vr))*this.busGain[5];
   if(this.options.mastering!==false){for(let k=0;k<this.masterFx.length;k++){const f=this.masterFx[k];f.step(l,r,detector);l=f.L;r=f.R;}}
   const a=l-this.histL+this.dcCoeff*this.dcL,b=r-this.histR+this.dcCoeff*this.dcR;
   this.histL=l;this.histR=r;this.dcL=a;this.dcR=b;l=a*this.volume;r=b*this.volume;
   if(Math.abs(l)>1||Math.abs(r)>1)this.clipped=true;
   if(this.options.mastering!==false){this.limiter.step(l,r,this.ceil);l=this.limiter.L;r=this.limiter.R;}
   if(this.clickFrames>0){const click=.19*Math.sin(this.clickPhase)*this.clickFrames/(.03*this.rate);this.clickPhase+=2*Math.PI*this.clickHz/this.rate;this.clickFrames--;l=clamp(l+click,-this.ceil,this.ceil);r=clamp(r+click,-this.ceil,this.ceil);}
   left[j]=l;right[j]=r;
   if(!this.options.offline){this.masterPeak[0]=Math.max(this.masterPeak[0],Math.abs(l));this.masterPeak[1]=Math.max(this.masterPeak[1],Math.abs(r));
    this.squareL+=l*l;this.squareR+=r*r;this.dot+=l*r;this.meterN++;}
  }
 }
 status(){
  const n=Math.max(1,this.meterN),masterPeak=this.masterPeak.slice(),masterRms=[Math.sqrt(this.squareL/n),Math.sqrt(this.squareR/n)];
  const correlation=this.squareL&&this.squareR?clamp(this.dot/Math.sqrt(this.squareL*this.squareR),-1,1):0,clipped=this.clipped;
  this.masterPeak[0]=this.masterPeak[1]=0;this.squareL=this.squareR=this.dot=this.meterN=0;this.clipped=false;
  return {masterPeak,masterRms,correlation,clipped,playing:this.running,step:this.local??0,absoluteStep:this.step,scene:this.scene,bar:this.bar,bpm:this.p.bpm,
   levels:this.channels.map(c=>Math.sqrt(c.energy)),peaks:this.channels.map(c=>c.peak),buses:Array.from(this.busLv),queuedScene:this.queue,ended:!!this.ended};
 }
}
