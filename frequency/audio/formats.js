import {totalBars,clamp,validateProject} from './model.js';
import {arrangementAt,planStep} from './sequencer.js';
const ascii=(view,off,text)=>{for(let i=0;i<text.length;i++)view.setUint8(off+i,text.charCodeAt(i));};
export function wavHeader({frames,sampleRate,bits,channels,title=''}){
 const data=frames*channels*(bits/8);if(data>0xffffffff-65536)throw Error('export.riffLimit');
 const name=new TextEncoder().encode(title.slice(0,240)+'\0'),titleLen=name.length+(name.length%2),extra=title?20+titleLen:0;
 const pad=data%2,buf=new Uint8Array(44+extra),v=new DataView(buf.buffer);
 ascii(v,0,'RIFF');v.setUint32(4,36+extra+data+pad,true);ascii(v,8,'WAVEfmt ');v.setUint32(16,16,true);
 v.setUint16(20,bits===32?3:1,true);v.setUint16(22,channels,true);v.setUint32(24,sampleRate,true);
 v.setUint32(28,sampleRate*channels*bits/8,true);v.setUint16(32,channels*bits/8,true);v.setUint16(34,bits,true);
 if(extra){ascii(v,36,'LIST');v.setUint32(40,12+titleLen,true);ascii(v,44,'INFOINAM');v.setUint32(52,name.length,true);buf.set(name,56);}
 ascii(v,36+extra,'data');v.setUint32(40+extra,data,true);return buf;
}
export function wavPCM(l,r,n,bits,channels,scale,random){
 const b=new Uint8Array(n*channels*bits/8),v=new DataView(b.buffer);let off=0;
 for(let i=0;i<n;i++)for(let c=0;c<channels;c++){
  const raw=scale*(channels===1?(l[i]+r[i])*.5:c?r[i]:l[i]);if(!Number.isFinite(raw))throw Error('export.nonfinite');
  if(bits===32){v.setFloat32(off,raw,true);off+=4;continue;}
  const max=2**(bits-1),d=random.next()-random.next(),sample=clamp(Math.round(raw*max+d),-max,max-1);
  if(bits===16){v.setInt16(off,sample,true);off+=2;}else{b[off++]=sample;b[off++]=sample>>8;b[off++]=sample>>16;}
 }
 return b;
}
export class Dither {constructor(){this.state=19735124;}next(){this.state=(Math.imul(1664525,this.state)+1013904223)>>>0;return this.state/4294967296;}}
const u16be=n=>[n>>8&255,n&255],u32be=n=>[n>>>24,n>>>16&255,n>>>8&255,n&255];
function vlq(n){let r=[n&127];while((n>>>=7))r.unshift((n&127)|128);return r;}
const encoder=new TextEncoder();
export function renderMidi(p){
 validateProject(p);const ppqn=480,stepTicks=ppqn/4,tempo=Math.round(60e6/p.bpm);
 const tracks=p.tracks.map(()=>[]),meta=[];
 const text=(str,type)=>{const b=encoder.encode(str);return [255,type,...vlq(b.length),...b];};
 meta.push({tick:0,bytes:[255,81,3,tempo>>>16,tempo>>>8&255,tempo&255]},{tick:0,bytes:[255,88,4,4,2,24,8]});
 const channel=i=>i%16;
 p.tracks.forEach((t,i)=>tracks[i].push({tick:0,bytes:text(t.name,3)},{tick:0,bytes:[176|channel(i),7,Math.round(t.volume*127)]},{tick:0,bytes:[176|channel(i),10,Math.round((t.pan+1)*63.5)]}));
 const end=totalBars(p)*16;if(end>300000)throw Error('export.midiSize');
 for(let step=0;step<end;step++){
  const {scene,local,clip}=arrangementAt(p,step);if(local===0)meta.push({tick:step*stepTicks,bytes:text(clip.marker||p.scenes[scene].name,6)});
  planStep(p,step,scene,local,(i,s,offset,gate,velocity)=>{
   const at=Math.max(0,Math.round((step+offset)*stepTicks)),note=clamp(Math.round(s.note),0,127),on=clamp(Math.round(velocity*(s.accent?1.17:1)*127),1,127);
   tracks[i].push({tick:at,bytes:[144|channel(i),note,on]},{tick:at+Math.max(1,Math.round(gate*stepTicks)),bytes:[128|channel(i),note,0]});
  },clip);
 }
 const chunks=[Uint8Array.from([...encoder.encode('MThd'),0,0,0,6,0,1,...u16be(tracks.length+1),...u16be(ppqn)])];
 for(const events of [meta,...tracks]){events.sort((a,b)=>a.tick-b.tick);let prev=0;const bytes=[];
  for(const e of events){bytes.push(...vlq(e.tick-prev),...e.bytes);prev=e.tick;}bytes.push(0,255,47,0);
  chunks.push(Uint8Array.from([...encoder.encode('MTrk'),...u32be(bytes.length)]),Uint8Array.from(bytes));
 }
 return new Blob(chunks,{type:'audio/midi'});
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
async function crc(blob){let c=0xffffffff;const reader=blob.stream().getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;for(const b of value)c=crcTable[(c^b)&255]^(c>>>8);}}finally{reader.releaseLock();}return(c^0xffffffff)>>>0;}
export async function zipFiles(files){
 if(files.length>65535)throw Error('export.zipLimit');const out=[],central=[],names=new Set();let head=0,dirSize=0;
 for(const {name,blob} of files){if(!name||name.includes('..')||name.startsWith('/')||name.includes('\\')||names.has(name))throw Error('export.zipName');names.add(name);
  const file=encoder.encode(name),sum=await crc(blob);if(blob.size+head>0xffffffff)throw Error('export.zipLimit');
  const loc=new Uint8Array(30+file.length),v=new DataView(loc.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,2048,true);
  v.setUint16(12,33,true);v.setUint32(14,sum,true);v.setUint32(18,blob.size,true);v.setUint32(22,blob.size,true);v.setUint16(26,file.length,true);loc.set(file,30);
  const cen=new Uint8Array(46+file.length),w=new DataView(cen.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);cen.set(loc.subarray(4,30),6);w.setUint32(42,head,true);cen.set(file,46);
  out.push(loc,blob);central.push(cen);head+=loc.length+blob.size;dirSize+=cen.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,dirSize,true);v.setUint32(16,head,true);
 return new Blob([...out,...central,end],{type:'application/zip'});
}
