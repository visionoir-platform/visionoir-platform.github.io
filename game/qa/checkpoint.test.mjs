import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRun,groundAt,STAGES} from '../engine/index.js';
import {checkpointOf,restoreCheckpoint} from '../ui/checkpoint.js';
test('Reload only at an authored marker and preserve the stage score and time',()=>{
 for (const s of STAGES.filter(s=>!s.special)) {
   const run=createRun({stage:s.id,hero:1});run.checkpoint=run.objects.find(o=>o.type==='checkpoint').x;
   run.score=1200;run.time=21.23;run.rings=8;const saved=JSON.parse(JSON.stringify(checkpointOf(run)));
   const next=createRun({stage:s.id,hero:1});assert(restoreCheckpoint(next,saved,groundAt));
   assert.equal(next.player.x,run.checkpoint);assert.equal(next.score,1200);assert.equal(next.rings,8);assert(Number.isFinite(next.player.y));
   assert.equal(next.time,21.23);assert(!restoreCheckpoint(next,{...saved,marker:999},groundAt));assert(!restoreCheckpoint(next,{...saved,hero:3},groundAt));
 }
});
import {createCadence} from '../ui/cadence.js';
test('Paint pacing engages only after sustained slow frames and recovers on a faster display',()=>{
 const cadence=createCadence();let now=0,draws=0;
 for(let i=0;i<100;i++)assert(cadence.shouldPaint(now+=1000/60,1000/60));
 for(let i=0;i<300;i++)if(cadence.shouldPaint(now+=23,23))draws++;
 assert(draws<270&&draws>160);
 for(let i=0;i<240;i++)cadence.shouldPaint(now+=1000/60,1000/60);
 for(let i=0;i<60;i++)assert(cadence.shouldPaint(now+=1000/60,1000/60));
});
