import './style.css';
import './ecosystem/style.css';
import { bindHomePreferences } from './home-preferences.js';
import { createDeviceMotionAccess } from './device-motion-access.js';
import { copyInstagramUsername } from './instagram.js';
import { mountDeviceShake } from './device-shake.js';
import { setLogoNegative } from './logo-polarity.js';
import { mountDeviceTilt } from './device-tilt.js';
import { bindFrequencyDoor } from './frequency-door.js';
import { localePath, names, portalPath, resolveLocale } from './locales.js';
import { money, updateMetadata } from './site.js';
import { bindInquiry } from './inquiry.js';
import { approximateCountry, storageValue } from './geo.js';
import { trackAccents } from './palette.js';
import { createAudioEngine } from './audio.js';
import { enterFromFooter } from './unseen-door.js';

const configNode = document.getElementById('site-config');
if (configNode) initialize(JSON.parse(configNode.textContent));

function initialize({ lang, available, enabledTracks, geoEndpoint, contactEndpoint, initial }) {
  const q = selector => document.querySelector(selector);
  const base = import.meta.env.BASE_URL;
  const audio = createAudioEngine({
    enabledTracks,
    onMediaAction(action) {
      audioInteracted = true;
      persistSilence(action === 'pause' || mute);
    },
  });
  const sceneContainer = q('#logo-scene');
  const sceneHome = sceneContainer.parentNode;
  const languageControl = q('.languages');
  const trigger = q('#sound-toggle');
  const localeKey = 'visionoir-language';
  const silentKey = 'visionoir-silent';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const html = document.documentElement;
  let dictionary = initial;
  let manualRevision = 0;
  let navigationRevision = 0;
  let scene;
  let sculpture;
  let trail;
  let mute = storageValue(silentKey)==='1';
  let volume = 23;
  let motion = storageValue('visionoir-motion') !== 'off' && !reduced.matches;
  let audioError = null;
  let immersive = false;
  let inquiry;
  const countryLookup = new AbortController();
  let idleTimer;
  const t = key => dictionary[key] || q(`[data-text="${key}"]`)?.textContent || '';
  q('#copy-instagram').onclick = async () => {
    const status = q('#instagram-status');
    const message = await copyInstagramUsername(q('#instagram-username'));
    status.dataset.text = message;
    status.textContent = t(message);
  };
  const preferences = bindHomePreferences({t,onErase() {
    manualRevision++;
    countryLookup.abort();
  }});
  const langOfPath = () => {
    const path = location.pathname.slice(base.length).replace(/(?:index\.html)?\/?$/,'');
    return available.find(code => code.toLowerCase()===path);
  };
  const catalogues = new Map([[lang,Promise.resolve(initial)]]);
  function load(lang) {
    if (!catalogues.has(lang)) {
      catalogues.set(lang,fetch(`${base}locales/${lang}.json`).then(response => {
        if (!response.ok) throw Error('Missing catalogue');
        return response.json();
      }).catch(error => {catalogues.delete(lang);throw error;}));
    }
    return catalogues.get(lang);
  }
  function setStatus(key) {
    clearTimeout(idleTimer);
    const status = q('#status');
    status.textContent = t(key);
    idleTimer = setTimeout(()=>{status.textContent='';},4500);
  }
  const setText = (selector,key) => { q(selector).textContent = t(key); };
  const tiltButton = q('#device-tilt-enable');
  const access = createDeviceMotionAccess(window, updateTiltControl);
  const tilt = mountDeviceTilt(() => access.observed('orientation'));
  mountDeviceShake({
    onReading: () => access.observed('motion'),
    onToggle: () => setLogoNegative(!html.classList.contains('logo-negative')),
  });
  function updateTiltControl() {
    const state = access.state;
    tiltButton.parentElement.hidden = !['ask','waiting','unavailable'].includes(state);
    tiltButton.setAttribute('aria-busy', String(state === 'waiting'));
    q('#device-tilt-status').textContent = state === 'unavailable' ? t('tiltUnavailable') : '';
  }
  // These are existing visual interactions. Other navigation and audio controls
  // never prompt. A declined request can be retried deliberately in preferences.
  for (const target of document.querySelectorAll('[data-motion-permission]')) {
    target.addEventListener('click', event => {
      if (event.isTrusted) void access.request(target === tiltButton);
    });
  }
  function syncControls() {
    tilt.setEnabled(motion);
    updateTiltControl();
    if (Object.keys(dictionary).length) {
      setText('#sound-state',audio.isLoading?'loading':audio.isPlaying?'pause':'sound');
      setText('#mute',mute?'unmute':'mute');
      setText('#motion-toggle',motion?'motionOff':'motionOn');
    }
    trigger.setAttribute('aria-pressed',String(audio.isPlaying));
    q('#mute').setAttribute('aria-pressed',String(mute));
    q('#motion-toggle').setAttribute('aria-pressed',String(!motion));
    q('.sound-icon').textContent = audio.isPlaying ? 'Ⅱ' : '▷';
    q('#volume').value = volume;
    const mode = audio.currentTrack.id;
    q('#track-select').value = mode;
    document.body.dataset.mode = mode;
    for (const button of document.querySelectorAll('[data-track]')) {
      button.setAttribute('aria-pressed',String(button.dataset.track===mode));
    }
    html.style.setProperty('--track-accent',trackAccents[mode]);
    sculpture?.setMotion(motion);
    scene?.setMode(mode);
    scene?.setMotion(motion);
    scene?.setAudioEnabled?.(!mute && audio.isPlaying);
    html.classList.toggle('reduced-motion',!motion);
    trail?.setEnabled(motion && !reduced.matches);
  }
  function applyLanguage(next, dict, explicit) {
    lang = next;
    dictionary = dict;
    updateMetadata(lang,dict,explicit);
    document.querySelectorAll('[data-portal]').forEach(link=>link.href=portalPath(link.dataset.portal,lang,base));
    for (const node of document.querySelectorAll('[data-text]')) node.textContent=dict[node.dataset.text];
    for (const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label',dict[node.dataset.label]);
    for (const node of document.querySelectorAll('[data-alt]')) node.alt=dict[node.dataset.alt];
    for (const node of document.querySelectorAll('[data-price]')) node.textContent=money(lang,+node.dataset.price);
    q('#language-name').textContent=names[lang];
    q('#language-name').lang=lang;
    for (const link of languageControl.querySelectorAll('[data-locale]')) {
      if (link.dataset.locale===lang) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    }
    for (const error of document.querySelectorAll('.error[data-error]')) error.textContent=t(error.dataset.error);
    inquiry?.refresh();
    preferences.refresh();
    syncControls();
  }
  async function changeLanguage(next,{manual=false}={}) {
    if (manual) manualRevision++;
    const request = ++navigationRevision;
    try {
      const dict = await load(next);
      if (request !== navigationRevision) return;
      if (manual) {
        storageValue(localeKey,next);
        const url = new URL(location.href);
        url.pathname = base.replace(/\/$/,'')+localePath(next);
        if (url.href!==location.href) history.pushState(null,'',url);
        languageControl.open=false;
        languageControl.querySelector('summary').focus({preventScroll:true});
      }
      applyLanguage(next,dict,Boolean(langOfPath()));
    } catch { if(request===navigationRevision) setStatus('languageError'); }
  }
  languageControl.addEventListener('click',event=>{
    const link = event.target.closest('[data-locale]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void changeLanguage(link.dataset.locale,{manual:true});
  });
  window.addEventListener('popstate',()=>{
    void changeLanguage(resolveLocale({explicit:langOfPath(),saved:storageValue(localeKey),languages:navigator.languages,available}));
  });
  document.addEventListener('click',event=>{
    if (languageControl.open && !languageControl.contains(event.target)) languageControl.open=false;
  });

  const menu = q('#menu-toggle');
  function setMenu(open) {
    menu.setAttribute('aria-expanded',String(open));
    q('.topbar').classList.toggle('open',open);
  }
  menu.onclick = () => setMenu(menu.getAttribute('aria-expanded')!=='true');
  q('#navigation').addEventListener('click',()=>setMenu(false));

  let returningSound = false;
  bindFrequencyDoor(sceneContainer,{onOpen(){
    returningSound=audio.isPlaying;
    html.classList.add('entering-frequency');
    const duration=motion?300:0;
    const start=performance.now(), previous=mute?0:volume/100;
    function enter(){
      const progress=duration?Math.min(1,(performance.now()-start)/duration):1;
      audio.setVolume(previous*(1-progress));
      if(progress<1)requestAnimationFrame(enter);
      else {audio.pause();location.assign(base+'frequency/?lang='+encodeURIComponent(lang));}
    }
    enter();
  }});
  const door = q('#unseen-door');
  door.addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (html.classList.contains('entering-unseen')) return;
    returningSound = audio.isPlaying;
    audio.pause();
    scene?.setMotion(false);
    html.classList.add('entering-unseen');
    setTimeout(() => enterFromFooter(base + 'unseen/?lang=' + encodeURIComponent(lang)), motion ? 190 : 0);
  });
  window.addEventListener('pageshow', event => {
    html.classList.remove('entering-unseen','entering-frequency');
    audio.setVolume(mute?0:volume/100);
    scene?.setMotion(motion);
    if(event.persisted && returningSound && !mute)void audio.selectTrack(audio.currentTrack.id,{automatic:true});
    returningSound=false;
  });
  let audioInteracted = false;
  function persistSilence(value) { storageValue(silentKey,value?'1':'0'); }
  audio.setVolume(mute ? 0 : volume/100);
  trigger.onclick = () => {
    audioInteracted = true;
    if (audio.isPlaying || audio.isLoading) { persistSilence(true); audio.pause(); }
    else {
      mute=false;
      persistSilence(false);
      audio.setVolume(volume/100);
      void audio.selectTrack(audio.currentTrack.id);
    }
  };
  q('#mute').onclick=()=>{
    audioInteracted=true;
    mute=!mute;
    persistSilence(mute);
    audio.setVolume(mute?0:volume/100);
    syncControls();
  };
  q('#volume').oninput=event=>{
    volume=+event.target.value;
    audio.setVolume(mute?0:volume/100);
  };
  function selectTrack(id) {
    audioInteracted = true;
    if (!mute) persistSilence(false);
    void audio.selectTrack(id,{play:!mute || audio.isPlaying});
  }
  q('#track-select').onchange=event=>selectTrack(event.target.value);
  document.querySelectorAll('[data-track]').forEach(button=>button.onclick=()=>selectTrack(button.dataset.track));
  window.addEventListener('visionoir:audio',event=>{
    syncControls();
    audioError = event.detail.error;
    if (audioError) setStatus(audioError);
  });
  q('#motion-toggle').onclick=()=>{
    motion=!motion;
    storageValue('visionoir-motion',motion?'on':'off');
    syncControls();
  };
  reduced.addEventListener?.('change',event=>{
    motion=!event.matches && storageValue('visionoir-motion')!=='off';
    syncControls();
  });

  const immersiveView = q('#immersive-view');
  function setImmersive(open) {
    immersive = open;
    html.classList.toggle('immersive',open);
    immersiveView.hidden=!open;
    if (open) immersiveView.prepend(sceneContainer);
    else sceneHome.append(sceneContainer);
    for (const area of document.querySelectorAll('.topbar,main,.footer')) area.inert=open;
    q(open?'#exit-immersive':'#immersive').focus({preventScroll:true});
  }
  q('#immersive').onclick=()=>setImmersive(true);
  q('#exit-immersive').onclick=()=>setImmersive(false);
  document.addEventListener('keydown',event=>{
    if (event.key!=='Escape') return;
    if (languageControl.open) {
      languageControl.open=false;
      languageControl.querySelector('summary').focus();
    } else if (menu.getAttribute('aria-expanded')==='true') {
      setMenu(false);
      menu.focus();
    } else if (immersive) setImmersive(false);
  });

  inquiry=bindInquiry({endpoint:contactEndpoint,getLocale:()=>lang,t,base});

  let loadingTrail = false;
  function startTrail(event) {
    if (loadingTrail || !motion || reduced.matches || (event.type==='pointermove' && event.pointerType==='touch')) return;
    loadingTrail=true;
    import('./trail.js').then(({mountTrail})=>{
      trail=mountTrail();
      trail.setEnabled(motion && !reduced.matches);
      trail.start?.(event);
      window.removeEventListener('pointermove',startTrail);
      window.removeEventListener('touchstart',startTrail);
    }).catch(()=>{loadingTrail=false;});
  }
  window.addEventListener('pointermove',startTrail,{passive:true});
  window.addEventListener('touchstart',startTrail,{passive:true});
  html.classList.add('enhanced');
  q('#geo-disclosure').hidden=!geoEndpoint;
  syncControls();
  const startRevision = navigationRevision;
  const explicit = langOfPath();
  const saved = storageValue(localeKey);
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  void (async()=>{
    const country = explicit || saved ? null : await approximateCountry(geoEndpoint,420,countryLookup.signal);
    if (manualRevision || navigationRevision !== startRevision) return;
    const next = resolveLocale({explicit,saved,country,languages,available});
    if (next!==lang) await changeLanguage(next);
  })();
  const creatorStage=q('#creator-stage');
  const mountSculpture=()=>import('./creator/index.js').then(({mountCreator})=>{
    sculpture=mountCreator(creatorStage,{getSignal:()=>audio.getData(),isPlaying:()=>audio.isPlaying,getMode:()=>audio.currentTrack.id,reducedMotion:!motion});
    const controls=q('.creator-looks');
    controls.hidden=false;
    controls.addEventListener('click',event=>{
      const button=event.target.closest('[data-look]');
      if(!button)return;
      sculpture.setLook(button.dataset.look);
      for(const choice of controls.querySelectorAll('button'))choice.setAttribute('aria-pressed',String(choice===button));
    });
  }).catch(()=>{ /* The authored portrait is available as a local poster. */ });
  if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();void mountSculpture();}
    },{rootMargin:'180px'});
    observer.observe(creatorStage);
  } else void mountSculpture();
  const loadScene = () => import('./scene.js').then(async ({initScene})=>{
    scene = await initScene(sceneContainer,()=>audio.getData());
    syncControls();
  }).catch(()=>{});
  if ('requestIdleCallback' in window) requestIdleCallback(loadScene,{timeout:600});
  else setTimeout(loadScene,50);
  // Only one unprompted attempt. The same visible play button remains usable on rejection.
  if (!mute) setTimeout(()=>{
    if (!audioInteracted && !document.hidden) void audio.selectTrack(audio.currentTrack.id,{automatic:true});
  },0);
}
