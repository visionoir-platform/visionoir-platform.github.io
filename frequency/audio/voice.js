import {clamp,noteHz,PARAMETER_BANK} from './model.js';
const TABLE=new Float32Array(8193);
for(let i=0;i<TABLE.length;i++)TABLE[i]=Math.sin(2*Math.PI*i/8192);
const osc=p=>{const x=(p-Math.floor(p))*8192,i=x|0;return TABLE[i]+(TABLE[i+1]-TABLE[i])*(x-i);};
function blep(p,dt){
 if(p<dt){const t=p/dt;return 2*t-t*t-1;}
 if(p>1-dt){const t=(p-1)/dt;return t*t+2*t+1;}
 return 0;
}
const saw=(p,inc)=>2*p-1-blep(p,Math.min(.49,inc));
const square=(p,inc)=>(p<.5?1:-1)+blep(p,Math.min(.49,inc))-blep((p+.5)%1,Math.min(.49,inc));
const envelope=(seconds,rate)=>Math.exp(-1/Math.max(1,rate*seconds));
const SAT=x=>x/(1+Math.abs(x));
const durations=[.17,.41,.16,.14,.19,.085,.035,.18,.095,.29,.13,.22,.74,.3,.19,.23];
export function decodePCM(sample){
 if(!sample)return null;
 const str=sample.pcm;const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 const bytes=new Uint8Array((str.length>>2)*3-(str.endsWith('==')?2:str.endsWith('=')?1:0));
 const map=new Uint8Array(128);for(let i=0;i<64;i++)map[alphabet.charCodeAt(i)]=i;
 let j=0;for(let i=0;i<str.length;i+=4){
  const bits=(map[str.charCodeAt(i)]<<18)|(map[str.charCodeAt(i+1)]<<12)|(map[str.charCodeAt(i+2)]<<6)|map[str.charCodeAt(i+3)];
  bytes[j++]=bits>>16;bytes[j++]=bits>>8;bytes[j++]=bits;
 }
 const view=new DataView(bytes.buffer),pcm=new Float32Array(bytes.length>>1);
 for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(i*2,true)/32768;
 return {rate:sample.rate,pcm};
}
let factorySample;
export function factoryGlass(){
 if(factorySample)return factorySample;
 const rate=24000,pcm=new Float32Array(Math.floor(rate*.51));let rnd=41295514;
 for(let i=0;i<pcm.length;i++){
  const t=i/rate;rnd=(Math.imul(1664525,rnd)+1013904223)|0;
  const strike=.44*osc(t*411)*Math.exp(-12*t)+.31*osc(t*949.8)*Math.exp(-27*t)+.22*osc(t*1671.3)*Math.exp(-34*t);
  pcm[i]=(strike+.16*rnd/2147483648*Math.exp(-130*t))*Math.min(1,i/9);
 }
 factorySample={rate,pcm};return factorySample;
}
const defaults=Object.values(PARAMETER_BANK);
export class Voice {
 constructor(rate){this.rate=rate;this.active=false;this.p={};}
 start(kind,note,velocity,gate,spec,locks,seed,oldFreq=0,slide=false,accent=false,sample=null){
  const p=this.p;Object.assign(p,defaults[kind],spec,locks||{});
  this.kind=kind;this.note=note;this.vel=clamp(velocity*(accent?1.17:1),0,1.4);
  this.frequency=clamp(noteHz(note),8,this.rate*.32);this.inc=this.frequency/this.rate;
  this.from=oldFreq&&slide?(oldFreq-this.frequency)/this.rate:0;this.glide=oldFreq&&slide?1:0;
  this.glideRate=envelope(.005+.18*(p.glide||0),this.rate);
  this.ph=kind===4?p.phase:0;this.ph2=this.ph3=this.ph4=0;
  this.env=1;this.fast=1;this.slow=1;this.fastRate=envelope(.006,this.rate);this.slowRate=envelope(.042,this.rate);
  this.age=0;this.attack=1/Math.max(4,this.rate*(kind===12?.04+p.attack*.55:kind===0?.0006+p.attack*.03:kind===15?.001+p.attack*.4:.0017));
  this.gate=Math.max(1,Math.round(gate*this.rate));this.held=[2,3,4,10,11,12,13,14,15].includes(kind);if(kind===15&&p.oneShot>.5&&p.loop<=.5)this.gate=this.rate*95;
  this.release=envelope(durations[kind]*(.24+2.2*(p.decay??.4))*(kind===0?.74+p.tail:1),this.rate);
  this.noise=seed|1;this.lp=this.bp=this.hp=this.lastNoise=0;this.active=true;
  this.cut=clamp((110+6500*(p.cutoff??p.color??.5)**2)*6.283/this.rate,.002,.77);
  this.bright=(p.color??p.cutoff??.5);this.freq1=noteHz(note+7)/this.rate;this.freq2=noteHz(note+(p.chord>.6?4:3))/this.rate;
  this.sample=sample;this.idx=0;this.step=1;
  if(kind===15&&sample){const len=sample.pcm.length;
   this.lo=clamp(Math.floor(len*(p.start+(p.slice||0)*.35)),0,Math.max(0,len-2));this.hi=clamp(Math.floor(len*p.end),this.lo+1,len);
   this.step=sample.rate/this.rate*2**((note-60+(p.pitch-.5)*24)/12)*(p.reverse>.5?-1:1);this.idx=this.step<0?this.hi-1:this.lo;
  }
  this.kickInc=(32+39*p.pitch)*2**((note-36+(p.tuning-.5)*12)/12)/this.rate;
 }
 stopGate(){this.gate=Math.min(this.gate,this.age);}
 choke(){this.gate=0;this.release=envelope(.004,this.rate);this.held=false;}
 next(){
  if(!this.active)return 0;
  const p=this.p,n=this.age++,inc=this.inc+this.from*this.glide;let ph=this.ph;
  this.glide*=this.glideRate;
  const rnd=this.noise=(Math.imul(this.noise,1664525)+1013904223)|0;
  const noise=rnd/2147483648;
  this.fast*=this.fastRate;this.slow*=this.slowRate;
  if(!this.held||n>this.gate)this.env*=this.release;
  if(this.env<.00016||n>this.gate+this.rate*7){this.active=false;return 0;}
  let x=0,step=inc,near=0;
  switch(this.kind){
  case 0:{
   step=this.kickInc*(1+this.fast*(4+29*p.sweep)+this.slow*p.punch*2.7);
   const sine=osc(ph),harm=osc(2*ph)*p.harmonics*.38,body=(sine+harm)*(.65+p.body*.55);
   const click=(noise*.55+osc(ph*7)*.45)*this.fast*(p.click+.2*p.transient);
   const drive=body+click,asym=SAT(drive*(1+p.drive*4)+.06*p.distortion)-SAT(.06*p.distortion);
   x=(asym*(.7+.48*p.drive)+Math.tanh(drive*(1+3*p.saturation))*.35)*p.output;break;}
  case 1:{const phase=ph+p.phase*.17,rough=osc(phase+osc(phase*1.5)*.32*p.drive);
   this.lp+=(rough-this.lp)*(.007+.09*p.tone);x=SAT((this.lp+osc(phase*.5+this.slow*p.delay)*p.feedback*.64)*(1+3*p.drive));break;}
  case 2:{const source=p.wave>.5?square(ph,inc):saw(ph,inc);
   const fc=Math.min(.74,this.cut+this.slow*(.06+.58*p.env)*Math.min(1,48000/this.rate));
   this.lp+=fc*this.bp;this.bp+=fc*(source-this.lp-(1.3-1.13*p.resonance)*this.bp);
   x=SAT((this.lp+.16*this.bp)*(1+5*p.drive));break;}
  case 3:{const mod=osc(ph*(1+Math.round(p.ratio*7)))*p.mod*(.21+.62*this.slow);
   const raw=osc(ph+mod)+.34*saw(ph,inc);this.lp+=this.cut*(raw-this.lp);x=SAT(this.lp*(1+6*p.drive));break;}
  case 4:x=.8*osc(ph)+p.tone*.24*osc(2*ph);break;
  case 5:x=SAT((osc(ph*(1.4+this.slow*1.8))*p.body+osc(ph*3.31+osc(ph*5.7)*.38)*p.metal+noise*this.fast*.64)*(1+8*p.drive));break;
  case 6:case 7:{
   const hp=noise-this.lastNoise;this.lastNoise=noise;this.lp+=(hp-this.lp)*(.19+.76*p.color);
   const metal=(osc(ph*4.15)*osc(ph*6.32)+osc(ph*9.28)*osc(ph*5.38))*.40;
   x=(this.lp*.65+metal*p.metal)*.85;break;}
  case 8:{const t=n/this.rate;const clap=this.fast+.62*Math.exp(-Math.abs(t-.012)*630)+.52*Math.exp(-Math.abs(t-.024)*600);
   this.lp+=(noise-this.lp)*Math.min(.7,3400/this.rate);
   x=osc(ph*(1+this.slow*.3))*p.body*.83+(noise-this.lp)*p.noise*(.55+.85*p.clap*clap);break;}
  case 9:x=(osc(ph*2.73)*osc(ph*7.19)+.65*osc(ph*4.17)*osc(ph*8.27))*.33*p.shimmer+osc(ph*3.23)*p.bell*(.24+this.slow*.48)+noise*.11;break;
  case 10:{const raw=(saw(ph,inc)+saw(this.ph2,this.freq1)+saw(this.ph3,this.freq2))*.40;
   this.ph2=(this.ph2+this.freq1*(1+.009*p.detune))%1;this.ph3=(this.ph3+this.freq2*(1-.008*p.detune))%1;
   this.lp+=(raw-this.lp)*(.03+p.color*.31+this.slow*.22);x=this.lp;break;}
  case 11:{const dst=(saw(ph,inc)*(1-p.wave)+square(ph,inc)*p.wave+.48*saw(this.ph2,inc))*.65;
   this.ph2=(this.ph2+inc*(1+.022*p.detune))%1;this.lp+=this.cut*(dst-this.lp);x=this.lp;break;}
  case 12:{this.ph2=(this.ph2+this.freq1*(1+.005*p.drift))%1;this.ph3=(this.ph3+this.freq2)%1;
   x=(osc(ph+this.ph2*.022*p.color)+.58*osc(this.ph2)+.48*osc(this.ph3)+.18*saw(ph,inc)*p.color)*.51;break;}
  case 13:{const prog=Math.min(1,n/this.gate),motion=p.sweep>.5?prog:1-prog;
   const fc=clamp((.003+.48*motion*motion)*48000/this.rate,.001,.65);this.lp+=fc*this.bp;this.bp+=fc*(noise-this.lp-.3*this.bp);
   const chop=osc(n/this.rate*(4+18*p.grain))>.08?1:1-p.grain;x=(this.bp+this.lp*p.color)*chop;break;}
  case 14:{const ratio=1+Math.round(p.ratio*9),mod=osc(ph*ratio+this.slow*osc(ph*2.07)*p.algorithm*.7);
   x=osc(ph+mod*p.index*(.08+.82*this.slow))*.85;break;}
  case 15:{
   if(this.sample){if(this.idx<this.lo||this.idx>=this.hi){if(p.loop>.5)this.idx=this.step<0?this.hi-1:this.lo;else{this.active=false;return 0;}}
    const ix=Math.floor(this.idx),f=this.idx-ix,pcm=this.sample.pcm;near=pcm[ix]+(pcm[Math.min(ix+1,pcm.length-1)]-pcm[ix])*f;this.idx+=this.step;
   }else{ // Original struck-glass factory one-shot, no external recording.
    near=osc(ph*2.13)*this.slow+.52*osc(ph*3.72)*this.env+.24*noise*this.fast;}
   this.lp+=this.cut*(near-this.lp);x=this.lp*(.2+p.gain*1.5);break;}
  }
  ph+=step;this.ph=ph-Math.floor(ph);
  return x*this.vel*this.env*Math.min(1,(n+1)*this.attack);
 }
}
