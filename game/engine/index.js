import {STAGES,HEROES,BOSSES} from './content.js';
import {makeWorld,groundAt,landscape,lower,byX,baseX} from './world.js';
import {emit,burst,hurt,retry,throwPulse,updateBoss,strikeBoss,enemyPulse,updateProjectiles} from './combat.js';
export {STAGES,HEROES,BOSSES,groundAt};
export {freshProgress,sanitizeProgress,canEnter,finishRun,rankOf} from './progress.js';

const DT=1/60,clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const approach=(a,b,limit)=>a<b?Math.min(b,a+limit):Math.max(b,a-limit);
const ACTIONS=['jump','dash','attack','special','transform','up'];
const setPose=(p,name,time)=>{p.pose=name;p.poseTimer=time;};
export function createRun({stage=0,hero=0,mode='story',cores=[]}={}) {
  const def=STAGES[stage];if(!def||!HEROES[hero])throw new RangeError('Unknown stage or character');
  if(!['story','time','rush'].includes(mode))throw new RangeError('Unknown mode');
  const level=makeWorld(def);
  const spawn=mode==='rush'?level.arenaStart:40;
  const player={x:spawn,y:landscape(level,spawn),vx:0,vy:0,facing:1,angle:0,pose:'idle',poseTimer:0,
    hp:3,grounded:true,super:false,immune:0,hitTimer:0,airTime:0,loop:null,support:null,coyote:.08,
    cooldown:0,attackCD:0,attackTimer:0,battery:1,charge:0,jumpBuffer:0,slow:0,usedAir:false,loopLock:0};
  return {stage:def,stageId:stage,character:hero,hero:HEROES[hero],mode,cores:[...new Set(cores)],level,
    player,status:'playing',time:0,rings:0,energy:36,score:0,retries:0,secrets:0,objectiveCount:0,
    checkpoint:spawn,camX:Math.max(0,spawn-140),camY:0,shield:false,boss:null,bossIndex:0,
    bossQueue:mode==='rush'?BOSSES.slice(0,16).map(b=>b.id):def.bosses.slice(),
    objects:level.objects,enemies:level.enemies,projectiles:[],fx:[],events:[],lastInput:{},acc:0};
}
function seeTargets(run,range,process) {
  const p=run.player,items=run.objects;
  let i=lower(items,byX,p.x-range);
  while(i<items.length&&items[i].x<=p.x+range){const o=items[i++];if(o.active)process(o);}
}
function transform(run){
  const p=run.player;
  if(p.super){p.super=false;emit(run,'revert');return;}
  if(run.energy<48 || (!run.cores.length && run.stageId!==13))return;
  p.super=true;setPose(p,'transform',.52);p.immune=1;
  burst(run,'transform',p.x,p.y-15);emit(run,'transform',{character:run.character,track:29});
}
function skills(run,keys,edge) {
  const p=run.player,i=run.character,dir=p.facing;
  if(edge.transform)transform(run);
  if(p.carried){
    p.carried.x=p.x+dir*18;p.carried.y=p.y-31;
    if(!keys.special){
      throwPulse(run);
      const q=run.projectiles.at(-1);if(q){q.appearance='block';q.r=8;}
      if(p.super){throwPulse(run,-48);throwPulse(run,32);}
      p.carried=null;emit(run,'throw',{character:i});
    }
  }
  if(p.cooldown>0||p.hitTimer>0)return;
  if(edge.dash){
    if(keys.down&&p.grounded){p.charge=.12;setPose(p,'charge',.12);emit(run,'charge');return;}
    p.cooldown=.68;p.vx=dir*(i===0?337:i===1?315:265)*(p.super?1.15:1);
    if(!p.grounded&&i<2)p.vy=Math.min(44,p.vy*.24);
    setPose(p,'dash',.27);emit(run,'dash',{character:i});return;
  }
  if(i===1&&keys.special&&!edge.special&&!p.grounded&&p.battery>0){
    p.vy=Math.min(p.vy,43);p.battery=Math.max(0,p.battery-DT*.9);setPose(p,'hover',.08);
  }
  if(!edge.special && !(keys.special&&[2,3,4].includes(i)))return;
  if(i===0){
    if(!p.grounded&&p.usedAir)return;
    p.usedAir=!p.grounded;p.vx=dir*(p.super?410:359);p.vy=Math.min(p.vy,0);p.cooldown=.55;
    setPose(p,'dash',.33);
  }else if(i===1){
    if(run.energy<7)return;
    run.energy-=7;p.slow=p.super?3.6:2.3;p.immune=.45;p.cooldown=3.2;
    setPose(p,'special',.4);
  }else if(i===2){
    let block=null;
    seeTargets(run,75,o=>{if(o.type==='block'&&Math.abs(p.y-o.y)<50)block=o;});
    if(block&&edge.special&&!p.carried){
      block.active=false;p.carried={x:block.x,y:block.y};p.cooldown=.16;setPose(p,'special',.3);
    }else if(!p.grounded&&p.battery>0){
      p.vy=approach(p.vy,keys.up?-52:-4,13);p.battery=Math.max(0,p.battery-DT*(p.super?.25:.58));setPose(p,'hover',DT*2);
      if(!edge.special)return;
    }else return;
  }else if(i===3){
    if(!p.grounded){
      if(keys.down){p.vy=345;setPose(p,'attack',.34);}
      else{p.vx=approach(p.vx,dir*202,9);p.vy=Math.min(p.vy,32);setPose(p,'glide',.08);}
      if(!edge.special)return;
    }else{
      p.attackTimer=.28;p.attackCD=.38;p.cooldown=.42;setPose(p,'attack',.28);
      if(p.super){throwPulse(run);burst(run,'shock',p.x,p.y);}
    }
  }else{
    if(!p.grounded && p.battery>0){
      p.vy=approach(p.vy,keys.down?14:-85,13);p.battery=Math.max(0,p.battery-DT*(p.super?.19:.49));setPose(p,'fly',DT*3);
      if(!edge.special)return;
    }else if(edge.special&&p.grounded){throwPulse(run);if(p.super)throwPulse(run,-37);p.cooldown=.8;setPose(p,'attack',.22);}
    else return;
  }
  burst(run,'ability',p.x,p.y-12);emit(run,'ability',{character:i});
}
function onAttack(run,input){
  const p=run.player;
  if(!input.attack||p.attackCD>0||p.hitTimer>0)return;
  p.attackCD=run.character===3?.31:.42;p.attackTimer=.22;
  if(!p.loop&&!['transform','dash','special','fly','glide','hover','charge'].includes(p.pose))setPose(p,'attack',.15);
  if(run.character===1||run.character===4)throwPulse(run);
  emit(run,'attack',{character:run.character});
}
function objects(run,keys,edge,previousX) {
  const p=run.player;
  seeTargets(run,65,o=>{
    const dx=Math.abs(p.x-o.x),dy=Math.abs(p.y-14-o.y);
    switch(o.type){
      case 'ring': case 'battery': case 'shield': case 'secret':
        if(dx>12 || dy>18)return;
        o.active=false;
        if(o.type==='ring'){run.rings++;run.energy=Math.min(100,run.energy+1.4);run.score+=10;}
        if(o.type==='battery')run.energy=Math.min(100,run.energy+19);
        if(o.type==='shield')run.shield=true;
        if(o.type==='secret'){run.score+=275;run.secrets++;}
        emit(run,o.type);burst(run,o.type,o.x,o.y);break;
      case 'spring':
        if(dx>8||Math.abs(p.y-o.y)>8||p.vy<0||p.springLock>0)return;
        p.vy=-o.power;p.vx+=p.facing*o.launchX;p.grounded=false;p.springLock=.3;setPose(p,'spring',.28);emit(run,'spring');break;
      case 'checkpoint':
        if(dx<19&&Math.abs(p.y-o.y)<80&&o.x>run.checkpoint){
          run.checkpoint=o.x;o.lit=true;p.hp=3;emit(run,'checkpoint');}
        break;
      case 'portal':
        if(dx<26&&dy<43&&edge.up){emit(run,'portal',{stage:o.stage});}
        break;
      case 'terminal':
        if(dx<34&&dy<46&&!o.lit&&(edge.up||(run.character===4&&keys.special))){
          o.lit=true;run.energy=Math.min(100,run.energy+12);p.vy=-337;p.grounded=false;emit(run,'terminal');}
        break;
      case 'breakable':
        if(dx>25||p.y<=o.y-o.h+3||p.y>o.y+7)return;
        if((run.character===3&&p.attackTimer>0)||p.super||p.pose==='dash'||p.pose==='roll'&&Math.abs(p.vx)>180){
          o.active=false;burst(run,'break',o.x,o.y-10);run.score+=75;emit(run,'break');}
        else if(run.character===3&&keys.special){
          p.vy=-90;p.x=o.x+(previousX<=o.x?-17:17);setPose(p,'climb',.1);p.grounded=false;}
        else{p.x=o.x+(previousX<=o.x?-22:22);p.vx=0;}
        break;
      case 'spike':
        o.raised=!o.pulse||Math.sin((run.time+o.offset)*3)>.4;
        if(o.raised&&dx<12&&p.y>o.y-14&&p.y<o.y+5)hurt(run,p.x<o.x?-1:1);
        break;
      case 'core':{
        if(dx>17||dy>30)return;
        const valid=o.trigger==='attack'?p.attackTimer>0||p.pose==='dash':
          o.trigger==='up'?keys.up:o.trigger==='air'?!p.grounded:true;
        if(!valid)return;
        if(o.objective==='chain'&&run.time-(run.lastBeacon??0)<3.5)run.score+=65;
        o.active=false;run.objectiveCount++;run.lastBeacon=run.time;run.score+=90;run.energy=Math.min(100,run.energy+3);
        emit(run,'beacon',{count:run.objectiveCount,goal:run.stage.goal});burst(run,'core',o.x,o.y);break;
      }
      case 'exit':
        if(dx<23&&dy<55&&run.bossIndex>=run.bossQueue.length){
          run.status='won';setPose(p,'victory',1);run.score+=Math.max(20,Math.floor(400-run.time))+run.rings*4;
          if(run.stage.special)emit(run,'core',{core:run.stageId-14});
          emit(run,'win',{stage:run.stageId,ending:run.stageId===13?'secret':run.stageId===12?'normal':null});}
        break;
    }
  });
}
function enemies(run,dt) {
  const p=run.player,items=run.enemies;
  let i=lower(items,baseX,p.x-340);
  while(i<items.length&&items[i].baseX<p.x+360){
    const e=items[i++];if(!e.active)continue;
    if(e.localTime===undefined)e.localTime=e.phase;
    e.localTime+=dt*(p.slow>0?.31:1);const t=e.localTime;
    const travel=e.type==='turret'?0:e.type==='sentry'?21:e.type==='wisp'?39:32;
    e.x=e.baseX+Math.sin(t*1.6)*travel;
    const hover=['drone','wisp','eel'].includes(e.type);
    e.y=landscape(run.level,e.x)-(hover?24+Math.sin(t*2.8)*14:0);e.dir=p.x<e.x?-1:1;
    if(e.type==='turret'&&t>=e.shotAt&&Math.abs(e.x-p.x)<175){enemyPulse(run,e);e.shotAt=t+2.1;}
    const dx=Math.abs(e.x-p.x),dy=p.y-e.y;
    if(dx<31 && Math.abs(dy)<35 && p.attackTimer>0 || dx<17&&dy<0&&dy>-27&&p.vy>28 ||
      dx<17&&Math.abs(dy)<24&&(p.super||p.pose==='dash'||p.pose==='roll')){
      e.active=false;burst(run,'enemy',e.x,e.y-8);emit(run,'enemy',{enemy:e.type});run.score+=80;
      if(dy<0&&p.vy>28){p.vy=-128;p.grounded=false;}continue;
    }
    if(dx<13&&Math.abs(dy)<21)hurt(run,p.x<e.x?-1:1);
  }
}
function runLoop(run,keys){
  const p=run.player,l=p.loop;
  if(!l)return false;
  const dir=l.direction,t=l.travel/l.r;
  const speed=clamp(l.speed-31*Math.sin(t),122,420);
  l.travel+=speed*DT;p.angle=-t*dir;
  p.x=l.x+dir*l.r*Math.sin(t);p.y=l.y+l.r*Math.cos(t);
  p.vx=dir*speed*Math.cos(t);p.vy=-speed*Math.sin(t);setPose(p,'roll',.08);
  if(l.travel>=2*Math.PI*l.r || keys.jump&&p.jumpBuffer>0){
    const leave=l.travel<2*Math.PI*l.r;
    p.loop=null;p.loopLock=.7;p.grounded=!leave;p.angle=0;
    if(leave){p.vy-=115;p.jumpBuffer=0;p.coyote=0;}
    else {p.x=l.x+dir*4;p.y=landscape(run.level,p.x);p.vx=dir*l.speed;p.vy=0;}
  }
  return true;
}
function integrate(run,keys,edge){
  const p=run.player,hero=run.hero;
  if(p.loop&&edge.jump)p.jumpBuffer=.13;
  if(runLoop(run,keys))return;
  const oldX=p.x,oldY=p.y,wasGrounded=p.grounded,previousSupport=p.support;
  const area=run.level.areas.find(a=>oldX>=a.x&&oldX<a.end);
  const field=area?.field&&oldX>=area.field[0]&&oldX<=area.field[1]?area.terrain:null;
  const axis=Number(!!keys.right)-Number(!!keys.left);
  p.ducking=!!keys.down&&p.grounded;
  if(edge.jump)p.jumpBuffer=.13;
  if(!keys.jump && run.lastInput.jump && p.vy<-110)p.vy*=.51;
  const previousFacing=p.facing;
  if(axis)p.facing=axis;
  if(keys.down&&p.charge&&keys.dash){p.charge=Math.min(1.15,p.charge+DT);p.vx*=.8;setPose(p,'charge',.1);}
  else if(p.charge){p.vx=p.facing*(240+p.charge*114);p.charge=0;setPose(p,'dash',.35);emit(run,'dash');}
  const slope=wasGrounded&&!p.support?(landscape(run.level,oldX+2)-landscape(run.level,oldX-2))/4:0;
  if(p.hitTimer<=0 && !p.charge && p.pose!=='dash'){
    const max=hero.speed*(p.super?1.24:1);
    if(axis && Math.abs(p.vx)<max || axis && Math.sign(p.vx)!==axis){
      p.vx=approach(p.vx,axis*max,hero.acceleration*(wasGrounded?1:.63)*DT*(axis*p.vx<0?1.7:1));}
    else if(!axis || Math.abs(p.vx)>max)
      p.vx=approach(p.vx,axis*max,(wasGrounded?(p.support?.type==='ice'?49:keys.down?92:330):45)*DT);
  }
  if(wasGrounded)p.vx+=slope*(keys.down?370:135)*DT;
  if(p.support?.type==='conveyor')p.vx+=66*DT;
  if(p.jumpBuffer>0 && (wasGrounded||p.coyote>0)){
    p.vy=-hero.jump*(p.super?1.10:1);p.grounded=false;p.support=null;p.coyote=0;p.jumpBuffer=0;
    setPose(p,'jump',.16);emit(run,'jump');
  }
  const hold=p.pose==='fly'||p.pose==='hover';
  const gravity=field==='gravity'||run.stage.objective==='air'?285:field==='water'?249:672*hero.mass;
  if(!p.grounded && !hold)p.vy=Math.min(field==='water'?112:405,p.vy+gravity*DT);
  p.x=clamp(oldX+p.vx*DT,12,run.level.width-10);
  p.y+=p.vy*DT;
  // A deep pit exposes solid walls. Crossing the wall is only possible above its lip.
  if(!Number.isFinite(groundAt(run,oldX)) && p.y>groundAt(run,p.x)+6){
    p.x=oldX;p.vx=0;
  }
  let surface=groundAt(run,p.x),support=null;
  const platforms=run.level.platforms;
  for(let i=lower(platforms,baseX,p.x-200);i<platforms.length&&platforms[i].baseX<p.x+14;i++){
    const a=platforms[i],prior=a.y;
    a.y=a.baseY+(a.amplitude?Math.sin(run.time*1.7+a.phase)*a.amplitude:0);
    if(p.x>=a.x-3 && p.x<=a.x+a.w+3 && p.vy>=0 && a.y<surface &&
       (oldY<=Math.max(prior,a.y)+3||p.support===a) && p.y>=a.y-2){surface=a.y;support=a;}
  }
  const stick=wasGrounded&&p.grounded&&Math.abs(surface-oldY)<6;
  if((p.vy>=0 && oldY<=surface+5 && p.y>=surface-.01)||stick){
    p.y=surface;p.vy=0;p.grounded=true;p.coyote=.095;p.battery=1;p.usedAir=false;
    p.support=support;p.angle=support?0:Math.atan(slope);
    if(!wasGrounded){if(p.airTime>.18)emit(run,'land');p.airTime=0;if(!p.poseTimer)setPose(p,'land',.072);}
    if(support?.rescueSpring){
      p.support=null;p.grounded=false;p.vy=-323;p.springLock=.25;setPose(p,'spring',.28);emit(run,'spring');
    }
    if(support?.type==='rail'&&Math.abs(p.vx)>95){
      if(previousSupport!==support)emit(run,'rail');setPose(p,'grind',.08);}
    for(const l of run.level.loops){
      if(p.loopLock<=0 && Math.abs(p.vx)>=162 && Math.sign(p.x-l.x)!==Math.sign(oldX-l.x) &&
          Math.abs(p.y-(l.y+l.r))<9){p.loop={...l,travel:0,speed:Math.abs(p.vx),direction:Math.sign(p.vx)};emit(run,'loop');break;}
    }
  }else {p.grounded=false;p.support=null;p.angle=0;p.airTime+=DT;}
  if(p.y>395){retry(run);return;}
  if(!p.poseTimer && !p.hitTimer){
    const v=Math.abs(p.vx);
    if(!p.grounded)p.pose=field==='water'?'swim':p.vy<0?'jump':'fall';
    else if(keys.down)p.pose=v>67?'roll':'crouch';
    else if(axis*p.vx<-38)p.pose='skid';
    else if(previousFacing!==p.facing && v<35)setPose(p,'turn',.08);
    else if(v>hero.speed*.95)p.pose='max';
    else if(v>155)p.pose='run';
    else if(v>81)p.pose='jog';
    else if(v>8)p.pose='walk';
    else if(keys.up)p.pose='look';
    else p.pose=run.time%3.2<.13?'blink':'idle';
  }
  if(p.hitTimer>0)setPose(p,'hurt',.09);
  objects(run,keys,edge,oldX);
}
function tick(run,keys){
  if(run.status!=='playing')return;
  const p=run.player;run.time+=DT;
  const edge={};for(const name of ACTIONS)edge[name]=!!keys[name]&&!run.lastInput[name];
  for(const k of ['immune','hitTimer','cooldown','attackCD','attackTimer','poseTimer','jumpBuffer','coyote','loopLock','slow','springLock'])
    p[k]=Math.max(0,(p[k]||0)-DT);
  if(p.super){
    run.energy=Math.max(0,run.energy-DT*(run.stageId===13?2.3:4.3));
    if(run.energy===0){p.super=false;emit(run,'revert');}
  }
  if(run.stage.objective==='chain'&&run.objectiveCount>0&&run.objectiveCount<run.stage.goal&&run.time-run.lastBeacon>6.5){
    run.objectiveCount=0;for(const o of run.objects)if(o.type==='core')o.active=true;
    emit(run,'chainLost');
  }
  if(run.boss?.id===15&&run.boss.phase===3&&!p.super&&Math.abs(p.vx)>85){
    run.energy=Math.min(100,run.energy+DT*9);
  }
  if(run.stage.special&&run.mode!=='rush'&&run.time>=run.stage.limit&&run.bossIndex===0&&!run.boss){
    run.status='lost';p.pose='defeat';emit(run,'lost');return;
  }
  skills(run,keys,edge);onAttack(run,keys);integrate(run,keys,edge);
  if(run.status==='playing'){
    enemies(run,DT);updateBoss(run,p.slow>0?DT*.46:DT);
    if(p.attackTimer>0)strikeBoss(run,run.character===3?47:36);
    updateProjectiles(run,p.slow>0?DT*.5:DT);
  }
  for(let i=run.fx.length-1;i>=0;i--){if((run.fx[i].life-=DT)<=0)run.fx.splice(i,1);}
  const lead=clamp(p.vx*.26,-70,80);
  run.camX+=(clamp(p.x-184+lead,0,Math.max(0,run.level.width-480))-run.camX)*.086;
  run.camY+=(clamp(p.y-190,-95,39)-run.camY)*.073;
  for(const name of ACTIONS)run.lastInput[name]=!!keys[name];
}
// Return the edge events produced across the simulated frames. A long background suspension
// has a bounded catch-up cost. The host pauses its clock on visibility or focus loss.
export function step(run,input={},elapsed=DT) {
  run.events=[];
  if(!Number.isFinite(elapsed)||elapsed<=0||run.status!=='playing')return run.events;
  run.acc+=Math.min(.12,elapsed);
  while(run.acc+1e-10>=DT){tick(run,input);run.acc=Math.max(0,run.acc-DT);}
  return run.events;
}
