import './style.css';
import { localePath, names, resolveLocale } from './locales.js';
import { money, updateMetadata, contact } from './site.js';
import { approximateCountry, storageValue } from './geo.js';
import { createAudioEngine } from './audio.js';

const configNode = document.getElementById('site-config');
if (configNode) initialize(JSON.parse(configNode.textContent));

function initialize({ lang, available, enabledTracks, geoEndpoint, initial }) {
  const q = selector => document.querySelector(selector);
  const base = import.meta.env.BASE_URL;
  const audio = createAudioEngine({enabledTracks});
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
  let mute = storageValue(silentKey)==='1';
  let volume = 23;
  let motion = storageValue('visionoir-motion') !== 'off' && !reduced.matches;
  let audioError = null;
  let immersive = false;
  let brief;
  let idleTimer;
  const t = key => dictionary[key] || q(`[data-text="${key}"]`)?.textContent || '';
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
    const status = q('#brief-dialog').open ? q('#brief-status') : q('#status');
    status.textContent = t(key);
    idleTimer = setTimeout(()=>{status.textContent='';},4500);
  }
  const setText = (selector,key) => { q(selector).textContent = t(key); };
  function syncControls() {
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
    scene?.setMode(mode==='afterimage'?'acid':mode);
    scene?.setMotion(motion);
    scene?.setAudioEnabled?.(!mute && audio.isPlaying);
    html.classList.toggle('reduced-motion',!motion);
  }
  function applyLanguage(next, dict, explicit) {
    lang = next;
    dictionary = dict;
    updateMetadata(lang,dict,explicit);
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
    if (brief) updateBrief();
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

  const form = q('#brief-form');
  const dialog = q('#brief-dialog');
  function showError(field,key) {
    const node = q('#error-'+field);
    node.textContent = key ? t(key) : '';
    if (key) node.dataset.error=key;
    else delete node.dataset.error;
    form.elements[field].setAttribute('aria-invalid',String(Boolean(key)));
  }
  for (const field of ['name','email','message']) {
    form.elements[field].addEventListener('input',()=>showError(field));
  }
  document.querySelectorAll('[data-service]').forEach(link=>link.addEventListener('click',()=>{
    form.elements.service.value=link.dataset.service;
  }));
  function updateBrief() {
    const service = t(brief.service ? brief.service+'Name' : 'undecided');
    const text = [t('briefTitle'),'',
      `${t('name')}: ${brief.name}`,`${t('email')}: ${brief.email}`,`${t('service')}: ${service}`,'',
      t('message'),brief.message].join('\n');
    q('#brief-text').textContent = text;
    q('#send-brief').href = `mailto:${contact}?subject=${encodeURIComponent(t('briefTitle')+' — '+service)}&body=${encodeURIComponent(text)}`;
    return text;
  }
  form.onsubmit = event=>{
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    for (const field of ['name','email','message']) data[field]=data[field].trim();
    const errors = {
      name:data.name?'':'invalidName',
      email:data.email && form.elements.email.validity.valid?'':'invalidEmail',
      message:data.message.length>=10?'':'invalidMessage',
    };
    for (const [field,key] of Object.entries(errors)) showError(field,key);
    const first = Object.keys(errors).find(field=>errors[field]);
    if (first) { form.elements[first].focus(); return; }
    brief=data;
    updateBrief();
    q('#brief-status').textContent='';
    dialog.showModal();
  };
  q('#close-brief').onclick=()=>dialog.close();
  q('#copy-brief').onclick=async()=>{
    try { await navigator.clipboard.writeText(updateBrief()); setStatus('copied'); }
    catch { setStatus('copyError'); }
  };
  q('#download-brief').onclick=()=>{
    const url = URL.createObjectURL(new Blob([updateBrief()],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a');
    link.href=url;
    link.download='VISIONOIR-brief.txt';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  html.classList.add('enhanced');
  q('#geo-disclosure').hidden=!geoEndpoint;
  syncControls();
  const startRevision = navigationRevision;
  const explicit = langOfPath();
  const saved = storageValue(localeKey);
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  void (async()=>{
    const country = explicit || saved ? null : await approximateCountry(geoEndpoint);
    if (manualRevision || navigationRevision !== startRevision) return;
    const next = resolveLocale({explicit,saved,country,languages,available});
    if (next!==lang) await changeLanguage(next);
  })();
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
