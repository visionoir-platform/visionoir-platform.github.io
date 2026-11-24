import { groundAt, lower, byX, baseX } from '../engine/world.js';

const BASE = '/unseen/art/';
const W = 480;
const H = 270;
const mod = (x, n) => ((x % n) + n) % n;
const centeredObjects = new Set(['ring','battery','secret','shield','core']);
const fxAliases = {ability:'telekinesis',ring:'collect',core:'collect',break:'debris',hit:'shock',enemy:'fire',dash:'boost'};
const colors = ['#75cee0','#ed925f','#e58eab','#97d9ef','#82d8ac','#e8b585','#f27576','#c9ace8'];

async function json(file) {
  const response = await fetch(BASE + file + '.json');
  if (!response.ok) throw Error('Missing game art: ' + file);
  return response.json();
}
export async function createRenderer(canvas, options = {}) {
  const ctx = canvas.getContext('2d', {alpha: false});
  if (!ctx) throw Error('Canvas 2D unavailable');
  const prefix = options.characterBase || BASE;
  const [animations, objects, bosses] = await Promise.all(['animations','objects','bosses'].map(json));
  const objectRows = new Map(objects.rows.map((name, i) => [name,i]));
  const poseRows = new Map(animations.rows.map((name, i) => [name,i]));
  const machineRows = new Map(bosses.rows.map((name, i) => [name,i]));
  const cache = new Map();
  const textures = new Map();
  const patterns = new WeakMap();
  let active = true;
  let zone = null;
  let currentHero = null;
  let currentMachine = null;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  function load(name, base = BASE) {
    const url = base + name;
    if (!cache.has(url)) {
      const img = new Image();
      const promise = new Promise((resolve, reject) => {
        img.onload = () => {if (active && cache.get(url)===promise) textures.set(name,img); resolve(img);};
        img.onerror = () => reject(Error('Missing game art: '+name));
        img.src = url;
      });
      cache.set(url,promise);
    }
    return cache.get(url);
  }
  function release(name) {
    textures.delete(name);
    cache.delete(BASE+name);
    if(prefix!==BASE)cache.delete(prefix+name);
  }
  function loadZone(id) {
    if (zone === id) return;
    if(zone!==null) {
      for(const name of ['sky-'+zone+'.png','tile-'+zone+'.png','scenery-'+zone+'-0.png','scenery-'+zone+'-1.png'])release(name);
    }
    zone = id;
    for (const name of ['sky-'+id+'.png','tile-'+id+'.png','scenery-'+id+'-0.png','scenery-'+id+'-1.png']) {
      void load(name).catch(() => {});
    }
  }
  function parallax(name, x, y) {
    const img = textures.get(name);
    if (!img) return;
    const px = -Math.round(mod(x,W));
    ctx.drawImage(img,px,y);
    ctx.drawImage(img,px+W,y);
  }
  function frame(file, row, phase, width, height, x, y, pivotX, pivotY, scale=1, facing=1, angle=0) {
    const img = textures.get(file);
    if (!img || row == null) return;
    ctx.save();
    ctx.translate(Math.round(x),Math.round(y));
    if (angle) ctx.rotate(angle);
    ctx.scale(facing*scale,scale);
    ctx.drawImage(img,phase*width,row*height,width,height,-pivotX,-pivotY,width,height);
    ctx.restore();
  }
  function fromObjects(name, t, x, y, scale=1,center=false,dir=1) {
    frame('objects.png',objectRows.get(name),mod(Math.floor(t*9),6),40,40,x,y,20,center ? 20 : 35,scale,dir);
  }
  function ground(run, camX, camY, accent) {
    // Material patterns are anchored in world space to avoid swimming through slopes.
    const tile = textures.get('tile-'+zone+'.png');
    let path = null;
    let stroke = null;
    let lastX=0;
    for (let x=-8;x<=W+8;x+=4) {
      const y=Math.round(groundAt(run,Math.min(run.level.width,Math.max(0,x+camX)))-camY);
      if (Number.isFinite(y)) {
        if (!path) {
          path = new Path2D(); stroke = new Path2D();
          path.moveTo(x,H+8);path.lineTo(x,y);stroke.moveTo(x,y);
        } else {path.lineTo(x,y);stroke.lineTo(x,y);}
        lastX=x;
      }
      if (path && (!Number.isFinite(y) || x>=W+8)) {
        path.lineTo(lastX,H+8);path.closePath();ctx.fillStyle='#25303a';ctx.fill(path);
        if (tile) {
          ctx.save(); ctx.clip(path);
          const startX=-mod(Math.round(camX),32),startY=-mod(Math.round(camY),32);
          if(!patterns.has(tile))patterns.set(tile,ctx.createPattern(tile,'repeat'));
          const pattern=patterns.get(tile);
          ctx.translate(startX,startY);ctx.fillStyle=pattern;ctx.fillRect(0,0,W+32,H+32);
          ctx.restore();
        }
        ctx.lineWidth=4;ctx.strokeStyle='#1a202c';ctx.stroke(stroke);
        ctx.lineWidth=2;ctx.strokeStyle=accent;ctx.stroke(stroke);
        path=null;stroke=null;
      }
    }
  }
  function platform(p, cx,cy, accent, time) {
    const x=Math.round(p.x-cx), y=Math.round(p.y-cy), w=p.w;
    ctx.fillStyle='#191d29';ctx.fillRect(x,y,w,p.type==='rail'?4:p.h);
    ctx.fillStyle=p.type==='ice'?'#c7eff5':'#abb6b8';ctx.fillRect(x,y,w,2);
    if(p.type==='rail') {
      ctx.fillStyle=accent;ctx.fillRect(x,y+2,w,1);
      for(let i=9;i<w-4;i+=34){ctx.fillRect(x+i,y+4,2,5);}
      return;
    }
    ctx.fillStyle='#647080';ctx.fillRect(x+1,y+3,w-2,2);
    const phase=p.type==='conveyor'?Math.round(time*24)%12:0;
    for(let i=4+phase;i<w-4;i+=12){ctx.fillStyle=i%3===0?accent:'#4d5264';ctx.fillRect(x+i,y+5,4,2);}
    if (p.type==='lift'||p.type==='float') {
      ctx.fillStyle=accent;ctx.fillRect(x+5,y+8,6,2);ctx.fillRect(x+w-12,y+8,6,2);
    }
  }
  function loop(loop,cx,cy,accent) {
    const x=Math.round(loop.x-cx), y=Math.round(loop.y-cy);
    ctx.beginPath();ctx.arc(x,y,loop.r+4,0,Math.PI*2);ctx.strokeStyle='#282a37';ctx.lineWidth=7;ctx.stroke();
    ctx.strokeStyle='#707c89';ctx.lineWidth=3;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,loop.r,0,Math.PI*2);ctx.strokeStyle=accent;ctx.lineWidth=1;ctx.stroke();
    for (let j=0;j<10;j++) {
      const k=j*Math.PI/5, px=x+Math.cos(k)*(loop.r+5), py=y+Math.sin(k)*(loop.r+5);
      ctx.fillStyle='#cad9dc';ctx.fillRect(Math.round(px),Math.round(py),2,2);
    }
  }
  function draw(run) {
    if (!active || !run?.player) return;
    const cx=Math.round(run.camX), cy=Math.round(run.camY);
    const z=run.stage.zone, accent=colors[z];
    const motion=options.reducedMotion?.()??reduced?.matches;
    loadZone(z);
    const heroFile='character-'+run.character+'-'+Number(!!run.player.super)+'.png';
    if (currentHero!==heroFile){
      if(currentHero)release(currentHero);
      currentHero=heroFile;void load(heroFile,prefix).catch(()=>{});
    }
    ctx.save();
    ctx.fillStyle='#1c2130';ctx.fillRect(0,0,W,H);
    parallax('sky-'+z+'.png',cx*.035,0);
    parallax('scenery-'+z+'-0.png',cx*.14,Math.round(-cy*.11));
    parallax('scenery-'+z+'-1.png',cx*.36,Math.round(-cy*.26));
    if (run.stage.special) {
      // Optical frequency gate: converging lines establish a separate depth plane.
      ctx.globalAlpha=.36;ctx.strokeStyle=accent;ctx.lineWidth=1;
      const vanish=W*.62;for(let i=-8;i<9;i++){ctx.beginPath();ctx.moveTo(vanish,126);ctx.lineTo(i*75+mod(cx*.19,75),H);ctx.stroke();}
      ctx.globalAlpha=1;
    }
    for (const a of run.level.areas) {
      if (!a.field || a.field[1]<cx || a.field[0]>cx+W) continue;
      const x=a.field[0]-cx,w=a.field[1]-a.field[0],y=Math.round(groundAt(run,a.field[0])-cy-20);
      if (!Number.isFinite(y)) continue;
      ctx.fillStyle=a.terrain==='water'?'#65bed533':'#bba3f428';ctx.fillRect(x,y-(a.terrain==='water'?0:40),w,a.terrain==='water'?42:70);
      ctx.fillStyle=accent;for(let i=1;i<w;i+=11)ctx.fillRect(x+i,y+Math.round(Math.sin((i+run.time*12)/8)),3,1);
    }
    ground(run,cx,cy,accent);
    for (const p of run.level.platforms) if(p.x+p.w>=cx && p.x<cx+W)platform(p,cx,cy,accent,run.time);
    for (const l of run.level.loops) if(Math.abs(l.x-cx-W/2)<W/2+l.r+8)loop(l,cx,cy,accent);
    for(let i=lower(run.objects,byX,cx-38);i<run.objects.length && run.objects[i].x<cx+W+38;i++){
      const o=run.objects[i];if(!o.active)continue;
      const y=o.y-cy;
      if(o.type==='spike' && o.raised===false){ctx.fillStyle='#727883';ctx.fillRect(o.x-cx-12,y-2,24,2);continue;}
      fromObjects(o.type,run.time+o.x*.07,o.x-cx,y,o.type==='block'?.72:1,centeredObjects.has(o.type));
      if(o.type==='core'){
        const xx=Math.round(o.x-cx), yy=Math.round(y)-15;
        ctx.strokeStyle='#f0f1d8';ctx.fillStyle=accent;ctx.lineWidth=1;ctx.beginPath();
        if(o.trigger==='up'){ctx.moveTo(xx-3,yy);ctx.lineTo(xx,yy-3);ctx.lineTo(xx+3,yy);ctx.moveTo(xx,yy-3);ctx.lineTo(xx,yy+2);}
        else if(o.trigger==='attack'){ctx.moveTo(xx-4,yy+2);ctx.lineTo(xx-1,yy-2);ctx.lineTo(xx,yy);ctx.lineTo(xx+4,yy-4);}
        else if(o.trigger==='air'){ctx.moveTo(xx-5,yy-2);ctx.lineTo(xx-2,yy);ctx.lineTo(xx,yy+2);ctx.lineTo(xx+2,yy);ctx.lineTo(xx+5,yy-2);}
        else{ctx.moveTo(xx,yy-2);ctx.lineTo(xx+2,yy);ctx.lineTo(xx,yy+2);ctx.lineTo(xx-2,yy);ctx.closePath();}
        ctx.stroke();
      }
      if(o.lit){ctx.fillStyle=accent;ctx.fillRect(o.x-cx-2,y-30,4,2);}
    }
    for(let i=lower(run.enemies,baseX,cx-70);i<run.enemies.length && run.enemies[i].baseX<cx+W+70;i++){
      const e=run.enemies[i];if(e.active)fromObjects(e.type,run.time+e.phase,e.x-cx,e.y-cy,1,false,e.dir||1);
    }
    const b=run.boss;
    if(b && b.state!=='dead'){
      const file='machine-'+b.id+'.png';
      if(file!==currentMachine){
        if(currentMachine)release(currentMachine);
        currentMachine=file;void load(file).catch(()=>{});
      }
      frame(file,machineRows.get(b.state)??1,Math.floor(run.time*9)%6,112,88,b.x-cx,b.y-cy,55,75,.93,b.x>=run.player.x?1:-1);
    }
    const p=run.player;
    const pose=poseRows.has(p.pose)?p.pose:'idle';
    if(p.slow>0||run.shield){
      ctx.beginPath();ctx.ellipse(p.x-cx,p.y-cy-17,18,22,0,0,Math.PI*2);ctx.strokeStyle=run.shield?'#9ee5d4':'#f68c9b';ctx.lineWidth=1;ctx.stroke();
    }
    ctx.globalAlpha=p.immune>0?.8:1;
    frame(heroFile,poseRows.get(pose),Math.floor(run.time*(animations.fps[pose]||8))%8,64,64,p.x-cx,p.y-cy,32,56,.86,p.facing,p.angle||0);
    ctx.globalAlpha=1;
    for(const q of run.projectiles)if(q.active!==false)fromObjects(q.type,run.time,q.x-cx,q.y-cy,.8,true,q.vx<0?-1:1);
    for(const fx of run.fx){const name=fxAliases[fx.type]||fx.type;fromObjects(objectRows.has(name)?name:'spark',run.time+fx.life,fx.x-cx,fx.y-cy,.8,true);}
    if(!motion && z===0){
      ctx.fillStyle='#b4c9dd55';
      for(let i=0;i<14;i++){const x=mod(i*73-run.time*41-cx*.45,W),y=mod(i*47+run.time*95,H);ctx.fillRect(x|0,y|0,1,3);}
    }
    ctx.restore();
  }
  // Preload only the first visible actor and district; later zones load on demand.
  const initialZone=options.zone??0;
  const initialHero=options.hero??0;
  await Promise.all([load('objects.png'),load('character-'+initialHero+'-0.png',prefix),
    load('sky-'+initialZone+'.png'),load('tile-'+initialZone+'.png'),load('scenery-'+initialZone+'-0.png'),load('scenery-'+initialZone+'-1.png')]);
  zone=initialZone;currentHero='character-'+initialHero+'-0.png';
  return {draw,destroy(){active=false;cache.clear();textures.clear();}};
}
