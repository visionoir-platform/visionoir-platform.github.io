import {clamp} from './model.js';

const tau=Math.PI*2;
const soft=x=>x/(1+Math.abs(x));
const comp=(x,k)=>Math.sign(x)*(Math.min(Math.abs(x),k)+Math.max(0,Math.abs(x)-k)*.22);
const delayed=new Set(['delay','pingpong','reverb','industrialverb','chorus','flanger','freeze','glitch','repeat']);
export class Effect {
 constructor(spec,rate,bpm){
  this.id=spec.id;this.rate=rate;this.lastL=this.lastR=this.lowL=this.lowR=this.highL=this.highR=this.zL=this.zR=this.env=this.wet=this.write=this.phase=this.head=this.frame=0;
  this.amount=clamp(Number(spec.amount)||0,0,1);this.target=spec.bypass?0:1;
  this.bufL=this.bufR=null;
  if(delayed.has(this.id)){
   const time=['chorus','flanger'].includes(this.id)?.05:['reverb','industrialverb'].includes(this.id)?.21:1.55;
   this.bufL=new Float32Array(Math.ceil(time*rate)+3);this.bufR=new Float32Array(this.bufL.length);
  }
  this.configure(spec,bpm);
 }
 configure(spec,bpm){
  this.target=spec.bypass?0:1;this.amount=clamp(Number.isFinite(spec.amount)?spec.amount:.4,0,1);
  this.beat=60/bpm;this.block=Math.max(16,Math.round(this.beat*this.rate*(this.amount>.55?.25:.5)));
  const center=180+this.amount*3100,w=2*Math.PI*center/this.rate,A=10**((this.amount-.5)*12/40),alpha=Math.sin(w)/1.4,a0=1+alpha/A;
  this.b0=(1+alpha*A)/a0;this.b1=-2*Math.cos(w)/a0;this.b2=(1-alpha*A)/a0;this.a1=this.b1;this.a2=(1-alpha/A)/a0;
  this.cut=1-Math.exp(-tau*(160+this.amount*this.amount*12000)/this.rate);
  this.hicut=1-Math.exp(-tau*2800/this.rate);this.locut=1-Math.exp(-tau*180/this.rate);
  this.smooth=1-Math.exp(-1/(.006*this.rate));
 }
 step(l,r,detector=0){
  this.wet+=(this.target-this.wet)*this.smooth;
  if(this.wet<.0001&&this.target===0){this.L=l;this.R=r;return;}
  const a=this.amount,rate=this.rate;let x=l,y=r;
  this.frame++;
  switch(this.id){
  case 'eq':{x=this.b0*l+this.lowL;y=this.b0*r+this.lowR;this.lowL=this.b1*l-this.a1*x+this.highL;this.lowR=this.b1*r-this.a1*y+this.highR;this.highL=this.b2*l-this.a2*x;this.highR=this.b2*r-this.a2*y;break;}
  case 'compressor':case 'sidechain':case 'gate':case 'transient':{
   const impulse=this.id==='sidechain'?detector:Math.max(Math.abs(l),Math.abs(r));
   this.env+=(impulse-this.env)*(impulse>this.env?.013:.00017)*Math.min(2,48000/rate);
   if(this.id==='compressor'){const g=this.env>.6-a*.49?((.6-a*.49)/this.env)**.72:1;x*=g;y*=g;}
   else if(this.id==='sidechain'){x/=1+this.env*a*14;y/=1+this.env*a*14;}
   else if(this.id==='gate'){const g=clamp((this.env-(.001+a*.07))*120,0,1);x*=g;y*=g;}
   else {const g=1+Math.max(-.4,Math.min(1,(impulse-this.env)*5))*a*2;x*=g;y*=g;}break;}
  case 'limiter':{const c=1-a*.65,g=Math.max(1,Math.abs(l)/c,Math.abs(r)/c);x/=g;y/=g;break;}
  case 'softclip':x=soft(l*(1+4*a));y=soft(r*(1+4*a));break;
  case 'hardclip':x=clamp(l,-1+a*.85,1-a*.85);y=clamp(r,-1+a*.85,1-a*.85);break;
  case 'saturation':x=Math.tanh(l*(1+a*4));y=Math.tanh(r*(1+a*4));break;
  case 'overdrive':x=Math.tanh(l*(1+9*a)+.18)-.17808;y=Math.tanh(r*(1+9*a)+.18)-.17808;break;
  case 'distortion':x=comp(l*(1+a*15),.38);y=comp(r*(1+a*15),.38);break;
  case 'waveshaper':x=Math.sin(clamp(l*(1+a*9),-4,4));y=Math.sin(clamp(r*(1+a*9),-4,4));break;
  case 'bitcrusher':{const n=2**(12-Math.floor(a*10));x=Math.round(l*n)/n;y=Math.round(r*n)/n;break;}
  case 'reduction':if(this.frame%(1+Math.floor(a*26))===0){this.lastL=l;this.lastR=r;}x=this.lastL;y=this.lastR;break;
  case 'filter':this.lowL+=this.cut*(l-this.lowL);this.lowR+=this.cut*(r-this.lowR);x=this.lowL;y=this.lowR;break;
  case 'dj':this.lowL+=this.cut*(l-this.lowL);this.lowR+=this.cut*(r-this.lowR);x=a<.5?this.lowL:l-this.lowL;y=a<.5?this.lowR:r-this.lowR;break;
  case 'resonant':{
   const g=Math.min(.7,this.cut);this.lowL+=g*this.highL;this.highL+=g*(l-this.lowL-(.38+.3*(1-a))*this.highL);
   this.lowR+=g*this.highR;this.highR+=g*(r-this.lowR-(.38+.3*(1-a))*this.highR);x=this.lowL;y=this.lowR;break;}
  case 'phaser':{this.phase+=tau*.33/rate;const k=.4+.37*Math.sin(this.phase)*a;
   x=-k*l+this.lastL+k*this.zL;y=-k*r+this.lastR+k*this.zR;this.lastL=l;this.lastR=r;this.zL=x;this.zR=y;x=.5*l+.5*x;y=.5*r+.5*y;break;}
  case 'stereo':{const mid=(l+r)*.5,side=(l-r)*a;x=mid+side;y=mid-side;break;}
  case 'multiband':case 'mastering':{this.lowL+=(l-this.lowL)*this.locut;this.lowR+=(r-this.lowR)*this.locut;
   this.highL+=(l-this.highL)*this.hicut;this.highR+=(r-this.highR)*this.hicut;const thr=.72-.48*a;
   x=comp(this.lowL,thr)+comp(this.highL-this.lowL,thr*.7)+comp(l-this.highL,thr*.44);
   y=comp(this.lowR,thr)+comp(this.highR-this.lowR,thr*.7)+comp(r-this.highR,thr*.44);
   if(this.id==='mastering'){x=Math.tanh(x*(1+.8*a));y=Math.tanh(y*(1+.8*a));}break;}
  default:if(this.bufL){
   const n=this.bufL.length,w=this.write;
   let offL=this.beat*rate*.75,offR=offL,fb=.22+.42*a,wet=.22+.41*a;
   if(this.id==='chorus'||this.id==='flanger'){
    this.phase+=tau*(this.id==='chorus'?.68:.18)/rate;
    const base=this.id==='chorus'?.016:.003;offL=rate*base*(1+.55*Math.sin(this.phase));offR=rate*base*(1+.55*Math.cos(this.phase));fb=this.id==='flanger'?.53:.10;
   }else if(this.id==='reverb'||this.id==='industrialverb'){offL=rate*(this.id==='reverb'?.0361:.0871);offR=rate*(this.id==='reverb'?.0497:.1193);fb=.54+.26*a;wet=.2+.4*a;}
   else if(['repeat','glitch','freeze'].includes(this.id)){
    const size=Math.min(this.block,n-1),pos=this.frame%size;
    if(pos===0){const blockNumber=Math.floor(this.frame/size);if(this.id==='freeze'?this.frame<=size*2:this.id==='repeat'?blockNumber%4===0:blockNumber%3===0)this.head=(w-size+n)%n;}
    const window=Math.min(1,pos/32,(size-pos)/32);
    x=l*(1-a)+a*this.bufL[(this.head+pos)%n]*window;y=r*(1-a)+a*this.bufR[(this.head+pos)%n]*window;
    if(this.id!=='freeze'||this.frame<=size*2){this.bufL[w]=l;this.bufR[w]=r;this.write=(w+1)%n;}break;
   }
   const dl=this.bufL[(w-Math.min(n-1,Math.max(1,Math.round(offL)))+n)%n],dr=this.bufR[(w-Math.min(n-1,Math.max(1,Math.round(offR)))+n)%n];
   const cross=['pingpong','reverb','industrialverb'].includes(this.id);
   const backL=cross?dr:dl,backR=cross?dl:dr;
   this.bufL[w]=clamp(l+fb*backL,-2,2);this.bufR[w]=clamp(r+fb*backR,-2,2);
   this.write=(w+1)%n;x=l+dl*wet;y=r+dr*wet;
   if(this.id==='industrialverb'){x+=this.bufR[(w+Math.floor(n*.46))%n]*wet*.45;y+=this.bufL[(w+Math.floor(n*.62))%n]*wet*.45;}
  }}
  this.L=l+(x-l)*this.wet;this.R=r+(y-r)*this.wet;
 }
}
