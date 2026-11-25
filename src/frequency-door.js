// The public studio has two deliberate entrances. This gesture belongs only to the logo.
export function bindFrequencyDoor(element, { onOpen, windowMs = 1500, now = () => performance.now() }) {
  let count = 0, first = 0, resetTimer, active = null, opening = false, source = null;
  const down = new Set();
  function reset() {
    clearTimeout(resetTimer);
    active = null;
    count = 0;
    source = null;
    delete element.dataset.pulse;
  }
  function activate(input) {
    if (opening) return;
    const time = now();
    if (!count || input !== source || time-first>windowMs) { reset(); first=time; source=input; }
    count++;
    element.dataset.pulse=String(count);
    if (count===3) {
      opening=true;
      clearTimeout(resetTimer);
      onOpen();
    } else if (count===1) resetTimer=setTimeout(reset,windowMs);
  }
  element.addEventListener('pointerdown',e=>{
    if(e.button!==0 || !e.isPrimary || down.size) {down.add(e.pointerId);reset();return;}
    down.add(e.pointerId);
    active={id:e.pointerId,x:e.clientX,y:e.clientY,t:now()};
  });
  element.addEventListener('pointermove',e=>{
    if(active?.id===e.pointerId && Math.hypot(e.clientX-active.x,e.clientY-active.y)>9)reset();
  });
  window.addEventListener('pointerup',e=>{
    const candidate=active;
    const valid=down.delete(e.pointerId) && candidate?.id===e.pointerId && !down.size &&
      element.contains(e.target) && now()-candidate.t<410 &&
      Math.hypot(e.clientX-candidate.x,e.clientY-candidate.y)<=9;
    active=null;
    if(valid)activate('pointer');
    else if(candidate)reset();
  });
  window.addEventListener('pointerdown',e=>{if(!element.contains(e.target))reset();},true);
  window.addEventListener('pointercancel',e=>{down.delete(e.pointerId);reset();});
  // Focusing a button can scroll the document after the first keyboard activation.
  // A scroll interrupts a pointing gesture, while a keyboard sequence follows focus.
  window.addEventListener('scroll',()=>{if(active || source==='pointer')reset();},{passive:true,capture:true});
  element.addEventListener('blur',()=>{if(source==='keyboard')reset();});
  element.addEventListener('click',e=>{if(e.detail===0)activate('keyboard');});
  element.addEventListener('keydown',e=>{if(e.repeat && (e.key==='Enter'||e.key===' '))e.preventDefault();});
  window.addEventListener('blur',()=>{down.clear();reset();});
  window.addEventListener('pageshow',e=>{if(e.persisted){opening=false;down.clear();reset();}});
}
