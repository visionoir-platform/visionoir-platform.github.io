/** Game-owned transport. Sound Test and gameplay share one pair of crossfading decks.
 * The site player is suspended by navigating to the standalone game document. */
export function createGameAudio() {
  const base = new URL('.', import.meta.url);
  const roles = ['master', 'music', 'effects'];
  const levels = {master: .72, music: .86, effects: .8};
  const list = {music: [], effects: []};
  const buffers = new Map();
  const pending = new Map();
  const voices = new Set();
  const disposers = [];
  let context, mixer, analyser, bytes, decks, loadPromise;
  let slot = 0, active = null, revision = 0, repeat = true, paused = true, disposed = false;
  let intensity = 0, form = false, hero = 0, core = 0, lastBeat = -1, energyClock;
  let effectEpoch = 0, warming = false, warmed = false;
  const coreFigures = [
    null, [0,7,12,7], [0,3,7,10,7], [0,-5,0,7], [12,7,3,0,7,3],
    [0,0,7,12,7], [0,7,14,12,7,14], [0,7,12,14,19,14,12]
  ];
  const heroVoices = [
    ['triangle',[0,7,12,7]], ['sawtooth',[0,0,7,3]], ['sine',[12,7,14,19]],
    ['square',[-12,0,7,0]], ['triangle',[0,12,7,19,12,7]]
  ];
  function clamp(v, max = 1) { return Math.min(max, Math.max(0, Number(v) || 0)); }
  function connect() {
    if (disposed) throw new Error('Audio transport disposed');
    if (context) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio unavailable');
    context = new AC();
    mixer = Object.fromEntries(roles.map(role => [role, context.createGain()]));
    for (const role of roles) mixer[role].gain.value = levels[role];
    mixer.music.connect(mixer.master); mixer.effects.connect(mixer.master);
    analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .78;
    mixer.master.connect(analyser); analyser.connect(context.destination); bytes = new Uint8Array(analyser.frequencyBinCount);
    decks = [0, 1].map(() => {
      const el = new Audio(); el.preload = 'none';
      const node = context.createMediaElementSource(el);
      const gain = context.createGain(); gain.gain.value = 0;
      node.connect(gain); gain.connect(mixer.music);
      return {el, gain, cleanup: 0};
    });
    energyClock = setInterval(energyBeat, 42);
  }
  function unlock() {
    connect();
    if (context.state !== 'running') context.resume().catch(() => {});
  }
  function ramp(node, value, seconds = .025) {
    const now = context.currentTime;
    if (node.cancelAndHoldAtTime) node.cancelAndHoldAtTime(now);
    else { const old=node.value; node.cancelScheduledValues(now); node.setValueAtTime(old,now); }
    node.linearRampToValueAtTime(value, now + seconds);
  }
  async function index(name) {
    const response = await fetch(new URL(name,base));
    if (!response.ok) throw new Error('Audio catalog '+response.status);
    return response.json();
  }
  function load() {
    if (!loadPromise) loadPromise=Promise.all([index('soundtrack.json'),index('sound-effects.json')])
      .then(([m,e])=>{list.music=m;list.effects=e;return list;})
      .catch(e=>{loadPromise=undefined;throw e;});
    return loadPromise;
  }
  function release(deck) {
    clearTimeout(deck.cleanup); deck.el.pause(); deck.el.removeAttribute('src'); deck.el.load();
    deck.gain.gain.cancelScheduledValues(context.currentTime); deck.gain.gain.value=0;
  }
  async function transport(id, effect, options = {}) {
    unlock();
    const token=++revision;
    if (!list.music.length) await load();
    if (token!==revision || disposed) return;
    const key=effect?String(id):String(id).padStart(2,'0');
    const entry=(effect?list.effects:list.music).find(item=>item.id===key);
    if (!entry) throw new RangeError('Unknown audio ID: '+key);
    repeat=options.loop??(!effect && Boolean(entry.loop));
    if (active===entry && !paused && !decks[slot].el.ended && !options.restart) {
      decks[slot].el.loop=repeat; return;
    }
    const previous=decks[slot], nextSlot=1-slot, next=decks[nextSlot];
    release(next); next.token=token;
    next.el.src=new URL(entry.file, location.origin).href;next.el.loop=repeat;
    try { await next.el.play(); }
    catch(error) { if (token===revision) throw error;return; }
    if(token!==revision || disposed) {if(next.token===token&&!disposed)release(next);return;}
    const fade=effect||options.immediate ? .012 : .22;
    clearTimeout(previous.cleanup);
    ramp(previous.gain.gain,0,fade);
    previous.cleanup=setTimeout(()=>release(previous),fade*1000+35);
    ramp(next.gain.gain,1,fade);slot=nextSlot;active=entry;paused=false;lastBeat=-1;
    if(!effect&&['campaign','boss','special'].includes(entry.category))void warmCommonEffects();
  }
  async function buffer(entry) {
    if (buffers.has(entry.id)) {
      const value=buffers.get(entry.id);buffers.delete(entry.id);buffers.set(entry.id,value);return value;
    }
    if (!pending.has(entry.id)) {
      const request=fetch(new URL(entry.file,location.origin)).then(r=>{
        if(!r.ok)throw new Error('Effect '+r.status);return r.arrayBuffer();
      }).then(raw=>context.decodeAudioData(raw)).then(value=>{
        if(!disposed){buffers.set(entry.id,value);if(buffers.size>32)buffers.delete(buffers.keys().next().value);}
        return value;
      }).finally(()=>pending.delete(entry.id));
      pending.set(entry.id,request);
    }
    return pending.get(entry.id);
  }
  // Warm only common first-use sounds at the start of a playable scene.
  async function warmCommonEffects() {
    if(warmed||warming)return;
    warming=true;
    try {
      for(const id of ['jump','ring','hit','dash-release','spring','checkpoint','land']) {
        if(disposed||document.hidden)return;
        const entry=list.effects.find(item=>item.id===id);
        if(entry)await buffer(entry);
      }
      warmed=true;
    }catch{/* Lazy event playback can retry after a transient network failure. */}
    finally{warming=false;}
  }
  async function sfx(id) {
    if(disposed||document.hidden)return;
    unlock();const epoch=effectEpoch;
    if (!list.effects.length) await load();
    const entry=list.effects.find(x=>x.id===id);if(!entry)throw new RangeError('Unknown effect: '+id);
    const sound=await buffer(entry);
    if(disposed||epoch!==effectEpoch||document.hidden||context.state!=='running') return;
    if(voices.size>=10){const first=voices.values().next().value;first.stop();voices.delete(first);}
    const source=context.createBufferSource();source.buffer=sound;
    source.connect(mixer.effects);voices.add(source);
    source.onended=()=>{voices.delete(source);source.disconnect();};source.start();
  }
  // Sparse score-synchronous accents add new harmonics to the *current* cue.
  // No background copy of the soundtrack, and no such accents in the Sound Effects Lab.
  function energyBeat(){
    if(paused||document.hidden||!active?.bpm||(!form&&!core&&!intensity)||context.state!=='running')return;
    const time=decks[slot].el.currentTime, beat=Math.floor(time*active.bpm/60*2);
    if(beat===lastBeat)return;
    lastBeat=beat;
    if(!form&&intensity<.5&&beat%4)return;
    if(!form&&intensity>=.5&&beat%2)return;
    const notes={'C':0,'C♯':1,'D':2,'E♭':3,'E':4,'F':5,'F♯':6,'G':7,'A♭':8,'A':9,'B♭':10,'B':11};
    const key=notes[active.key.split(' ')[0]]??0;
    const pattern=form?heroVoices[hero][1]:core?coreFigures[core]:[0,0,7,0];
    const root=48+key+pattern[(beat+core)%pattern.length];
    const osc=context.createOscillator(),env=context.createGain(),now=context.currentTime;
    osc.type=form?heroVoices[hero][0]:core%3===2?'triangle':'sine';osc.frequency.value=440*2**((root-69)/12);
    env.gain.setValueAtTime(.0001,now);env.gain.exponentialRampToValueAtTime(.013+intensity*.026+(form ? .018 : 0),now+.008);
    env.gain.exponentialRampToValueAtTime(.0001,now+.18);
    osc.connect(env);env.connect(mixer.music);osc.onended=()=>{osc.disconnect();env.disconnect();};osc.start(now);osc.stop(now+.19);
  }
  function pause() {
    revision++;effectEpoch++;paused=true;
    if(!decks)return;
    decks.forEach(d=>d.el.pause());for(const source of voices)source.stop();
  }
  function stop() {
    pause();if(decks){for(const deck of decks)release(deck);}active=null;lastBeat=-1;
  }
  function onHidden(){if(document.hidden)pause();}
  document.addEventListener('visibilitychange',onHidden);disposers.push(()=>document.removeEventListener('visibilitychange',onHidden));
  const api={
    load,get music(){return list.music;},get effects(){return list.effects;},
    play:(id,opts)=>transport(id,false,opts), previewEffect:(id,opts={})=>transport(id,true,{restart:true,...opts}),sfx,pause,stop,
    async resume(){if(!active)return;unlock();const token=++revision;await decks[slot].el.play();if(token===revision)paused=false;},
    seek(seconds){if(active&&decks[slot].el.readyState){decks[slot].el.currentTime=clamp(seconds,active.duration);lastBeat=-1;}},
    setRepeat(value){repeat=Boolean(value);if(decks)decks[slot].el.loop=repeat;},
    setVolume(master,music=levels.music,effects=levels.effects){[master,music,effects].forEach((v,i)=>{
      levels[roles[i]]=clamp(v);if(mixer)ramp(mixer[roles[i]].gain,levels[roles[i]]);});},
    setIntensity(value){intensity=clamp(value);},transform(value,character=0){form=Boolean(value);hero=Math.round(clamp(character,4));},special(value){core=Math.round(clamp(value,7));},
    bands(){if(!analyser||paused)return [0,0,0];analyser.getByteFrequencyData(bytes);
      return [[0,3],[3,17],[17,90]].map(([a,b])=>{let sum=0;for(let i=a;i<b;i++)sum+=bytes[i];return sum/((b-a)*255);});},
    state(){const el=decks?.[slot].el;return {id:active?.id??null,time:el?.currentTime??0,
      duration:active?.duration??0,paused:paused||!el||el.paused||el.ended,volume:levels.master,repeat};},
    dispose(){if(disposed)return;stop();disposed=true;disposers.forEach(f=>f());clearInterval(energyClock);buffers.clear();context?.close().catch(()=>{});}
  };
  return api;
}
