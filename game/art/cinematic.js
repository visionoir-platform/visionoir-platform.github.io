/** Directed, interruptible panoramas using the same original levels, actors and machines as play. */
const W=480,H=180;
export function playCinematic(canvas,{zone=0,hero=0,kind='prologue',bossId=0,reducedMotion=false,characterBase='/unseen/art/'}={}) {
  if (!canvas || !canvas.getContext('2d')) return () => {};
  const ctx=canvas.getContext('2d');
  canvas.width=W;canvas.height=H;ctx.imageSmoothingEnabled=false;
  const root='/unseen/art/',images=new Map();let alive=true,raf=0,t=0,last=0;
  const minimized=Boolean(typeof reducedMotion==='function'?reducedMotion():reducedMotion)||!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const director=kind==='boss'||kind==='prologue'||kind==='secret';
  const machine=kind==='boss'||kind==='secret';
  const heroName='character-'+hero+'-'+(kind==='secret'?1:0)+'.png';
  const files=['sky-'+zone+'.png','scenery-'+zone+'-0.png','scenery-'+zone+'-1.png',heroName,'objects.png'];
  if(director)files.push('director.png');
  if(machine)files.push('machine-'+bossId+'.png');
  let complete=0;
  const finish=()=>{if(++complete===files.length && alive){draw();if(!minimized)raf=requestAnimationFrame(tick);}};
  for(const name of files){
    const img=new Image();
    img.onload=()=>{if(alive)images.set(name,img);finish();};img.onerror=finish;
    img.src=(name===heroName?characterBase:root)+name;
  }
  function strip(name,row,f,w,h,x,y,pivotX,pivotY,scale=1,face=1){
    const im=images.get(name);if(!im)return;
    ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale*face,scale);
    ctx.drawImage(im,f*w,row*h,w,h,-pivotX,-pivotY,w,h);ctx.restore();
  }
  function layer(name,a,oy){
    const im=images.get(name);if(!im)return;
    const xx=-Math.floor(a%W);ctx.drawImage(im,xx,oy);ctx.drawImage(im,xx+W,oy);
  }
  function draw(){
    const cam=14+Math.min(t,18)*(director?3.5:5.2);
    ctx.fillStyle='#191c2d';ctx.fillRect(0,0,W,H);
    layer('sky-'+zone+'.png',cam*.1,-38);
    layer('scenery-'+zone+'-0.png',cam*.3,-66);
    layer('scenery-'+zone+'-1.png',cam*.8,-59);
    ctx.fillStyle='#242b35';ctx.fillRect(0,143,W,37);
    ctx.fillStyle='#9ba9ae';ctx.fillRect(0,142,W,2);
    const beat=Math.floor(t*.55)%3;
    for(let i=0;i<15;i++){
      const x=((i*37-cam)%W+W)%W;ctx.fillStyle=i%3?'#465267':'#5b6174';ctx.fillRect(x,152+i%5*4,12+i%6,1);
    }
    const walk=Math.min(18,t*8),hx=kind==='credits'?160:102+walk;
    // Sequence index names come from the generator; choose the matching row once per short clip.
    const row=({prologue:31,intro:29,zone:3,boss:30,ending:28,secret:34,credits:28})[kind]??31;
    strip(heroName,row,Math.floor(t*(kind==='zone'?6:4))%8,64,64,hx,143,32,56,1.65);
    if(director){
      const directorRow=kind==='secret'?(beat===2?10:6):kind==='boss'?(beat===0?9:beat===1?2:5):(beat===1?1:2);
      strip('director.png',directorRow,Math.floor(t*6)%6,64,64,330-Math.min(t*4,13),143,31,55,1.35,-1);
    }
    if(machine)strip('machine-'+bossId+'.png',beat===1?2:0,Math.floor(t*5)%6,112,88,382-Math.min(t*4,22),143,55,75,1);
    if(kind==='ending'||kind==='secret'){
      const count=kind==='secret'?7:3;
      for(let j=0;j<count;j++){
        const k=(t*.35+j*Math.PI*2/count);
        strip('objects.png',10,Math.floor(t*4+j)%6,40,40,240+Math.cos(k)*35,82+Math.sin(k)*11,20,20,.6);
      }
    }
  }
  function tick(now){
    if(!alive)return;
    if(!document.hidden){t+=last?Math.min(.1,(now-last)/1000):0;draw();}
    last=now;raf=requestAnimationFrame(tick);
  }
  return ()=>{alive=false;cancelAnimationFrame(raf);images.clear();};
}
