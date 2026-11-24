import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,HEROES,BOSSES,createRun,step,groundAt,freshProgress,canEnter,finishRun,sanitizeProgress} from './index.js';
import {drive} from './driver.dev.mjs';

const tick=(r,keys,frames)=>{const events=[];for(let i=0;i<frames;i++)events.push(...step(r,keys));return events;};

test('14 campaign maps, seven trials, 16 named campaign bosses and seven guardians',()=>{
  assert.equal(STAGES.length,21);assert.equal(HEROES.length,5);
  assert.equal(new Set(STAGES.map(s=>s.plan.join('/'))).size,21);
  assert.equal(new Set(STAGES.filter(s=>s.special).map(s=>s.objective)).size,7);
  assert.deepEqual(STAGES.slice(0,14).flatMap(s=>s.bosses),Array.from({length:16},(_,i)=>i));
  assert.equal(new Set(BOSSES.map(b=>b.attacks.join('/'))).size,23);
  for(const stage of STAGES){
    const run=createRun({stage:stage.id});
    assert.ok(run.level.width>(stage.special?3300:20000));
    assert.ok(run.level.points.every(([x,y],i,p)=>Number.isFinite(y)&&(i===0||x>p[i-1][0])));
    assert.ok(run.level.objects.every((o,i,a)=>i===0||a[i-1].x<=o.x));
    for(const [a,b] of run.level.pits){assert.equal(groundAt(run,(a+b)/2),Infinity);assert.ok(b>a);}
  }
});

test('every exit reached by player input after every required boss with every protagonist',()=>{
  for(const stage of STAGES)for(const hero of HEROES){
    const {r,seen}=drive(stage.id,hero.id);
    assert.equal(r.status,'won',stage.title+' / '+hero.name);
    assert.equal(r.bossIndex,stage.bosses.length);
    for(const event of ['boss','telegraph','vulnerable','bossDefeated','win'])assert.ok(seen.has(event));
    if(stage.special){assert.ok(r.objectiveCount>=stage.goal);assert.ok(seen.has('core'));}
    else assert.ok(seen.has('checkpoint'));
  }
});
test('Rush clears all 16 consecutive encounters with each protagonist; Time Attack records without unlocking story',()=>{
  let p=freshProgress();
  for(const hero of HEROES){
    const {r}=drive(12,hero.id,{mode:'rush'});
    assert.equal(r.status,'won');assert.equal(r.bossIndex,16);
  }
  const {r}=drive(3,1,{mode:'time'});p=finishRun(p,r);
  assert.deepEqual(p.cleared,[]);assert.ok(p.records['time:3:1']);
});
test('legitimate progression unlocks the ordinary and secret endings and retains best time',()=>{
  let p=freshProgress();
  assert.ok(canEnter(p,0));assert.ok(!canEnter(p,1));assert.ok(!canEnter(p,0,'rush'));
  for(let id=0;id<=12;id++){
    assert.ok(canEnter(p,id));p=finishRun(p,drive(id,0).r);
  }
  assert.ok(p.storyEnding);assert.ok(canEnter(p,0,'rush'));assert.ok(!canEnter(p,13));
  for(let id=14;id<=20;id++){
    assert.ok(canEnter(p,id));p=finishRun(p,drive(id,4).r);
  }
  assert.ok(canEnter(p,13));assert.equal(p.cores.length,7);
  const {r,seen}=drive(13,1);assert.ok(seen.has('transform'));p=finishRun(p,r);
  assert.ok(p.secretEnding);assert.ok(!canEnter({...p,heroes:[1]},13));
  assert.equal(sanitizeProgress(p).records['story:13:1'].time,r.time);
  assert.equal(finishRun(p,{...r,time:r.time+8}).records['story:13:1'].time,r.time);
  assert.deepEqual(sanitizeProgress({version:9}),freshProgress());
  assert.deepEqual(sanitizeProgress({version:1,cores:[6,6,90,{},'3'],records:{bad:3}}).cores,[6]);
});
test('fixed timestep, inertia, variable jump height, and stable non-finite time handling',()=>{
  const a=createRun(),b=createRun();
  tick(a,{right:true},60);for(let i=0;i<30;i++)step(b,{right:true},1/30);
  assert.equal(a.player.x,b.player.x);assert.equal(a.player.vx,b.player.vx);
  const previous=a.player.vx;step(a,{});assert.ok(a.player.vx>0&&a.player.vx<previous);
  const pos=a.player.x;assert.deepEqual(step(a,{},Infinity),[]);assert.equal(a.player.x,pos);
  const long=createRun(),short=createRun();step(long,{jump:true});step(short,{jump:true});
  tick(long,{jump:true},10);tick(short,{},10);assert.ok(long.player.y<short.player.y-10);
});
test('each character has an observable role-specific ability, including levitation, block throw and powered flight',()=>{
  const v=createRun();step(v,{special:true});assert.ok(v.player.vx>300);
  const offset=createRun({hero:1});step(offset,{special:true});assert.ok(offset.player.slow>2);
  const ion=createRun({hero:2});tick(ion,{jump:true},4);tick(ion,{special:true},11);
  assert.equal(ion.player.pose,'hover');assert.ok(ion.player.battery<1);
  const block=ion.objects.find(o=>o.type==='block');
  ion.player.x=block.x;ion.player.y=block.y;step(ion,{});step(ion,{special:true});
  assert.ok(ion.player.carried);assert.ok(!block.active);
  assert.ok(step(ion,{}).some(e=>e.type==='throw'));
  const impact=createRun({hero:3});step(impact,{special:true});assert.ok(impact.player.attackTimer>0);
  const engineer=createRun({hero:4});tick(engineer,{jump:true},4);tick(engineer,{special:true},8);
  assert.equal(engineer.player.pose,'fly');assert.ok(engineer.player.vy<0);
  for(const hero of HEROES){
    const a=createRun({hero:hero.id,cores:[0]});a.energy=55;
    assert.ok(step(a,{transform:true}).some(e=>e.type==='transform'));
    tick(a,{},10);assert.ok(a.player.super);assert.ok(a.energy<55);
    assert.ok(step(a,{transform:true}).some(e=>e.type==='revert'));
  }
});
test('portals require deliberate interaction; damage grants invulnerability; falls respawn at checkpoint',()=>{
  const r=createRun();const portal=r.objects.find(o=>o.type==='portal');
  r.player.x=portal.x;r.player.y=groundAt(r,portal.x);
  assert.ok(!step(r,{}).some(e=>e.type==='portal'));
  assert.deepEqual(step(r,{up:true}).filter(e=>e.type==='portal'),[{type:'portal',stage:14}]);
  const e=r.enemies[0];r.player.x=e.x;r.player.y=e.y;r.rings=4;step(r,{});
  assert.equal(r.rings,0);assert.ok(r.player.immune>1);
  const hp=r.player.hp;step(r,{});assert.equal(r.player.hp,hp);
  const cp=r.objects.find(o=>o.type==='checkpoint');r.player.x=cp.x;r.player.y=cp.y;
  step(r,{});assert.equal(r.checkpoint,cp.x);
  r.player.y=422;step(r,{});assert.equal(r.player.x,cp.x);assert.equal(r.retries,1);
});
