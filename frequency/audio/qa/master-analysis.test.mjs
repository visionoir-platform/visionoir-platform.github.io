import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { MasterAnalysis } from '../master-analysis.js';
import { LiveRack } from '../live-rack.js';
import { createProject } from '../model.js';

const gain = db => 10 ** (db / 20);
function near(actual, expected, tolerance) {
  assert.ok(Math.abs(actual-expected)<=tolerance,actual+' vs '+expected+' ± '+tolerance);
}
function tone(rate,hz,seconds,amplitude,phase=0) {
  return Float32Array.from({length:Math.round(seconds*rate)},(_,i)=>
    amplitude*Math.sin(2*Math.PI*hz*i/rate+phase)*Math.min(1,i/(rate*0.005)));
}

test('400 ms and 3 s windows warm up independently, preserve stereo energy and handle silence', () => {
  for (const rate of [44100,48000,96000]) {
    const meter=new MasterAnalysis(rate), block=tone(rate,1000,0.1,gain(-23));
    const zero=new Float32Array(block.length);
    for(let i=0;i<3;i++) meter.consume(block,block,block.length);
    assert.equal(meter.momentary,null);
    meter.consume(block,block,block.length);
    assert.notEqual(meter.momentary,null);
    assert.equal(meter.shortTerm,null);
    // A single continuous tone avoids repeatedly including the fixture's soft start.
    const sustained=tone(rate,1000,3,gain(-23));
    meter.reset(); meter.consume(sustained,sustained,sustained.length);
    near(meter.momentary,-23,0.05); near(meter.shortTerm,-23,0.05);
    const mono=new MasterAnalysis(rate);
    mono.consume(sustained,new Float32Array(sustained.length),sustained.length);
    near(meter.shortTerm-mono.shortTerm,3.0103,0.001);
    for(let i=0;i<5;i++) meter.consume(zero,zero,zero.length);
    assert.ok(meter.momentary < -95);
    assert.ok(meter.shortTerm > -26);
    meter.reset();
    for(let i=0;i<30;i++) meter.consume(zero,zero,zero.length);
    assert.equal(meter.shortTerm,-Infinity);
  }
});

test('reconstruction detects a between-sample peak and is invariant to live callback boundaries', () => {
  const rate=48000, pcm=tone(rate,rate/4,0.5,1,Math.PI/4), silent=new Float32Array(pcm.length);
  const once=new MasterAnalysis(rate), partial=new MasterAnalysis(rate);
  once.consume(silent,pcm,pcm.length);
  for(let i=0;i<pcm.length;i+=127) {
    const n=Math.min(127,pcm.length-i);
    partial.consume(silent.subarray(i,i+n),pcm.subarray(i,i+n),n);
  }
  const samplePeak=20*Math.log10(pcm.reduce((x,v)=>Math.max(x,Math.abs(v)),0));
  near(samplePeak,-3.0103,0.002);
  near(20*Math.log10(once.truePeak.maximum),0,0.2);
  assert.equal(once.truePeak.maximum,partial.truePeak.maximum);
  assert.equal(once.momentary,partial.momentary);
});

test('same PCM agrees with FFmpeg EBU R128 on weighted loudness and intersample peak', t => {
  if (spawnSync('ffmpeg',['-version']).error?.code==='ENOENT') {
    t.skip('FFmpeg unavailable'); return;
  }
  for (const rate of [44100,48000,96000]) {
    // Unequal channels, low-frequency attenuation and high-shelf gain test the actual weighting.
    const l=tone(rate,60,3.2,0.10), r=tone(rate,4200,3.2,0.05,0.2);
    const bytes=Buffer.alloc(l.length*8);
    for(let i=0;i<l.length;i++) {
      bytes.writeFloatLE(l[i],i*8); bytes.writeFloatLE(r[i],i*8+4);
    }
    const ref=spawnSync('ffmpeg',['-hide_banner','-nostats','-threads','1','-f','f32le','-ar',String(rate),
      '-ac','2','-i','pipe:0','-filter_threads','1','-af','ebur128=peak=true','-f','null','-'],
      {input:bytes,encoding:'utf8'});
    assert.equal(ref.status,0,ref.stderr);
    const reference=[...ref.stderr.matchAll(/\bM:\s*([-\d.]+)\s+S:\s*([-\d.]+)/g)].at(-1);
    const peak=Number(ref.stderr.match(/True peak:\s*Peak:\s*([-\d.]+)/)?.[1]);
    assert.ok(reference && Number.isFinite(peak));
    const m=new MasterAnalysis(rate);
    m.consume(l,r,l.length); m.truePeak.flush();
    near(m.momentary,Number(reference[1]),0.15);
    near(m.shortTerm,Number(reference[2]),0.15);
    near(20*Math.log10(m.truePeak.maximum),peak,0.25);
    t.diagnostic(rate+' Hz · FREQUENCY '+m.momentary.toFixed(2)+' LUFS M, '+
      m.shortTerm.toFixed(2)+' LUFS S, '+(20*Math.log10(m.truePeak.maximum)).toFixed(2)+
      ' dBTP · FFmpeg '+reference[1]+', '+reference[2]+', '+peak);
  }
});

test('opt-in reads delivered PCM, leaves it unchanged, holds after Stop and restarts after overload', () => {
  const rate=48000;
  const project=createProject('forge');
  const plain=new LiveRack(structuredClone(project),rate), live=new LiveRack(structuredClone(project),rate);
  live.control('master-analysis',1);
  for(const rack of [plain,live]) rack.start({scene:6});
  const left=new Float32Array(256), right=new Float32Array(256);
  const expectedL=new Float32Array(256), expectedR=new Float32Array(256);
  const independent=new MasterAnalysis(rate);
  let sawFade = false;
  for(let i=0;i<340;i++) {
    if(i===5) for(const rack of [plain,live]) { rack.project.crossfadeBeats=.25; rack.queueScene(2); }
    plain.render(expectedL,expectedR); live.render(left,right);
    sawFade ||= Boolean(live.outgoing);
    assert.deepEqual(left,expectedL); assert.deepEqual(right,expectedR);
    independent.consume(left,right,left.length);
  }
  assert.equal(sawFade,true);
  const status=live.status();
  assert.equal(status.lufsMomentary,independent.momentary);
  assert.equal(status.truePeakMax,20*Math.log10(independent.truePeak.maximum));
  assert.equal(plain.status().truePeakMax,null);
  live.stop();
  assert.ok(live.status().truePeakMax >= status.truePeakMax);
  live.start({scene:0});
  assert.equal(live.status().truePeakMax,null);
  live.budget.clockConfirmed=true;
  for(let i=0;i<3;i++) live.observeBudget(100,rate/2);
  // Simulate the clock at real quantum cadence to sustain the overload threshold.
  for(let i=0;i<900;i++) live.observeBudget(2.5,128);
  assert.equal(live.status().analysisPaused,true);
  live.render(left,right); assert.equal(live.masterAnalysis.frames,0);
  for(let i=0;i<3000;i++) live.observeBudget(0.2,128);
  assert.equal(live.status().analysisPaused,false);
  live.render(left,right); assert.equal(live.masterAnalysis.frames,left.length);
  live.control('master-analysis',0);
  assert.equal(live.masterAnalysis,null);
});
