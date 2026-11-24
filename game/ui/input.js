export const defaultKeys={left:'KeyA',right:'KeyD',up:'KeyW',down:'KeyS',jump:'Space',dash:'ShiftLeft',attack:'KeyJ',special:'KeyK',transform:'KeyL',pause:'Escape'};
export const defaultPad={left:14,right:15,up:12,down:13,jump:0,dash:5,attack:2,special:1,transform:3,pause:9};
const arrows={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};

export function createInput({settings,playing,onPause,menu,changed}) {
  const held=new Set(),touches=new Map();
  let previous=[], awaiting=null, lastMove=0;
  const clear=()=>{held.clear();touches.clear();};
  function assign(source,value){
    const map=settings[source], other=Object.keys(map).find(k=>map[k]===value);
    if(other && other!==awaiting)map[other]=map[awaiting];
    map[awaiting]=value; awaiting=null; clear();changed();
  }
  window.addEventListener('keydown',event=>{
    if(awaiting){event.preventDefault();if(!event.repeat)assign('keys',event.code);return;}
    if(!playing() || event.target.closest('input,select,dialog'))return;
    if(event.code===settings.keys.pause){event.preventDefault();if(!event.repeat)onPause();return;}
    if(!arrows[event.code] && !Object.values(settings.keys).includes(event.code))return;
    event.preventDefault();held.add(event.code);
  });
  window.addEventListener('keyup',event=>held.delete(event.code));
  window.addEventListener('blur',clear);
  window.addEventListener('gamepaddisconnected',()=>{previous=[];clear();if(playing())onPause();});
  function bindTouch(root){
    for(const button of root.querySelectorAll('[data-input]')){
      button.addEventListener('pointerdown',event=>{
        if(event.pointerType==='mouse' && event.button!==0)return;
        event.preventDefault();button.setPointerCapture(event.pointerId);
        touches.set(event.pointerId,button.dataset.input);button.classList.add('pressed');
      });
      const end=event=>{touches.delete(event.pointerId);if(![...touches.values()].includes(button.dataset.input))button.classList.remove('pressed');};
      for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,end);
    }
  }
  function poll(stamp){
    let pad;
    try{pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);}catch{}
    const buttons=pad?.buttons.map(b=>b.pressed)||[];
    const edge=i=>buttons[i]&&!previous[i];
    if(awaiting && pad){
      const i=buttons.findIndex((on,j)=>on&&!previous[j]);if(i>=0)assign('pad',i);
    }else if(playing()){
      if(edge(settings.pad.pause))onPause();
    }else if(pad && stamp-lastMove>140){
      const axis=pad.axes[1]||pad.axes[0]||0;
      if(edge(0)){menu('select');lastMove=stamp;}
      else if(edge(1)){menu('back');lastMove=stamp;}
      else if(buttons[12]||buttons[14]||axis<-.55){menu('prev');lastMove=stamp;}
      else if(buttons[13]||buttons[15]||axis>.55){menu('next');lastMove=stamp;}
    }
    previous=buttons;
    const input={};
    for(const [action,key] of Object.entries(settings.keys))input[action]=held.has(key)||buttons[settings.pad[action]]||false;
    for(const code of held)if(arrows[code])input[arrows[code]]=true;
    for(const action of touches.values())input[action]=true;
    if(pad){if(pad.axes[0]<-.23)input.left=true;if(pad.axes[0]>.23)input.right=true;if(pad.axes[1]<-.5)input.up=true;if(pad.axes[1]>.5)input.down=true;}
    return input;
  }
  return {poll,clear,bindTouch,rebind(action){awaiting=action;},cancel(){awaiting=null;}};
}
