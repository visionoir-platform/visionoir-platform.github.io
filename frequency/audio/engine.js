import processorUrl from './processor.js?worker&url';
import {validateProject,clamp} from './model.js';
export function createEngine({onState=()=>{},onTick=()=>{},onError=()=>{}}={}){
 let context=null,node=null,analyser=null,streamOut=null,initializing=null,playing=false,version=0,mode='idle',deliver=null;
 const post=(type,data={})=>deliver?.({type,...data});
 async function prepare(project){
  if(project)validateProject(project);
  if(!context){const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!Audio)throw Error('audio.unsupported');context=new Audio({latencyHint:'interactive'});
   context.onstatechange=()=>onState(context?.state??'closed');
  }
  // Resume in the original input gesture before awaiting module loading.
  const resumed=context.state==='running'?Promise.resolve():context.resume();
  if(!node&&!initializing){
   const target=context;initializing=(async()=>{
    try{
     if(!target.audioWorklet)throw Error('audio.workletUnavailable');
     await target.audioWorklet.addModule(processorUrl);
     node=new AudioWorkletNode(target,'frequency-rack-v1',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
     deliver=m=>node.port.postMessage(m);mode='worklet';
     node.port.onmessage=({data:m})=>{if(m.type==='tick'){playing=m.data.playing;onTick(m.data);}else if(m.type==='error')onError(Error(m.message));};
     node.onprocessorerror=()=>{playing=false;onError(Error('audio.processorError'));};
    }catch(error){
     if(!target.createScriptProcessor)throw error;
     const {DSP}=await import('./dsp.js');let dsp=null,count=0,tail=0;
     node=target.createScriptProcessor(1024,0,2);mode='buffered';
     deliver=m=>{switch(m.type){
      case 'project':if(dsp)dsp.update(m.project);else dsp=new DSP(m.project,target.sampleRate);break;
      case 'play':dsp?.start(m.options);break;
      case 'stop':dsp?.stop();tail=0;if(dsp)onTick(dsp.status());break;
      case 'queue':dsp?.queueScene(m.scene);break;
      case 'note':dsp?.trigger(m.track,m.note,m.velocity,m.gate);tail=target.sampleRate*9;break;
      case 'off':dsp?.release(m.track,m.note);break;
     }};
     node.onaudioprocess=({outputBuffer:o})=>{if(!dsp||!dsp.running&&!tail)return;
      dsp.render(o.getChannelData(0),o.getChannelData(1));tail=dsp.running?target.sampleRate*6:Math.max(0,tail-o.length);
      count+=o.length;if(count>target.sampleRate/24){count=0;playing=dsp.running;onTick(dsp.status());}};
    }
    analyser=target.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.72;
    streamOut=target.createMediaStreamDestination();node.connect(analyser);analyser.connect(target.destination);analyser.connect(streamOut);
   })().finally(()=>{initializing=null;});
  }
  await Promise.all([resumed,initializing]);
  if(project)post('project',{project});onState(context.state);
 }
 return {prepare,
  async play(project,options={}){const command=++version;await prepare(project);if(command!==version)return;
   post('play',{options});playing=true;onState('playing');},
  update(project){validateProject(project);post('project',{project});},
  queueScene(scene){post('queue',{scene});},
  trigger(track,note,velocity=.85,gate=.55){post('note',{track,note:clamp(note,0,127),velocity:clamp(velocity,0,1),gate});},
  release(track,note){post('off',{track,note});},
  stop(){version++;post('stop');playing=false;onState('stopped');},
  async setOutput(deviceId){if(!context?.setSinkId)throw Error('audio.outputUnavailable');await context.setSinkId(deviceId);},
  async dispose(){version++;post('stop');await initializing?.catch(()=>{});node?.disconnect();analyser?.disconnect();streamOut?.stream.getTracks().forEach(t=>t.stop());
   if(context&&context.state!=='closed')await context.close();context=node=analyser=streamOut=deliver=null;playing=false;mode='idle';},
  get context(){return context;},get analyser(){return analyser;},get stream(){return streamOut?.stream??null;},get playing(){return playing;},get mode(){return mode;}
 };
}
export async function importSample(file,track){
 if(!file||file.size>32*1024*1024)throw Error('sample.size');
 const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;if(!Offline)throw Error('sample.decoderUnavailable');
 const ctx=new Offline(1,1,48000),decoded=await ctx.decodeAudioData(await file.arrayBuffer());
 if(decoded.length>48000*90||decoded.length<2)throw Error('sample.duration');
 const out=new Uint8Array(decoded.length*2),dv=new DataView(out.buffer),channels=[];
 for(let c=0;c<decoded.numberOfChannels;c++)channels.push(decoded.getChannelData(c));
 for(let i=0;i<decoded.length;i++){let sum=0;for(const ch of channels)sum+=ch[i];dv.setInt16(i*2,Math.round(clamp(sum/channels.length,-1,1)*32767),true);}
 let str='';for(let i=0;i<out.length;i+=16384)str+=String.fromCharCode(...out.subarray(i,i+16384));
 track.sample={name:file.name,rate:decoded.sampleRate,pcm:btoa(str),encoding:'pcm16le-mono'};
 return track.sample;
}
