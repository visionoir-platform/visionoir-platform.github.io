import { DISTRICTS } from './content.js';

export function lower(items, key, low) {
  let a=0, b=items.length;
  while(a<b){const m=(a+b)>>>1;if(key(items[m])<low)a=m+1;else b=m;}
  return a;
}
export const byX = o=>o.x;
export const baseX = o=>o.baseX;
export function landscape(level,x) {
  const pts=level.points;
  let a=0,b=pts.length-1;
  while(a+1<b){const k=(a+b)>>>1;if(pts[k][0]<=x)a=k;else b=k;}
  const [sx,sy]=pts[a], [ex,ey]=pts[b];
  return sy+(ey-sy)*Math.max(0,Math.min(1,(x-sx)/(ex-sx)));
}
export function groundAt(run,x) {
  const l=run.level;
  const idx=lower(l.pits,v=>v[1],x);
  if(l.pits[idx] && l.pits[idx][0]<x && x<l.pits[idx][1])return Infinity;
  return landscape(l,x);
}
export function makeWorld(stage) {
  const level={points:[[0,212],[220,212]],width:0,platforms:[],loops:[],pits:[],areas:[],objects:[],enemies:[]};
  const objects=level.objects, enemies=level.enemies;
  const obj=(type,x,y,extra={})=>objects.push({type,x:x|0,y:y|0,active:true,...extra});
  const platform=(type,x,y,w,extra={})=>level.platforms.push({type,x:x|0,y:y|0,baseX:x|0,baseY:y|0,w,h:8,...extra});
  let start=220;
  for(const [i,name] of stage.plan.entries()){
    const design=DISTRICTS[name], size=design.length, base=(i%3===2?207:212);
    const yy=f=>base+design.profile[Math.min(5,Math.round(f*5))];
    const yAt=x=>landscape(level,x);
    for(let n=1;n<design.profile.length;n++)level.points.push([Math.round(start+size*n/5),yy(n/5)]);
    const area={name,x:start,end:start+size,zone:stage.zone,terrain:'metal'};
    level.areas.push(area);
    // Four landmarks, each with its own collision/interaction role.
    design.features.forEach((feature,slot)=>{
      const x=Math.floor(start+size*(.15+slot*.225)),y=yAt(x);
      if(feature==='pit'){
        level.pits.push([x,x+53+(stage.id%4)*4]);
        platform('bridge',x-30,y-39,117);
        platform('bridge',x+17,y+35,60,{rescueSpring:true});
        obj('spring',x+22,y+33,{power:341,launchX:38});
      }else if(feature==='loop'){
        level.loops.push({x,y:y-36,r:36});
        for(let n=0;n<4;n++)obj('ring',x-65+n*14,y-15);
      }else if(['rail','conveyor','ice','float','lift','deck','roof'].includes(feature)){
        const kind=feature==='roof'?'deck':feature;
        const lift=kind==='lift',h=kind==='rail'?40:lift?45:(kind==='float'||kind==='deck'?48:2);
        platform(kind,x-32,y-h,kind==='rail'?168:106,{amplitude:lift?28:kind==='float'?10:0,phase:i*.7+slot});
        for(let n=0;n<4;n++)obj('ring',x-15+n*20,y-h-11);
        if(kind==='deck'||kind==='rail')platform('deck',x+112,y-h-14,86);
      }else if(feature==='spring'||feature==='bumper'||feature==='ramp'){
        obj('spring',x,y,{power:feature==='bumper'?365:327,launchX:feature==='ramp'?95:0});
        for(let n=0;n<4;n++)obj('ring',x+10+n*16,y-24-Math.sin(n*.8)*31);
      }else if(feature==='terminal'||feature==='obelisk'){
        obj('terminal',x,y,{target:x+87});
        platform('deck',x+82,y-65,108);
      }else if(feature==='barrier'){
        obj('breakable',x,y,{w:22,h:30});
        platform('deck',x-48,y-34,44);
      }else if(feature==='press'){
        obj('spike',x,y,{pulse:true,offset:i});
        platform('deck',x-67,y-38,101);
      }else if(feature==='water'||feature==='gravity'){
        area.terrain=feature;
        area.field=[x-59,x+112];
      }else if(feature==='secret'){
        platform('deck',x-54,y-79,105);
        obj('secret',x,y-95);obj('block',x-60,y);
      }else if(feature==='shield'||feature==='cache'||feature==='charge'){
        obj(feature==='shield'?'shield':'battery',x,y-17);
      }else if(feature==='portal'){
        platform('deck',x-40,y-40,82);
        obj('secret',x,y-55);
      }
    });
    if(!stage.special){
      const ox=start+size*.55; enemies.push({type:design.enemy,x:ox,baseX:ox,y:yAt(ox),active:true,phase:i*.85,shotAt:0,dir:-1});
      if(i%3===2){const x=start+64;obj('checkpoint',x,yAt(x));}
      if(i===2&&stage.id<13){const x=start+105;obj('portal',x,yAt(x)-4,{stage:14+(stage.id%7)});}
    }
    // A second score line makes ordinary traversal and character-specific high routes worthwhile.
    for(let n=0;n<7;n++){const x=start+58+n*25;obj('ring',x,yAt(x)-14-Math.sin(n*Math.PI/6)*5);}
    start+=size;
  }
  const endY=level.points.at(-1)[1];
  level.arenaStart=start+240; level.width=level.arenaStart+440;
  level.points.push([level.arenaStart,endY],[level.width,endY]);
  obj('checkpoint',start+96,endY);
  if(stage.special){
    // Emit more targets than the quota so a missed optional line can be recovered.
    // Four different interaction requirements use the same clearly visible frequency beacon.
    const count=stage.goal+3;
    for(let i=0;i<count;i++){
      let x=345+i*(start-560)/(count-1);
      const pit=level.pits.find(([a,b])=>x>a-40 && x<b+40);
      if(pit)x=pit[1]+55;
      const airborne=stage.objective==='air'||stage.objective==='bounce';
      const y=landscape(level,x);
      const trigger=stage.objective==='relay'?['up','attack','air'][i%3]:
        stage.objective==='switch'?'up':stage.objective==='break'?'attack':airborne?'air':'collect';
      obj('core',x,y-(airborne||trigger==='air'?39:15),{objective:stage.objective,trigger,index:i});
      if(airborne)obj('spring',x-18,y,{power:290,launchX:0});
    }
  }
  for(const distance of [64,125,295,355])obj('ring',level.arenaStart+distance,endY-14,{arena:true});
  obj('exit',level.width-38,endY);
  level.objects.sort((a,b)=>a.x-b.x);
  level.enemies.sort((a,b)=>a.baseX-b.baseX);
  level.platforms.sort((a,b)=>a.baseX-b.baseX);
  return level;
}
