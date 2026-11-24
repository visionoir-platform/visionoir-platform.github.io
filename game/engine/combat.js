import {BOSSES} from './content.js';
import {landscape} from './world.js';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function emit(run,type,data={}){run.events.push({type,...data});}
export function burst(run,type,x,y){if(run.fx.length>=40)run.fx.shift();run.fx.push({type,x,y,life:.46});}
export function hurt(run,dir) {
  const p=run.player;
  if(p.immune>0||p.super||run.status!=='playing')return;
  p.immune=2.2;p.hitTimer=.33;p.vx=dir*98;p.vy=-112;p.grounded=false;p.loop=null;
  if(run.shield)run.shield=false;
  else if(run.rings>0)run.rings=0;
  else {p.hp--;if(p.hp===0){retry(run);return;}}
  burst(run,'hit',p.x,p.y-14);emit(run,'hit');
}
export function retry(run){
  run.retries++;
  if(run.retries>=4){
    run.status='lost';run.player.pose='defeat';emit(run,'lost');return;
  }
  const p=run.player;
  Object.assign(p,{x:run.checkpoint,y:landscape(run.level,run.checkpoint),vx:0,vy:0,hp:3,grounded:true,
    immune:2.4,hitTimer:0,loop:null,angle:0,super:false,pose:'respawn',support:null,airTime:0});
  run.rings=0;run.energy=Math.max(12,run.energy*.6);run.projectiles.length=0;emit(run,'down');
  if(run.boss){run.boss=null;}
}
export function spawnBoss(run) {
  const id=run.bossQueue[run.bossIndex], def=BOSSES[id];
  const x=run.level.arenaStart+220,y=landscape(run.level,x);
  run.boss={id,name:def.name,body:def.body,x,y,origin:x,baseY:y,hp:def.hp,maxHp:def.hp,
    phase:1,state:'entry',timer:.9,cycle:0,pattern:def.attacks[0],fired:false,step:0,direction:-1,targetX:x,hitCD:0};
  emit(run,'boss',{id,track:22,battleTrack:battleTrack(id)});
}
export const battleTrack=id=>id===15?28:id>=16?21:id===12?26:id===13||id===14?27:[1,5,9].includes(id)?24:id>=10||id===3?25:23;
function shot(run,type,x,y,vx,vy,{gravity=0,life=4.6,r=5,friendly=false}={}){
  if(run.projectiles.length>=44)return;
  run.projectiles.push({type,x,y,vx,vy,gravity,life,r,friendly,active:true});
}
export function throwPulse(run,curve=0){
  const p=run.player;
  shot(run,'friendly',p.x+p.facing*11,p.y-13,p.facing*(p.super?325:286),-8+curve,{gravity:15,life:p.super?1.18:.85,r:p.super?7:5,friendly:true});
}
export function strikeBoss(run,reach,ranged=false) {
  const p=run.player,b=run.boss;
  if(!b||b.state!=='vulnerable'||b.hitCD>0)return false;
  if(b.id===15&&b.phase===3&&!p.super)return false;
  if(!ranged&&(Math.abs(p.x-b.x)>reach||Math.abs((p.y-13)-(b.y-17))>49))return false;
  b.hp--;b.hitCD=.44;run.energy=Math.min(100,run.energy+5);run.score+=95;
  burst(run,'bossHit',b.x,b.y-17);emit(run,'bossHit',{id:b.id,hp:b.hp});
  if(!b.hp){
    b.state='defeat';b.timer=1.04;run.projectiles.length=0;
    emit(run,'bossDefeated',{id:b.id});return true;
  }
  // The machine closes its exposed assembly on impact. Each subsequent hit earns a new opening.
  b.state='hit';b.timer=.22;b.cycle++;
  const phase=b.id===15?(b.hp<=2?3:b.hp<=5?2:1):b.hp<=Math.ceil(b.maxHp/2)?2:1;
  if(phase>b.phase){b.phase=phase;
    if(b.id===15 && phase===3){
      // The recovered cores resonate during the eclipse. Movement still consumes energy.
      p.super=true;run.energy=Math.max(68,run.energy);p.immune=1.2;
      burst(run,'transform',p.x,p.y-14);emit(run,'transform',{character:run.character,track:29,final:true});
    }
    emit(run,'bossPhase',{id:b.id,phase,track:battleTrack(b.id)});}
  return true;
}
function firePattern(run,b,kind) {
  const x=b.x,y=b.y-21,p=run.player,d=b.direction;
  const speed=108+b.phase*12;
  switch(kind){
    case 'slam': case 'wave':
      for(const d of [-1,1])shot(run,'pulse',x,b.baseY-5,d*speed,0,{r:5});
      break;
    case 'mine':
      shot(run,'mine',x,y,d*56,-114,{gravity:205,life:3.8,r:6});break;
    case 'aim':{
      const dx=p.x-x,dy=p.y-15-y,len=Math.max(1,Math.hypot(dx,dy));
      shot(run,'pulse',x,y,speed*dx/len,speed*dy/len);break;
    }
    case 'fountain':
      for(const v of [-75,0,75])shot(run,'shard',x,y,v,-145,{gravity:187,r:4});break;
    case 'drop':
      for(const off of [-44,35])shot(run,'shard',b.targetX+off,b.baseY-131,0,25,{gravity:205,r:4});break;
    case 'cross':
      for(const dir of [-1,1])for(const offset of [0,-25])shot(run,'beam',x,y+offset,speed*dir,0,{r:3});break;
    case 'fan': case 'shard':
      for(const angle of (kind==='fan'?[-.46,0,.46]:[-.19,.19]))shot(run,'shard',x,y,Math.cos(angle)*speed*d,Math.sin(angle)*speed,{r:3});break;
    case 'orbit': case 'disc':
      for(const dir of (kind==='orbit'?[-1,1]:[d]))shot(run,'disc',x,y,speed*dir,-72,{gravity:98,r:6});break;
    case 'sweep': shot(run,'beam',x,b.baseY-29,speed*1.3*d,0,{r:4});break;
    case 'drive': break;
  }
}
export function updateBoss(run,dt) {
  if(!run.boss){
    const p=run.player,arena=run.level.arenaStart;
    if(p.x>=arena && run.bossIndex<run.bossQueue.length){
      if(run.stage.special&&run.objectiveCount<run.stage.goal){p.x=arena-1;p.vx=Math.min(0,p.vx);return;}
      spawnBoss(run);
    }
    return;
  }
  const b=run.boss,d=BOSSES[b.id],p=run.player;
  b.timer-=dt;b.hitCD=Math.max(0,b.hitCD-dt);
  if(b.state==='defeat'){
    if(b.timer<=0){run.bossIndex++;run.boss=null;run.score+=350;p.hp=Math.min(3,p.hp+2);for(const o of run.objects)if(o.arena)o.active=true;run.energy=Math.min(100,run.energy+18);}
    return;
  }
  // Both edges are walkable, preserving room to evade in either direction.
  p.x=clamp(p.x,run.level.arenaStart-30,run.level.width-13);
  if(b.timer<=0){
    if(b.state==='entry'||b.state==='vulnerable'||b.state==='hit'){
      if(b.state==='vulnerable')b.cycle++;
      b.state='telegraph';b.timer=b.phase===1?.95:.69;
      b.pattern=d.attacks[b.cycle%d.attacks.length];b.direction=p.x<b.x?-1:1;
      b.targetX=p.x;emit(run,'telegraph',{id:b.id,pattern:b.pattern});
    }else if(b.state==='telegraph'){
      b.state='attack';b.timer=.85+(b.pattern==='drive'?.32:0);b.fired=false;b.step=0;
    }else if(b.state==='attack'){
      b.state='vulnerable';b.timer=d.window;b.y=b.baseY;
      emit(run,'vulnerable',{id:b.id});
    }
  }
  if(b.state==='attack'){
    b.step+=dt;
    if(b.pattern==='drive'||b.pattern==='sweep'){
      b.x=clamp(b.x+b.direction*dt*(b.pattern==='drive'?148:65),run.level.arenaStart+55,run.level.width-80);
      if(Math.abs(p.x-b.x)<19&&Math.abs(p.y-b.y)<29)hurt(run,-b.direction);
    } else if(b.pattern==='slam'){
      b.y=b.baseY-37*Math.sin(Math.min(1,b.step/.69)*Math.PI);
    } else if(b.pattern==='orbit')b.y=b.baseY-19-9*Math.sin(b.step*7);
    if(!b.fired && b.step>(b.pattern==='slam'?.66:.19)){b.fired=true;firePattern(run,b,b.pattern);}
  } else if(b.state==='telegraph'){
    if(['wing','orb','serpent','crown'].includes(b.body))b.y=b.baseY-8-5*Math.sin(run.time*5);
    else if(b.body==='wheel'||b.body==='walker')b.x+=Math.sin(run.time*7)*dt*12;
  }
  if(b.state==='vulnerable'&&p.y<b.y+2&&p.y>b.y-34&&Math.abs(p.x-b.x)<22&&p.vy>45){
    if(strikeBoss(run,33)){p.vy=-181;p.grounded=false;}
  }
}
export function enemyPulse(run,e) {
  shot(run,'pulse',e.x,e.y-12,e.dir*104,-2,{life:1.55,r:3});
}
export function updateProjectiles(run,dt){
  const p=run.player;
  for(let i=run.projectiles.length-1;i>=0;i--){
    const q=run.projectiles[i];q.vy+=q.gravity*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;
    const floor=landscape(run.level,q.x);
    if(q.type==='mine'&&q.y>floor-4){q.y=floor-4;q.vx=0;q.vy=0;}
    if(q.friendly){
      const b=run.boss;
      if(b&&Math.abs(q.x-b.x)<19&&Math.abs(q.y-(b.y-17))<25&&strikeBoss(run,0,true))q.life=0;
      for(const e of run.enemies){if(e.active&&Math.abs(e.x-q.x)<12&&Math.abs(e.y-10-q.y)<12){e.active=false;q.life=0;run.score+=80;emit(run,'enemy');break;}}
    } else if(Math.abs(q.x-p.x)<7+q.r&&Math.abs(q.y-(p.y-(p.ducking?6:12)))<(p.ducking?5:11)+q.r){
      hurt(run,q.x<p.x?1:-1);q.life=0;
    }
    if(!run.projectiles.length)return; // A defeat or life loss clears every projectile.
    if(q.life<=0 || q.y>floor+28 || Math.abs(q.x-p.x)>580)run.projectiles.splice(i,1);
  }
}
