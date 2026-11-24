// Test-only input driver. It observes the public game state and generates ordinary controller inputs.
import {createRun,step} from './index.js';
export function drive(stage,hero,{mode='story',start=null}={}) {
  const r=start||createRun({stage,hero,mode,cores:[]}), seen=new Set(), poses=new Set();
  let lastX=40,stalled=0, reversing=false, jumpHold=0;
  for(let frame=0;frame<60*420&&r.status==='playing';frame++){
    const p=r.player;
    let dir=1,jump=false,down=false,up=false,attack=true,dash=false;
    if(r.boss){
      const b=r.boss;dir=Math.abs(b.x-p.x)>14?Math.sign(b.x-p.x):0;
      if(b.state==='telegraph'||b.state==='attack'){
        const away=p.x<b.x?-1:1;
        dir=Math.abs(b.x-p.x)<70?away:0;
        if(p.grounded&&b.state==='attack'&&(b.pattern==='drive'||b.pattern==='slam')&&Math.abs(b.x-p.x)<82)jump=true;
      }
      const threat=r.projectiles.some(q=>!q.friendly&&Math.abs(q.x-p.x)<43&&q.y>p.y-22&&q.y<p.y+5);
      if(threat&&p.grounded)jump=true;
      if(b.state!=='vulnerable'&&['cross','sweep','shard'].includes(b.pattern)){
        down=true;if(b.pattern==='cross'||b.pattern==='sweep'){jump=false;jumpHold=0;}
      }
    }else{
      if(r.stage.special&&r.objectiveCount<r.stage.goal){
        if(p.x>=r.level.arenaStart-32)reversing=true;
        if(p.x<170)reversing=false;
        if(reversing)dir=-1;
        const near=r.objects.find(o=>o.active&&o.type==='core'&&Math.abs(o.x-p.x)<49);
        if(near){up=true;if(near.trigger==='air'&&p.grounded&&Math.abs(p.x-near.x)>17)jump=true;}
      }
      const block=r.objects.find(o=>o.active&&(o.type==='breakable'||o.type==='spike')&&(o.x-p.x)*dir>=0&&(o.x-p.x)*dir<Math.max(36,Math.abs(p.vx)*.29));
      const gap=r.level.pits.find(([a,b])=>dir===1?(a>p.x-2&&a-p.x<Math.max(48,p.vx*.27)):(b<p.x+2&&p.x-b<Math.max(48,-p.vx*.27)));
      if((block||gap)&&p.grounded)jump=true;
      if(stalled>.3&&p.grounded&&frame%17<8){jump=true;dash=!gap;}
    }
    if(jump&&p.grounded)jumpHold=13;
    jump=jump||jumpHold>0;jumpHold=Math.max(0,jumpHold-1);
    const keys={left:dir<0,right:dir>0,jump,attack,up,dash,down};
    for(const e of step(r,keys))seen.add(e.type);
    poses.add(p.pose);
    if(!r.boss&&Math.abs(p.x-lastX)<.12)stalled+=1/60;else stalled=0;
    lastX=p.x;
  }
  return {r,seen,poses};
}
if(process.argv[1]?.endsWith('driver.dev.mjs')){
  const {r,seen}=drive(Number(process.argv[2]||0),Number(process.argv[3]||0));
  console.log(JSON.stringify({stage:r.stageId,hero:r.character,status:r.status,x:r.player.x,y:r.player.y,time:r.time,retries:r.retries,boss:r.boss?.name,bossHp:r.boss?.hp,bossIndex:r.bossIndex,checkpoint:r.checkpoint,objective:r.objectiveCount,seen:[...seen]}));
}
