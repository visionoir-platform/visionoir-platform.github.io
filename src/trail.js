/** A silver trail follows input without taking part in hit testing or native scrolling. */
export function mountTrail() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return {setEnabled() {}};
  canvas.className = 'metal-trail';
  canvas.setAttribute('aria-hidden','true');
  document.body.append(canvas);

  const marks = [];
  const lifetime = 390;
  let frame = 0;
  let width = 0;
  let height = 0;
  let enabled = true;
  let touch = null;
  let lastScroll = window.scrollY;

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    marks.length = 0;
    context.clearRect(0,0,width,height);
    canvas.dataset.active = 'false';
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    const ratio = Math.min(devicePixelRatio || 1,1.25,Math.sqrt(1700000 / Math.max(1,width*height)));
    canvas.width = Math.round(width*ratio);
    canvas.height = Math.round(height*ratio);
    context.setTransform(ratio,0,0,ratio,0,0);
    reset();
  }

  function mark(x,y,kind) {
    if (!enabled || document.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x<0 || x>width || y<0 || y>height) return;
    const now = performance.now();
    const last = marks.at(-1);
    if (last && Math.hypot(x-last.x,y-last.y)<3) return;
    if (last && now-last.time>120) last.break = true;
    marks.push({x,y,time:now,kind,break:false});
    if (marks.length>26) marks.shift();
    if (!frame) frame=requestAnimationFrame(draw);
    canvas.dataset.active = 'true';
  }

  function stroke(a,b,strength,radius) {
    if (a.break) return;
    const dx=b.x-a.x, dy=b.y-a.y;
    const length=Math.hypot(dx,dy);
    if (!length || length>145) return;
    const nx=-dy/length*radius, ny=dx/length*radius;
    const gradient=context.createLinearGradient(b.x-nx,b.y-ny,b.x+nx,b.y+ny);
    gradient.addColorStop(0,'#ffffff10');
    gradient.addColorStop(.19,'#ffffffd0');
    gradient.addColorStop(.34,'#c9c9c981');
    gradient.addColorStop(.55,'#333333a6');
    gradient.addColorStop(.79,'#dadadaab');
    gradient.addColorStop(1,'#ffffff00');
    context.globalAlpha=strength;
    context.strokeStyle=gradient;
    context.lineWidth=radius*2;
    context.lineCap='round';
    context.beginPath();
    context.moveTo(a.x,a.y);
    context.lineTo(b.x,b.y);
    context.stroke();
  }

  function draw(now) {
    frame=0;
    context.clearRect(0,0,width,height);
    while (marks.length && now-marks[0].time>=lifetime) marks.shift();
    if (!enabled || !marks.length || document.hidden) { reset(); return; }
    for (let index=1; index<marks.length; index++) {
      const a=marks[index-1], b=marks[index];
      const strength=(1-(now-b.time)/lifetime)**2;
      const radius=(b.kind==='touch'?8:6)*(.32+.68*strength);
      stroke(a,b,strength,radius);
    }
    const lead=marks.at(-1);
    const strength=(1-(now-lead.time)/lifetime)**2;
    const radius=(lead.kind==='touch'?11:8)*(0.65+.35*strength);
    const shine=context.createRadialGradient(lead.x-radius*.28,lead.y-radius*.36,0,lead.x,lead.y,radius);
    shine.addColorStop(0,'#fff');
    shine.addColorStop(.23,'#f9f9f9c0');
    shine.addColorStop(.52,'#676767ad');
    shine.addColorStop(.74,'#222222a0');
    shine.addColorStop(.88,'#dededed0');
    shine.addColorStop(1,'#dcdcdc00');
    context.globalAlpha=strength*.9;
    context.fillStyle=shine;
    context.beginPath();
    context.ellipse(lead.x,lead.y,radius*.8,radius,0,0,Math.PI*2);
    context.fill();
    context.globalAlpha=1;
    frame=requestAnimationFrame(draw);
  }

  function onTouch(event) {
    if (event.touches.length!==1) { touch=null; return; }
    const point=event.touches[0];
    touch={x:point.clientX,y:point.clientY,time:performance.now()};
    lastScroll=window.scrollY;
    mark(touch.x,touch.y,'touch');
  }
  window.addEventListener('pointermove',event=>{
    if (event.pointerType!=='touch') { touch=null; mark(event.clientX,event.clientY,'pointer'); }
  },{passive:true});
  for (const type of ['touchstart','touchmove']) window.addEventListener(type,onTouch,{passive:true});
  window.addEventListener('touchcancel',()=>{touch=null;},{passive:true});
  window.addEventListener('scroll',()=>{
    const position=window.scrollY;
    const delta=position-lastScroll;
    lastScroll=position;
    if (!touch || performance.now()-touch.time>360 || !delta) return;
    touch.y=Math.max(0,Math.min(height,touch.y-Math.max(-26,Math.min(26,delta))));
    mark(touch.x,touch.y,'touch');
  },{passive:true});
  window.addEventListener('resize',resize,{passive:true});
  document.addEventListener('visibilitychange',()=>{ if(document.hidden){touch=null; reset();} });
  resize();

  return {
    setEnabled(value) {
      enabled=Boolean(value);
      if (!enabled) {touch=null;reset();}
    },
    start(event) {
      if (event.type==='touchstart') onTouch(event);
      else if(event.pointerType!=='touch') mark(event.clientX,event.clientY,'pointer');
    },
  };
}
