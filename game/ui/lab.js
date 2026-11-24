const categories={system:'system',campaign:'campaign',special:'bonus',boss:'bosses',event:'events',ending:'finales',extra:'challenge',movement:'movement',collect:'reward',combat:'combat',ability:'abilities',energy:'power',machine:'machines',world:'environment',interface:'interface',narrative:'cinema'};
export const clock=seconds=>{const n=Math.max(0,Math.floor(seconds||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};

export function mountLab({node,audio,t,button,html,back,settings,volume,notify,prior,effectName}){
  let kind=prior?.kind||'music', index=prior?.index||0,repeat=!!prior?.repeat,frame=0,dead=false;
  let active=!!prior, request=0;
  function show(){
    const list=kind==='music'?audio.music:audio.effects;
    const item=list[index];if(!item)return;
    node.innerHTML='<div class="page lab"><div class="page-head">'+button('back','← '+t('back'))+'<h1>'+t('lab')+'</h1></div><div class="lab-layout"><div class="deck"><p class="over">'+html(t(categories[item.category]))+'</p><div class="vinyl" aria-hidden="true"><i></i></div><h2 dir="auto">'+html(kind==='music'?item.title:effectName(item.id))+'</h2><p class="meta">'+String(index+1).padStart(2,'0')+' / '+list.length+' · '+clock(item.duration)+'</p><label>'+t('position')+'<input id="scrub" dir="ltr" type="range" min="0" max="'+item.duration+'" step=".05" value="0"></label><output id="elapsed">0:00</output><div class="transport">'+['prev','play','pause','stop','next','repeat'].map(k=>button(k,t(k))).join('')+'</div><label>'+t('volume')+'<input id="lab-volume" type="range" min="0" max="100" value="'+settings.volume+'"></label></div><div><div class="tabs">'+button('music',t('music'))+button('sfx',t('sfx'))+'</div><div class="tracks">'+list.map((v,i)=>'<button data-track="'+i+'" aria-current="'+(i===index)+'"><span>'+String(i+1).padStart(2,'0')+'</span><b dir="auto">'+html(kind==='music'?v.title:effectName(v.id))+'</b><small>'+clock(v.duration)+'</small></button>').join('')+'</div></div></div></div>';
    const accent=/^#[0-9a-f]{6}$/i.test(item.color)?item.color:'#a8e2f2';
    node.querySelector('.lab').style.setProperty('--ice',accent);
    for(const b of node.querySelectorAll('.tabs button'))b.setAttribute('aria-pressed',String(b.dataset.act===kind));
    node.querySelector('[data-act=repeat]').setAttribute('aria-pressed',String(repeat));
    node.querySelector('#scrub').oninput=e=>audio.seek(+e.target.value);
    node.querySelector('#lab-volume').oninput=e=>volume(+e.target.value);
    if(prior?.focusList)node.querySelector('[aria-current=true]')?.focus({preventScroll:true});
  }
  async function play(resume=false){
    const target=(kind==='music'?audio.music:audio.effects)[index]; if(!target)return;
    const revision=++request;
    try{
      if(resume && active && audio.state().id===target.id)await audio.resume();
      else if(kind==='music')await audio.play(target.id,{loop:repeat,immediate:true});
      else {await audio.previewEffect(target.id);audio.setRepeat(repeat);}
      if(revision===request)active=true;
    }catch{if(!dead && revision===request)notify(t('error'));}
  }
  function select(i,shouldPlay=true){
    const list=kind==='music'?audio.music:audio.effects;
    index=(i+list.length)%list.length;active=false;show();if(shouldPlay)void play();
    node.querySelector('[aria-current=true]')?.focus({preventScroll:true});
  }
  function click(e){
    const row=e.target.closest('[data-track]');if(row){select(+row.dataset.track);return;}
    const action=e.target.closest('[data-act]')?.dataset.act;
    if(action==='back'){back();return;}
    if(action==='music'||action==='sfx'){request++;audio.stop();kind=action;index=0;active=false;show();return;}
    if(action==='play')void play(true);
    if(action==='pause')audio.pause();
    if(action==='stop'){request++;audio.stop();active=false;}
    if(action==='prev')select(index-1);if(action==='next')select(index+1);
    if(action==='repeat'){repeat=!repeat;audio.setRepeat(repeat);node.querySelector('[data-act=repeat]').setAttribute('aria-pressed',String(repeat));}
  }
  node.addEventListener('click',click);
  function tick(){
    if(dead)return;
    const {time,paused}=audio.state(),range=node.querySelector('#scrub');
    if(range && document.activeElement!==range)range.value=time||0;
    const elapsed=node.querySelector('#elapsed');if(elapsed)elapsed.textContent=clock(time);
    const disc=node.querySelector('.vinyl');
    if(disc && !document.hidden){const bands=paused?[0,0,0]:audio.bands();disc.style.setProperty('--lift',String(bands[0]||0));disc.classList.toggle('playing',!paused);}
    frame=requestAnimationFrame(tick);
  }
  show();tick();
  return {snapshot:()=>({index,kind,repeat}),destroy(stop=true){dead=true;request++;cancelAnimationFrame(frame);node.removeEventListener('click',click);if(stop)audio.stop();}};
}
