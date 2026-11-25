import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createProject,validateProject,INSTRUMENTS,EFFECTS,DEMOS,projectFile,readProject} from '../model.js';
import {PATCHES,CHAINS,EXTRA_DEMOS} from '../library.js';
import {DSP} from '../dsp.js';
import {Effect} from '../fx.js';
import {planStep} from '../sequencer.js';
import {renderOffline} from '../offline.js';
import {renderMidi,zipFiles} from '../formats.js';
const out=await mkdtemp(join(tmpdir(),'frequency-qa-'));
function peak(channel){let maximum=0;for(const x of channel){assert(Number.isFinite(x));maximum=Math.max(maximum,Math.abs(x));}return maximum;}
const digest=b=>createHash('sha256').update(b).digest('hex');
const unique=new Set(),summary={instruments:[],effects:[],exports:[],projects:[],transport:{}};
for(let i=0;i<INSTRUMENTS.length;i++){
 const p=createProject(),d=new DSP(p,48000),left=new Float32Array(24000),right=new Float32Array(left.length);
 d.trigger(i,48,.9,.15);d.render(left,right);const max=peak(left);assert(max>.002,INSTRUMENTS[i].id);
 const key=digest(Buffer.from(left.buffer));assert(!unique.has(key));unique.add(key);
 summary.instruments.push({id:INSTRUMENTS[i].id,peak:+max.toFixed(4)});
}
for(const f of EFFECTS){
 const e=new Effect({...f,amount:.72},48000,155);
 let diff=0,energy=0;
 for(let i=0;i<96000;i++){const amp=(i<18000?.8:i<80000?.020:.42),l=amp*(Math.sin(i*.09)+.22*Math.cos(i*.71)),r=amp*Math.cos(i*.031);
  e.step(l,r,.62+.3*Math.cos(i*.002));assert(Number.isFinite(e.L)&&Number.isFinite(e.R));diff+=(e.L-l)**2+(e.R-r)**2;energy+=e.L**2+e.R**2;}
 assert(diff>.01,f.id);assert(energy>.0001,f.id);summary.effects.push({id:f.id,rmsDifference:+Math.sqrt(diff/192000).toFixed(4)});
 e.configure({...f,bypass:true},155);for(let k=0;k<40000;k++)e.step(.24,-.33,.34);assert(Math.abs(e.L-.24)<.0002,f.id);
}
for(const demo of [...DEMOS,...EXTRA_DEMOS]){
 const p=validateProject(createProject(demo.id));assert(p.scenes.length>=8);assert(p.arrangement.reduce((n,s)=>n+s.bars,0)>=80);
 const round=await readProject(projectFile(p));assert.deepEqual(round,p);
 const audio=await renderOffline(p,{sampleRate:44100,scene:6,bars:.125,tail:0});const hash=digest(Buffer.from(await audio.arrayBuffer()));
 assert(!unique.has(hash));unique.add(hash);summary.projects.push({id:demo.id,hash:hash.slice(0,16)});
}
assert.equal(PATCHES.length,124);assert.equal(CHAINS.length,28);
const patchHashes=new Set();
for(const patch of PATCHES){
 const project=createProject(),i=project.tracks.findIndex(track=>track.instrument===patch.instrument);
 Object.assign(project.tracks[i].params,patch.params);
 const dsp=new DSP(project,44100),l=new Float32Array(6000),r=new Float32Array(l.length);
 dsp.trigger(i,48,.85,.18);dsp.render(l,r);assert(peak(l)>.001,patch.id);
 const key=digest(Buffer.from(l.buffer));assert(!patchHashes.has(key),patch.id);patchHashes.add(key);
}
const chainHashes=new Set();
for(const chain of CHAINS){
 const project=createProject('forge');
 if(chain.scope==='master')project.master.fx=structuredClone(chain.fx);else project.tracks[0].fx=structuredClone(chain.fx);
 const dsp=new DSP(project,44100),l=new Float32Array(33075),r=new Float32Array(l.length);
 dsp.start({scene:6});dsp.render(l,r);assert(peak(l)>.01,chain.id);
 const key=digest(Buffer.from(l.buffer));assert(!chainHashes.has(key),chain.id);chainHashes.add(key);
}
let test=createProject(),pattern=test.scenes[0].patterns[2];pattern.steps[1]={note:48,velocity:.6,offset:-.12,gate:1,ratchet:2,flam:true,condition:2,probability:1,locks:{cutoff:.69},chord:[3,7]};
test.swing=.2;
const ev=[];planStep(test,1,0,1,(track,note,time,gate,vel)=>ev.push([note.note,time,gate,vel]));
assert.equal(ev.length,7);assert.equal(ev[0][0],48);assert(Math.abs(ev[0][1]-.08)<1e-7);assert.deepEqual(ev.slice(1,3).map(e=>e[0]),[51,55]);
planStep(test,17,0,17,()=>assert.fail('conditional trigger fired on second pass'));
planStep(test,1,0,1,()=>assert.fail('muted clip emitted events'),{trackScenes:[null,null,-1]});
pattern.steps[1].probability=0;planStep(test,1,0,1,()=>assert.fail('zero probability'));
const imported=createProject();const pcm=Buffer.alloc(16000);for(let i=0;i<8000;i++)pcm.writeInt16LE(Math.round(17000*Math.sin(i*.08)*(1-i/8000)),i*2);
imported.tracks[15].sample={name:'Generated test sweep',rate:24000,pcm:pcm.toString('base64')};
const sampleVariants=new Set();for(const settings of [{reverse:0,start:0},{reverse:1,start:0},{start:.24,reverse:0},{pitch:.8,reverse:0,start:0}]){
 Object.assign(imported.tracks[15].params,settings);const dsp=new DSP(validateProject(imported),44100),l=new Float32Array(8192),r=new Float32Array(l.length);
 dsp.trigger(15,60,1,.2);dsp.render(l,r);assert(peak(l)>.001);sampleVariants.add(digest(Buffer.from(l.buffer)));
}
assert.equal(sampleVariants.size,4);
const p=createProject('forge');
for(const sampleRate of [44100,48000,88200,96000,176400,192000])for(const bits of [16,24,32]){
 const b=await renderOffline(p,{sampleRate,bits,scene:6,bars:.125,tail:.01});
 const a=Buffer.from(await b.arrayBuffer()),offset=a.indexOf('data',36),frames=a.readUInt32LE(offset+4)/(bits/8*2);
 assert.equal(a.readUInt32LE(24),sampleRate);assert.equal(a.readUInt16LE(34),bits);assert.equal(a.readUInt16LE(20),bits===32?3:1);assert.equal(a.readUInt32LE(4)+8,b.size);
 assert.equal(frames,Math.round(.125*240/p.bpm*sampleRate)+Math.round(.01*sampleRate));const path=join(out,'audio-'+sampleRate+'-'+bits+'.wav');await writeFile(path,a);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=sample_rate,channels,codec_name,bits_per_sample','-of','json',path],{encoding:'utf8'})).streams[0];
 assert.equal(+probe.sample_rate,sampleRate);assert.equal(probe.channels,2);assert.equal(probe.bits_per_sample,bits);
 execFileSync('ffmpeg',['-v','error','-i',path,'-f','null','-']);summary.exports.push(probe);
}
for(const bitrate of [128,192,256,320]){
 const b=await renderOffline(p,{format:'mp3',bitrate,scene:6,bars:1,tail:0}),path=join(out,'audio-'+bitrate+'.mp3');await writeFile(path,Buffer.from(await b.arrayBuffer()));
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,bit_rate,sample_rate,channels','-of','json',path],{encoding:'utf8'})).streams[0];
 assert.equal(probe.codec_name,'mp3');assert.equal(+probe.bit_rate,bitrate*1000);execFileSync('ffmpeg',['-v','error','-i',path,'-f','null','-']);summary.exports.push(probe);
}
const stem=await renderOffline(p,{track:2,scene:6,bars:1,channels:1,normalize:true,mastering:false,tail:0});
const mid=renderMidi(p),midiBytes=Buffer.from(await mid.arrayBuffer());assert.equal(midiBytes.subarray(0,4).toString(),'MThd');assert.equal(midiBytes.readUInt16BE(10),17);
const archive=await zipFiles([{name:'session.vfreq',blob:projectFile(p)},{name:'sequence.mid',blob:mid},{name:'stems/acid.wav',blob:stem}]);const zip=join(out,'session.zip');await writeFile(zip,Buffer.from(await archive.arrayBuffer()));
execFileSync('unzip',['-t',zip]);summary.midiTracks=17;summary.zipEntries=3;
const normalized=Buffer.from(await stem.arrayBuffer()),start=normalized.indexOf('data',36)+8;let max=0;for(let pos=start;pos+3<=normalized.length;pos+=3)max=Math.max(max,Math.abs(normalized.readIntLE(pos,3)/8388608));assert(Math.abs(max-.94)<.001);
const a=await renderOffline(p,{scene:0,bars:.25,tail:0}),b=await renderOffline(p,{scene:0,bars:.25,tail:0});assert.deepEqual(Buffer.from(await a.arrayBuffer()),Buffer.from(await b.arrayBuffer()));
const silent=createProject(),d=new DSP(silent,44100),l=new Float32Array(4500),r=new Float32Array(l.length);silent.metronome=true;d.update(silent);d.start();d.render(l,r);assert(peak(l)>.01);d.stop();d.render(l,r);assert.equal(peak(l),0);
d.start({scene:0});d.queueScene(3);const duration=Math.ceil(16*15/silent.bpm*44100)+1;d.render(new Float32Array(duration),new Float32Array(duration));assert.equal(d.status().scene,3);
summary.transport={deterministic:true,metronome:true,queue:'next bar',masterMuteAfterStop:true};
assert.throws(()=>validateProject({...p,master:{volume:NaN}}));const bad=structuredClone(p);bad.tracks[0].params.constructor=1;assert.throws(()=>validateProject(bad));
await writeFile(join(out,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({verified:{voices:summary.instruments.length,effects:summary.effects.length,projects:summary.projects.length,patches:PATCHES.length,chains:CHAINS.length,formats:summary.exports.length},evidence:out}));
