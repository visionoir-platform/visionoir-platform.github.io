import { createOutputRoute } from './audio-output.js';
import { createSpectrumMeter } from './visual-spectrum.js';
import {assignKey, bindPerformanceKeys, controlsForm, defaultControls, keysHelp, persistControls, readControls, scales as interfaceScales} from './performance-keys.js';
import {validateAutomation} from './audio/automation.js';
import {createAutomationEditor} from './automation-editor.js';
import { bindEditorDrags, changeChord, planQuantization, relocateNotes, scales, scaleNames } from './piano.js';
import { createRegionEditor } from './region-editor.js';
import { createMidiNotes, bindMidiInputs } from './midi-notes.js';
import { createMidiClock } from './midi-clock.js';
import { generateSession, genres } from './composer.js';
import * as audio from './audio/index.js';
import { exportBasename, musicTags } from './audio/metadata.js';
import { translator, names, direction, getInitialLocale } from './i18n.js';
import { save, restore, library, loadNamed, removeSaved, previousProject, eraseEvent } from './storage.js';
import {
  escape as h,
  attr,
  pad,
  noteName,
  option,
  act,
  number,
  slider,
  select,
  download,
  newNote,
  resizePattern,
  seededVariation,
} from './ui-kit.js';
import { renderEditor, masterPanel } from './views.js';

import { visualSlotForChannel, collectVisualLevels } from './chromatic/channel-routing.js';

export async function startStudio() {
  let lang = getInitialLocale(),
    t = await translator(lang);
  const controls = readControls();
  function applyScale() { document.documentElement.style.fontSize = controls.size + '%'; }
  function uiPreferences() {
    open('ui-preferences',t('interfaceTitle'),controlsForm(controls,t));
  }
  applyScale();
  const el = (id) => document.getElementById(id);
  const s = {
    p: audio.createProject('forge'),
    view: 'sequencer',
    channel: 0,
    scene: 0,
    playScene: 0,
    bank: 0,
    bankSize: 8,
    page: 0,
    octave: 3,
    step: 0,
    selected: new Set(),
    multi: false,
    protect: false,
  };
  let storageAvailable = true, erasedSession = false, erasing = false;
  try {
    const previous = await restore(audio.validateProject);
    if (previous) s.p = previous;
    else s.scene = 3;
  } catch {
    storageAvailable = false;
  }
  const savedScene = s.p.workspace?.scene;
  if (Number.isInteger(savedScene) && s.p.scenes[savedScene]) s.scene = savedScene;
  let engine,
    visual,
    playing = false,
    starting = false,
    tick = { step: 0, scene: 0, bar: 0, levels: [], peaks: [] },
    recorder,
    recUnclosed = false;
  let undo = [],
    redo = [],
    clipboard,
    notesClipboard,
    taps = [],
    saveTimer,
    midi,
    learn = false,
    motion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let languageRequest = 0;
  let activeDialog,
    dialogTrigger,
    renderTask,
    restoreVolume = 0.85,
    audioState = 'audioOff',
    pendingMidi,
    exportController;
  const $ = (q) => document.querySelector(q);
  const track = () => s.p.tracks[s.channel];
  const pattern = () => s.p.scenes[s.scene].patterns[s.channel];
  const event = () => pattern().steps[s.step];
  let noticeTimer;
  const off = () => !(recorder && recorder.state === 'recording');
  const engineReady = async () => {
    if (!engine.context || engine.context.state !== 'running' || engine.mode === 'failed') await engine.prepare(s.p);
    return engine;
  };
  const outputRoute = createOutputRoute({
    devices: navigator.mediaDevices, getContext: () => engine.context,
    prepare: engineReady, apply: id => engine.setOutput(id),
    changed() {
      const value = document.querySelector('[data-current-output]');
      if (value) value.textContent = outputLabel();
    },
  });
  function outputLabel() {
    const state = outputRoute.status();
    return state.label || t(state.key);
  }
  function canChooseOutput() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    return !!(navigator.mediaDevices?.selectAudioOutput && Audio?.prototype.setSinkId);
  }
  const midiNotes = createMidiNotes({
    ready: engineReady,
    noteOn(track, pitch, velocity, token) {
      engine.noteOn(track, pitch, velocity, token);
      const slot = visualSlotForChannel(s.p.tracks, track);
      if (slot !== undefined) visual?.trigger(slot, velocity);
    },
    noteOff: (track, pitch, token) => engine.release(track, pitch, token),
    onError: fail,
  });
  let midiPorts, clockInput;
  const sceneName = (i) => s.p.scenes[i]?.name || '';
  function say(message) {
    if (el('notice')) {
      el('notice').textContent = message;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        el('notice').textContent = '';
      }, 4500);
    }
  }
  function fail(err) {
    console.warn('[FREQUENCY]', err?.name || 'Operation');
    const key = err?.message === 'audio.outputDenied' ? 'outputDenied' :
      err?.message === 'audio.outputFailed' ? 'outputFailed' :
      err?.message === 'audio.processorError' ? 'audioRetry' : err?.message === 'storage.exportInUse' ? 'eraseBlocked' :
      err?.message?.startsWith('project.') || err?.name === 'SyntaxError'
        ? 'badProject'
        : err?.name === 'NotAllowedError'
          ? 'midiPermission'
          : err?.name === 'QuotaExceededError'
            ? 'storageHelp'
            : err?.name === 'RangeError' || err?.message?.includes('storageRequired')
              ? 'maxSize'
              : err?.name === 'EncodingError' || err?.message?.startsWith('sample.')
                ? 'fileError'
                : 'error';
    say(t(key));
    if (el('panel')?.open) {
      const out = el('panel').querySelector('[role=status]') || document.createElement('p');
      out.setAttribute('role', 'status');
      out.textContent = t(key);
      if (!out.isConnected) el('panel').querySelector('.dialog-inner').append(out);
    }
  }
  function guardLive() {
    if (s.protect || !off()) {
      say(t('safeMode'));
      return false;
    }
    return true;
  }
  function pageAttrs() {
    document.documentElement.lang = lang;
    document.documentElement.dir = direction(lang);
    document.documentElement.dataset.motion = motion ? 'reduce' : 'full';
    const u = new URL(location.href);
    u.searchParams.set('lang', lang);
    history.replaceState(null, '', u);
  }
  function localeSelect() {
    return select(
      t('language'),
      'lang',
      Object.entries(names)
        .map(([id, name]) => option(id, name, id === lang))
        .join(''),
    );
  }
  const href = (path) => path + '?lang=' + encodeURIComponent(lang);
  function shell() {
    el('studio').innerHTML =
      `<div class="case"><header class="topbar"><a class="brand" href="/${encodeURIComponent(lang.toLowerCase())}/"><img src="/assets/logo.svg" alt="">VISIONOIR</a><span class="unit-name">FREQUENCY</span><div class="topright">${act('about', t('about'))} <a href="${href('/support/')}">${h(t('support'))} ↗</a></div></header><div class="console-title"><div><h1 dir="ltr">FREQUENCY<span>.</span></h1><p>DESIGN THE SOUND OF THE UNSEEN.</p><small class="byline" dir="ltr" lang="en">Created, designed and developed by Flavio Giorgio Guarini.</small></div><div class="session-id"><span class="status-led"></span><span id="state"></span><strong id="clock" dir="ltr">001.01.01</strong></div></div><div class="transport" id="transport"></div><nav class="tabs" aria-label="${attr(t('tools'))}" id="tabs"></nav><div class="deck"><section class="editor" id="editor"></section><aside class="right-rack"><div id="chromatic"></div><section class="master-screen"><header><strong>MASTER</strong>${select(t('output'), 'analyser', ['fft', 'scope', 'history'].map((k) => option(k, t(k), k === (s.analyser || 'fft'))).join(''))}<output id="db" aria-live="off">−∞ dBFS</output></header><canvas id="scope" width="320" height="82" aria-label="Master"></canvas><div class="readings" aria-live="off"><span>L/R <output id="rms" aria-live="off">−∞</output></span><span>φ <output id="corr" aria-live="off">—</output></span><span id="clip-light" role="meter" aria-label="CLIP" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0">CLIP</span></div></section></aside></div><footer><span>VISIONOIR: FREQUENCY</span><p>Created, designed and developed by Flavio Giorgio Guarini.</p><a href="${href('/legal/')}">© VISIONOIR</a></footer><div id="notice" role="status" aria-live="polite"></div></div><dialog id="panel"></dialog><input type="file" id="project-file" hidden accept=".vfreq,.json,application/json">`;
    updateTransport();
    renderTabs();
    editor();
    setState();
  }
  function setState() {
    el('state').textContent = t(playing ? 'playing' : audioState);
    document.documentElement.dataset.play = playing ? 'on' : 'off';
  }
  function updateTransport() {
    const p = s.p;
    el('transport').innerHTML =
      `<div class="transport-group">${act('play', t('play'), { icon: '▶', classes: 'play', pressed: playing })}${act('stop', t('stop'), { icon: '■' })}${act('record', t(off() ? 'record' : 'recordEnd'), { icon: '●', classes: 'record', pressed: !off() })}</div><div class="transport-group clockfields">${number('BPM', 'bpm', p.bpm, 40, 300, 0.1)}${act('tap', 'TAP', { title: 'Tap tempo' })} ${act('metro', '♩', { title: t('metronome'), pressed: !!p.metronome })}${number('Swing %', 'swing', Math.round(p.swing * 100), 0, 50)}</div><div class="transport-group filebar">${act('library', t('library'), { icon: '▤' })}${act('save', t('save'))}${act('export', t('export'), { icon: '↗' })}${act('settings', '⚙', { title: t('settings') })}</div><div class="transport-group safety">${act('panic', 'PANIC', { classes: 'panic', title: 'Panic / ' + t('stop') })}</div>`;
  }
  function renderTabs() {
    el('tabs').innerHTML =
      ['sequencer', 'piano', 'arrangement', 'mixer', 'live']
        .map((id) =>
          act('tab', t(id === 'live' ? 'performance' : id), {
            data: 'data-tab="' + id + '"',
            pressed: id === s.view,
          }),
        )
        .join('') +
      `<div class="history">${act('undo', '↶', { title: t('undo'), disabled: !undo.length })}${act('redo', '↷', { title: t('redo'), disabled: !redo.length })}</div>`;
  }
  function focusSelector(node) {
    if (!node?.dataset) return '';
    return Object.entries(node.dataset)
      .filter(([key]) => ['action', 'field', 'index', 'id', 'pos', 'note', 'channel', 'tab'].includes(key))
      .map(([key, value]) => '[data-' + key + '="' + CSS.escape(value) + '"]')
      .join('');
  }
  function editor() {
    const root = el('editor');
    const selector = root.contains(document.activeElement) && focusSelector(document.activeElement);
    const scroll = [...root.querySelectorAll('.scroll-zone')].map((z) => z.scrollLeft);
    root.innerHTML = renderEditor(s, t, audio);
    drawTick();
    root.querySelectorAll('.scroll-zone').forEach((z, i) => {
      if (scroll[i]) z.scrollLeft = scroll[i];
    });
    if (selector) root.querySelector(selector)?.focus({ preventScroll: true });
  }
  function snapshot() {
    // Embedded PCM can be several MB. It is immutable after import, so history
    // can share the payload while cloning each editable track, note and setting.
    const source = { ...s.p, tracks: s.p.tracks.map(({ sample, ...track }) => track) };
    const p = structuredClone(source);
    p.tracks.forEach((tr, i) => {
      if (s.p.tracks[i].sample) tr.sample = { ...s.p.tracks[i].sample };
    });
    return { p, scene: s.scene, channel: s.channel, page: s.page, step: s.step, selected: [...s.selected] };
  }
  function recall(v) {
    s.p = v.p;
    s.scene = v.scene;
    s.channel = v.channel;
    s.page = v.page;
    s.step = v.step;
    s.bank = Math.floor(s.channel / s.bankSize);
    s.selected = new Set(v.selected);
    visual?.setState(s.p.visual || {});
    changed();
    updateTransport();
  }
  function remember() {
    undo.push(snapshot());
    if (undo.length > 24) undo.shift();
    redo = [];
  }
  function saveSoon() {
    s.p.workspace = { ...s.p.workspace, scene: s.scene };
    if (!storageAvailable) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 550);
  }
  function flushSave() {
    if (!saveTimer || !storageAvailable) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    void save(s.p).catch(fail);
  }
  function changed({ draw = true } = {}) {
    if (playing || engine.analyser) engine.update(s.p);
    saveSoon();
    renderTabs();
    if (draw) editor();
  }
  function mutate(fn, draw = true) {
    remember();
    fn();
    changed({ draw });
  }
  function resetSelection() {
    s.scene = 0;
    s.channel = 0;
    s.step = 0;
    s.page = 0;
    s.bank = 0;
    s.selected.clear();
    s.playScene = 0;
  }
  function restoreSnapshot(p) {
    stop();
    s.p = p;
    resetSelection();
    const selected = p.workspace?.scene;
    if (Number.isInteger(selected) && p.scenes[selected]) s.scene = selected;
    visual?.setState(p.visual || {});
    changed();
    updateTransport();
    setState();
  }
  let commandCount = 0;
  function stop() {
    commandCount++;
    midiNotes.reset();
    engine.stop();
    playing = false;
    audioState = 'stopped';
    if (el('transport')) {
      updateTransport();
      setState();
    }
  }
  async function play(song = false) {
    if (starting) return;
    const command = ++commandCount;
    starting = true;
    try {
      await engine.play(s.p, { scene: s.scene, arrangement: song });
      if (command !== commandCount) return;
      playing = true;
      s.playScene = s.scene;
      updateTransport();
      setState();
    } catch (e) {
      fail(e);
    } finally {
      starting = false;
    }
  }
  async function audition(ch, pitch, velocity = 0.85, token) {
    await engineReady();
    if (token === undefined) engine.trigger(ch, pitch, velocity);
    else engine.noteOn(ch,pitch,velocity,token);
    const slot = visualSlotForChannel(s.p.tracks, ch);
    if (slot !== undefined) visual?.trigger(slot, velocity);
  }
  function noteBase(i = s.channel) {
    return ['kick', 'rumble', 'sub', 'industrial'].includes(s.p.tracks[i].instrument)
      ? 36
      : ['closed', 'open', 'ride', 'sampler'].includes(s.p.tracks[i].instrument)
        ? 60
        : 48;
  }
  const signal = { voices: new Float32Array(audio.INSTRUMENTS.length), level: 0, bass: 0, mid: 0, high: 0, beat: 0, bpm: s.p.bpm, scene: 0 };
  const wave = new Uint8Array(512);
  let meterSource, spectrum, spectralData = false;
  let lastSpectrum = -Infinity, lastAudioTick = -Infinity;
  const visibleScope = { element: null, visible: false };
  const scopeObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.target === visibleScope.element) visibleScope.visible = entry.isIntersecting;
    }
  });
  // The analyser is a monitor tap. Each visible subscriber shares one read per 70 ms.
  function readVisualSignal() {
    const analyser = engine.analyser;
    const now = performance.now();
    const audibleTail = now - lastAudioTick < 1000 && tick.masterPeak?.some(peak => peak > 0.0001);
    if (!analyser || engine.context?.state !== 'running' || !(playing || !off() || audibleTail)) {
      if (spectralData) spectrum.bins.fill(0);
      spectralData = false;
      signal.bass = signal.mid = signal.high = signal.level = 0;
      return signal;
    }
    if (meterSource !== analyser) {
      meterSource = analyser;
      spectrum = createSpectrumMeter(analyser);
      lastSpectrum = -Infinity;
    }
    if (now - lastSpectrum >= 70 || !spectralData) {
      spectrum.read(signal);
      spectralData = true;
      lastSpectrum = now;
    }
    if (!tick.masterRms?.length) signal.level = Math.max(signal.bass, signal.mid, signal.high);
    return signal;
  }
  const sceneTints = ['#c8e4ed','#bbcaff','#d5b6f4','#d6f68f','#ffb39f','#e8b68f','#a1e5cf','#d5dddf'];
  let shownScene, lastLight = -1;
  function setDeskLight() {
    const scene = playing ? tick.scene : s.scene;
    const desk = el('studio');
    if (scene !== shownScene) {
      desk.style.setProperty('--scene-light', sceneTints[scene % sceneTints.length] || sceneTints[0]);
      shownScene = scene;
    }
    const light = motion ? 0 : Math.min(7, Math.round((signal.level || 0)*16));
    if (light !== lastLight) {
      desk.style.setProperty('--lamp', String(.10 + .07*light));
      lastLight = light;
    }
  }
  const dBFS = value => value > 0 ? (20 * Math.log10(value)).toFixed(1) : '−∞';
  function showReading(id, text) {
    const output = el(id);
    if (output && output.textContent !== text) output.textContent = text;
  }
  function updateMasterReadings() {
    const peak = Math.max(0, ...(tick.masterPeak || tick.peaks || []));
    const rms = tick.masterRms || [0, 0];
    showReading('db', dBFS(peak) + ' dBFS');
    showReading('rms', dBFS(rms[0]) + ' / ' + dBFS(rms[1]));
    showReading('corr', Number.isFinite(tick.correlation) ? tick.correlation.toFixed(2) : '—');
    const lamp = el('clip-light');
    if (lamp) {
      const value = tick.clipped ? '1' : '0';
      if (lamp.getAttribute('aria-valuenow') !== value) {
        lamp.setAttribute('aria-valuenow', value);
        lamp.classList.toggle('clipping', !!tick.clipped);
      }
    }
  }
  function drawTick() {
    if (!el('clock')) return;
    updateMasterReadings();
    setDeskLight();
    const step = Math.max(0, tick.step || 0);
    el('clock').textContent =
      String((tick.bar || 0) + 1).padStart(3, '0') +
      '.' +
      pad(Math.floor((step % 16) / 4) + 1) +
      '.' +
      pad((step % 4) + 1);
    document.querySelectorAll('[data-beat].now').forEach((n) => n.classList.remove('now'));
    if (playing)
      document
        .querySelectorAll('[data-beat="' + (step % 16) + '"]')
        .forEach((n) => n.classList.add('now'));
    if (s.view === 'live') {
      for (const pad of el('editor').querySelectorAll('.scene-pad')) {
        const index = Number(pad.dataset.index);
        const queued = playing && Number.isInteger(tick.queuedScene) && tick.queuedScene === index;
        pad.classList.toggle('queued', queued);
        const active = playing ? tick.scene === index : s.scene === index;
        if (pad.getAttribute('aria-pressed') !== String(active)) pad.setAttribute('aria-pressed', String(active));
      }
    }
    document.querySelectorAll('meter[data-meter]').forEach((m) => {
      const [mode, id] = m.dataset.meter.split(':');
      m.value = (mode === 'peak' ? tick.peaks : mode === 'bus' ? tick.buses : tick.levels)?.[id] || 0;
    });
  }
  engine = audio.createEngine({
    onTick: (next) => {
      tick = next;
      lastAudioTick = performance.now();
      const rms = next.masterRms;
      if (rms?.length) signal.level = Math.min(1, Math.hypot(...rms) / Math.sqrt(rms.length));
      s.playScene = next.scene;
      if (next.ended && playing) {
        playing = false;
        audioState = 'stopped';
        updateTransport();
        setState();
      }
      collectVisualLevels(s.p.tracks, next.levels, signal.voices);
      signal.beat = Math.max(
        0,
        (next.absoluteStep ?? (next.bar || 0) * 16 + ((next.step || 0) % 16)) / 4,
      );
      signal.buses = next.buses || [];
      signal.bpm = s.p.bpm;
      signal.scene = next.scene;
      // Audio tick messages can continue when background window timers are throttled.
      if (document.hidden) visual?.sendOutputFrame();
      if (renderTask === undefined)
        renderTask = requestAnimationFrame(() => {
          renderTask = undefined;
          drawTick();
        });
    },
    onState: (state) => {
      outputRoute.observe();
      if (state === 'interrupted' || state === 'suspended') {
        audioState = 'stopped';
        say(t('audioOff'));
      }
    },
    onError(error) {
      if (error.message === 'audio.processorError') {
        commandCount++;
        playing = false;
        audioState = 'audioRetry';
        midiNotes.reset();
        lastAudioTick = -Infinity;
        signal.voices.fill(0);
        signal.level = signal.bass = signal.mid = signal.high = 0;
        signal.buses = [];
        tick = { ...tick, levels: [], peaks: [], buses: [], masterPeak: [0, 0], masterRms: [0, 0], clipped: false };
        updateTransport();
        setState();
        drawTick();
      }
      fail(error);
    },
  });
  function meter() {
    const canvas = el('scope'),
      an = engine.analyser;
    if (canvas !== visibleScope.element) {
      if (visibleScope.element) scopeObserver.unobserve(visibleScope.element);
      visibleScope.element = canvas;
      visibleScope.visible = false;
      if (canvas) scopeObserver.observe(canvas);
    }
    if (canvas && visibleScope.visible && !document.hidden) {
      readVisualSignal();
      const c = canvas.getContext('2d');
      if (s.analyser !== 'history') c.clearRect(0, 0, 320, 82);
      if (s.analyser === 'scope') {
        if (spectralData) an.getByteTimeDomainData(wave);
        else wave.fill(128);
        c.strokeStyle = '#cfee9a';
        c.beginPath();
        for (let i = 0; i < 320; i++) {
          const y = (wave[i] / 255) * 80;
          if (i) c.lineTo(i, y);
          else c.moveTo(i, y);
        }
        c.stroke();
      } else if (s.analyser === 'history') {
        c.drawImage(canvas, 1, 0, 319, 82, 0, 0, 319, 82);
        for (let i = 0; i < 82; i++) {
          const n = Math.round((spectrum?.bucket(81 - i, 82) || 0) * 255);
          c.fillStyle = 'rgb(' + Math.round(n * 0.77) + ',' + n + ',' + Math.round(n * 0.54) + ')';
          c.fillRect(319, i, 1, 1);
        }
      } else
        for (let i = 0; i < 60; i++) {
          const v = spectrum?.bucket(i, 60) || 0;
          c.fillStyle = i < 36 ? '#bcc7b8' : '#d5f490';
          c.fillRect(i * 5.4, 81 - v * 78, 3.4, Math.max(1, v * 78));
        }
      setDeskLight();
    }
    setTimeout(meter, document.hidden ? 700 : 70);
  }
  const automationEditor = createAutomationEditor({state:s,t:key=>t(key),open,mutate,field:targetField,say});
  const regionEditor = createRegionEditor({state:s, t:key=>t(key), audio, open, close, mutate, field:targetField, guardLive});
  function open(id, title, body) {
    const d = el('panel');
    if (!d.open) dialogTrigger = document.activeElement;
    const focused = d.open && activeDialog === id && d.contains(document.activeElement)
      ? focusSelector(document.activeElement) : '';
    activeDialog = id;
    d.innerHTML = `<div class="dialog-inner"><header><h2>${h(title)}</h2>${act('close', '×', { title: t('close') })}</header>${body}</div>`;
    if (!d.open) d.showModal();
    else if (focused) (d.querySelector(focused + ':not(:disabled)') || d.querySelector('button'))?.focus({preventScroll:true});
  }
  function close() {
    if (erasing) return;
    regionEditor.clear();
    if (el('panel').open) el('panel').close();
    activeDialog = undefined;
    const selector = focusSelector(dialogTrigger);
    const trigger = dialogTrigger?.isConnected ? dialogTrigger : selector && el('studio').querySelector(selector);
    if (trigger) trigger.focus({preventScroll:true});
  }
  function help() {
    open(
      'about',
      t('about'),
      `<p class="about-brand">FREQUENCY</p><p>The Underground Is Your Instrument.</p><ol><li>${h(t('guide1'))}</li><li>${h(t('guide2'))}</li><li>${h(t('guide3'))}</li></ol>${keysHelp(controls,t)}<p>Created, designed and developed by Flavio Giorgio Guarini.</p><a href="${href('/legal/')}">© VISIONOIR · MIT</a>`,
    );
  }
  async function projects() {
    const saved = await library().catch(() => []),
      p = s.p;
    open(
      'library',
      t('library'),
      `<label class="field wide"><span>${h(t('title'))}</span><input data-field="name" maxlength="160" value="${attr(p.name)}"></label><div class="bar-tools">${act('blank', t('newProject'), { icon: '+' })}${act('generator', t('generate'))}${act('import', t('importFile'))}${act('backup', '.vfreq ↓')}${act('save-as', t('save') + ' +')} ${act('recover-backup', t('recovery'))}</div><h3>${h(t('demo'))}</h3><div class="project-grid">${[...audio.DEMOS, ...(audio.EXTRA_DEMOS || [])].map((d, i) => act('demo', d.name + ' · ' + d.bpm + ' BPM', { data: 'data-id="' + attr(d.id) + '"', icon: pad(i + 1) })).join('')}</div><h3>${h(t('storage'))}</h3><div class="project-grid">${saved.map((x) => act('saved', x.name + ' · ' + new Date(x.date).toLocaleDateString(lang), { data: 'data-id="' + attr(x.id) + '"' })).join('')}</div>`,
    );
  }
  function generator() {
    open(
      'generator',
      t('generate'),
      `<div class="field-grid">${select(t('genre'), 'gen-genre', genres.map((g, i) => option(i, g)).join(''))}${number('BPM', 'gen-bpm', s.p.bpm, 40, 300, 0.1)}${number(t('seed'), 'gen-seed', s.p.seed, 1, 2147483647)}${number(t('pitch') + ' MIDI', 'gen-root', 36, 16, 84)}${select(t('scale'), 'gen-scale', scaleNames.map((v, i) => option(i, t(v), i === 1)).join(''))}${slider(t('intensity'), 'gen-intensity', 0.72)}${slider(t('complexity'), 'gen-complexity', 0.57)}</div>${act('compose', t('generate'), { classes: 'play' })}`,
    );
  }
  function stepDialog() {
    const pat = pattern(),
      pos = Math.min(pat.length - 1, s.step);
    s.step = pos;
    const ev = event();
    const children = ev
      ? `<div class="field-grid">${number(t('pitch') + ' MIDI', 'note:note', ev.note, 0, 127)}${number(t('velocity'), 'note:velocity', ev.velocity, 0, 1, 0.01)}${number(t('gate'), 'note:gate', ev.gate ?? 0.8, 0.01, 128, 'any')}${number(t('probability'), 'note:probability', ev.probability ?? 1, 0, 1, 0.01)}${number('Ratchet', 'note:ratchet', ev.ratchet ?? 1, 1, 8)}${number('Microtiming', 'note:offset', ev.offset ?? 0, -0.49, 0.49, 0.01)}${number('1× / N', 'note:condition', ev.condition ?? 1, 1, 16)} ${select(
          t('chords'),
          'chord',
          [
            [0, 'Mono'],
            [1, t('minor')],
            [2, t('major')],
            [3, 'Power'],
            [4, t('seventh')],
          ]
            .map(([i, n]) =>
              option(
                i,
                n,
                JSON.stringify(ev.chord || []) ===
                  JSON.stringify([[], [3, 7], [4, 7], [7, 12], [4, 7, 10]][i]),
              ),
            )
            .join(''),
        )}</div><div class="bar-tools">${['accent', 'slide', 'flam'].map((k) => act('flag', k === 'accent' ? t(k) : k, { data: 'data-id="' + k + '"', pressed: !!ev[k] })).join('')}${act('remove-note', t('deleteStep'))}</div><h3>${h(t('locks'))}</h3><div class="knobs">${Object.keys(
          track().params,
        )
          .map((k) => slider(k, 'lock:' + k, ev.locks?.[k] ?? track().params[k]))
          .join('')}</div>${act('clear-locks', t('clear') + ' · ' + t('locks'))}`
      : act('insert-note', t('insert') + ' ' + t('note'));
    open(
      'step',
      track().name + ' / ' + t('step') + ' ' + (pos + 1),
      `<div class="bar-tools">${act('step-prev', '◂', { disabled: pos === 0, title: t('previous') })}${act('step-next', '▸', { disabled: pos === pat.length - 1, title: t('next') })}</div>` +
        children,
    );
  }
  function patternTools() {
    const p = s.p;
    open(
      'pattern',
      t('tools'),
      `<div class="bar-tools">${act('copy', t('copy'))}${act('paste', t('paste'), { disabled: !clipboard })}${act('reverse', t('reverse'))}${act('double', t('duplicate'), { disabled: pattern().length > 64 })}${act('quant', t('quantize'))}</div><div class="field-grid">${number(t('seed'), 'seed', p.seed, 1, 2147483647)}${number(t('intensity'), 'intensity', s.intensity ?? 0.45, 0.01, 1, 0.01)}${number(t('pitch') + ' MIDI', 'root', s.root ?? 36, 0, 100)}${select(t('scale'), 'scale', scaleNames.map((v, i) => option(i, t(v), i === (s.scale ?? 1))).join(''))}</div><div class="bar-tools">${act('vary', t('vary'))}${act('scale-notes', t('quantize') + ' ♩')}${act('scene-copy', t('duplicate') + ' · ' + t('scene'))}</div>`,
    );
  }
  function presets() {
    const tr = track();
    const patches = (audio.PATCHES || []).filter((v) => v.instrument === tr.instrument);
    open(
      'patches',
      tr.name + ' / ' + t('presets'),
      `<div class="project-grid">${patches.map((v) => act('apply-patch', v.name, { data: 'data-id="' + attr(v.id) + '"' })).join('')}</div>`,
    );
  }
  function fxPane(master = false) {
    const tr = track(),
      subject = master ? s.p.master : tr;
    const fx = subject.fx || [];
    const section = master ? 'masterfx' : 'trackfx';
    const controls = master
      ? masterPanel(s, t)
      : `<div class="knobs">${slider(t('stereoWidth'), 'track:' + s.channel + ':width', tr.width ?? 1, 0, 2)}${slider(t('send') + ' Delay', 'track:' + s.channel + ':sendDelay', tr.sendDelay || 0)}${slider(t('send') + ' Reverb', 'track:' + s.channel + ':sendReverb', tr.sendReverb || 0)}</div>${select('Bus', 'routing', audio.BUSSES?.map((b) => option(b, b, b === tr.bus)).join('') || ['kick', 'drums', 'bass', 'synths', 'fx', 'returns'].map((b) => option(b, b, b === tr.bus)).join(''))}${select('Sidechain', 'sidechain-bus', audio.BUSSES.map((b) => option(b, b, b === (tr.sidechainBus || 'kick'))).join(''))}${act('invert', 'Ø', { title: t('phase'), pressed: tr.invert })}`;
    open(
      section,
      master ? 'Master FX' : tr.name + ' · FX / I/O',
      controls +
        `<div class="effect-stack">${fx.map((e, i) => `<div>${slider(audio.EFFECTS.find((f) => f.id === e.id)?.name || e.id, section + ':' + i, e.amount)}${act('fx-bypass', t('bypass'), { pressed: e.bypass, data: 'data-index="' + i + '"' })}${act('fx-up', '↑', { title: t('previous'), data: 'data-index="' + i + '"', disabled: i === 0 })}${act('fx-down', '↓', { title: t('next'), data: 'data-index="' + i + '"', disabled: i === fx.length - 1 })}${act('fx-remove', '×', { data: 'data-index="' + i + '"', title: t('remove') })}</div>`).join('')}</div><div class="bar-tools">${select('FX', 'fx-new', audio.EFFECTS.map((e) => option(e.id, e.name)).join(''))}${act('add-fx', '+ FX')} ${select(
          'Preset',
          'chain',
          (audio.CHAINS || [])
            .filter((v) => v.scope === (master ? 'master' : 'track'))
            .map((e) => option(e.id, e.name))
            .join(''),
        )} ${act('apply-chain', t('choose'))}</div>`,
    );
  }
  function audioExportOptions() {
    const total = audio.totalBars(s.p);
    const startBar = Math.min(total - 1, Math.max(0, readNum('start-bar', 1) - 1));
    const region = fieldValue('render-region');
    const dest = fieldValue('render-track');
    return {
      format: fieldValue('format') === 'stems' ? 'wav' : fieldValue('format'),
      sampleRate: readNum('sample-rate', 48000),
      bits: readNum('bits', 24),
      bitrate: readNum('bitrate', 320),
      channels: readNum('channel-count', 2),
      startBar,
      bars: Math.min(total - startBar, Math.max(1, readNum('render-bars', total))),
      scene: region === 'scene' ? s.scene : null,
      region,
      tail: readNum('render-tail', region === 'loop' ? 0 : 0.35),
      mastering: fieldValue('render-mastering') !== '0',
      normalize: fieldValue('render-normalize') === '1',
      ...(dest?.startsWith('t') ? {track:Number(dest.slice(1))} : {}),
      ...(dest?.startsWith('b') ? {bus:dest.slice(1)} : {}),
    };
  }
  function exportFields() {
    const fmt = fieldValue('format');
    const wav = ['wav', 'flac', 'aiff', 'stems'].includes(fmt),
      audioFmt = wav || fmt === 'mp3';
    const regionField = targetField('render-region');
    regionField.querySelector('[value=loop]').disabled = !audio.exportLoop(s.p);
    const loop = regionField.value === 'loop';
    const tail = targetField('render-tail');
    // A fresh loop closes at its marker; visitors can still add a deliberate effects tail.
    if (loop && tail.dataset.otherTail === undefined) {
      tail.dataset.otherTail = tail.value;
      tail.value = tail.dataset.loopTail ?? '0';
    } else if (!loop && tail.dataset.otherTail !== undefined) {
      tail.dataset.loopTail = tail.value;
      tail.value = tail.dataset.otherTail;
      delete tail.dataset.otherTail;
    }
    const bitField = targetField('bits');
    for (const op of bitField.options) op.disabled = ['flac', 'aiff'].includes(fmt) && +op.value === 32;
    if (bitField.selectedOptions[0]?.disabled) bitField.value = '24';
    for (const id of [
      'bitrate',
      'sample-rate',
      'bits',
      'channel-count',
      'render-track',
      'render-region',
      'render-mastering',
      'render-normalize',
      'render-tail',
      'start-bar',
      'render-bars',
    ]) {
      const e = targetField(id);
      if (!e) continue;
      const on =
        id === 'bits'
          ? wav
          : id === 'bitrate'
            ? fmt === 'mp3'
            : id === 'render-track'
              ? audioFmt && fmt !== 'stems'
              : audioFmt && !(loop && (id === 'start-bar' || id === 'render-bars'));
      e.disabled = !on;
      e.closest('label').hidden = !on;
    }
    const rate = targetField('sample-rate');
    for (const opt of rate.options)
      opt.disabled = fmt === 'mp3' && ![44100, 48000].includes(+opt.value);
    if (rate.selectedOptions[0]?.disabled) rate.value = '48000';
    const estimate = el('render-estimate');
    if (!estimate) return;
    estimate.textContent = '';
    if (!audioFmt) return;
    try {
      const spec = audio.estimateExport(s.p, audioExportOptions());
      const bytes = spec.bytes * (fmt === 'stems' ? s.p.tracks.length : 1);
      const small = bytes < 1048576;
      const format = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
      const seconds = new Intl.NumberFormat(lang, { style:'unit', unit:'second', maximumFractionDigits:1 });
      estimate.textContent = seconds.format(spec.seconds) + ' · ' + t('estimatedSize') + ' ≈ ' +
        format.format(bytes / (small ? 1024 : 1048576)) + (small ? ' KiB' : ' MiB');
    } catch { /* Incomplete number fields have no estimate. */ }
  }
  function exportPane() {
    const bars = s.p.arrangement.reduce((n, e) => n + e.bars, 0);
    const tags = musicTags(s.p);
    const loop = audio.exportLoop(s.p);
    const numberFormat = new Intl.NumberFormat(lang);
    const loopLabel = t('loopRegion') + (loop ? ' · ' + numberFormat.format(loop.start + 1) + '–' + numberFormat.format(loop.end) : '');
    const textField = (id, label, value) =>
      `<label class="field"><span>${h(t(label))}</span><input type="text" data-field="export:${id}" maxlength="${id === 'filename' ? 100 : 240}" value="${attr(value)}"></label>`;
    const credits = textField('filename', 'exportFilename', s.p.exportInfo?.filename ?? exportBasename(s.p)) +
      textField('title', 'musicTitle', tags.title) + textField('artist', 'musicArtist', tags.artist);
    open(
      'export',
      t('export'),
      `<div class="field-grid">${credits}${select(t('export'), 'format', [['wav', 'WAV'], ['aiff', 'AIFF'], ['flac', 'FLAC'], ['midi', 'MIDI'], ['vfreq', '.vfreq'], ['json', 'JSON'], ['zip', 'ZIP · .vfreq + MIDI'], ['stems', 'ZIP · stems WAV'], ...(audio.renderMp3 ? [['mp3', 'MP3']] : [])].map(([k, n]) => option(k, n)).join(''))}${select('kbps', 'bitrate', [128, 192, 256, 320].map((v) => option(v, v, v === 320)).join(''))} ${select('Hz', 'sample-rate', audio.SAMPLE_RATES.map((v) => option(v, v, v === 48000)).join(''))}${select('Bit', 'bits', [16, 24, 32].map((v) => option(v, v === 32 ? '32 float' : v, v === 24)).join(''))}${select(t('output'), 'channel-count', [option(2, 'Stereo', true), option(1, 'Mono')].join(''))}${select(t('instrument'), 'render-track', option('mix', t('master'), true) + s.p.tracks.map((tr, i) => option('t' + i, tr.name)).join('') + (audio.BUSSES || []).map((b) => option('b' + b, 'Bus ' + b)).join(''))}${select(t('source'), 'render-region', option('song', t('arrangement'), true) + option('scene', t('scene')) + option('loop', loopLabel))}${select(t('master'), 'render-mastering', option('1', t('master'), true) + option('0', t('bypass')))}${select('Peak −0.54 dBFS', 'render-normalize', option('0', t('bypass'), true) + option('1', t('peak')))}${number(t('fxTail') + ' · s', 'render-tail', 0.35, 0, 30, 0.05)}${number(t('start') + ' · ' + t('bars'), 'start-bar', 1, 1, bars)}${number(t('length') + ' · ' + t('bars'), 'render-bars', bars, 1, bars)}</div><div class="bar-tools">${act('render', t('download'), { classes: 'play' })}${act('cancel-render', t('cancel'), { disabled: true })}</div><output id="render-estimate"></output><progress id="render-progress" max="1" value="0"></progress><output id="render-status" role="status"></output>`,
    );
    exportFields();
  }
  function settings() {
    open(
      'settings',
      t('settings'),
      `<div class="field-grid">${localeSelect()}${select(t('record'), 'record-mode', option('audio', 'Audio', s.recordMode !== 'video') + (visual?.getCanvas?.()?.captureStream && window.MediaRecorder ? option('video', 'Audio + Chromatic VJ', s.recordMode === 'video') : ''))}${slider(t('volume'), 'master:volume', s.p.master.volume)}${slider('Limiter', 'master:ceiling', s.p.master.ceiling, 0.1, 0.999, 0.001)}</div><div class="bar-tools">${act('ui-preferences', t('interfaceTitle'))}${act('motion', t('motion'), { pressed: motion })}${act('protect', t('protectedMode'), { pressed: s.protect })}${act('offline', t('offline') + ' ↓', { disabled: !('serviceWorker' in navigator) })}${act('erase', t('erase'))}</div><p>${h(t('storageHelp'))} ${h(t('offlineHelp'))}</p><h3>MIDI / Audio I/O</h3><div class="bar-tools">${act('preflight', t('check'))}${act('midi', 'MIDI · ' + t('connect'), { disabled: !navigator.requestMIDIAccess })}${act('learn', 'MIDI ' + t('learn'), { pressed: learn, disabled: !midi })} ${act('midi-clock', 'MIDI clock', { pressed: !!s.midiClock, disabled: !midi })}${act('audio-output', t('output'), { disabled: !canChooseOutput() })}<output data-current-output aria-live="polite">${h(outputLabel())}</output></div><p id="midi-state">${midi ? h([...midi.inputs.values()].map((v) => v.name).join(' · ')) : !navigator.requestMIDIAccess ? t('unsupported') : ''}</p>${act('about', t('help'))} <a href="${href('/legal/')}">© VISIONOIR</a>`,
    );
  }
  async function preflight() {
    const unknown = '—',
      pct = (v) =>
        new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }).format(v);
    let disk,
      battery,
      registered,
      ok = true;
    try {
      await engineReady();
    } catch {
      ok = false;
    }
    try {
      disk = await navigator.storage?.estimate?.();
    } catch {}
    try {
      battery = await navigator.getBattery?.();
    } catch {}
    try {
      registered = await navigator.serviceWorker?.getRegistration?.('/frequency/');
    } catch {}
    let valid = true;
    try {
      audio.validateProject(s.p);
    } catch {
      valid = false;
    }
    const ctx = engine.context,
      ready = t('ready'),
      no = t('unsupported');
    const values = [
      [t('audioEngine'), ok ? engine.mode + ' · ' + (ctx?.state || ready) : no],
      ['Hz', ctx?.sampleRate || unknown],
      [
        t('latency'),
        Number.isFinite(ctx?.baseLatency) ? Math.round(1000 * ctx.baseLatency) + ' ms' : unknown,
      ],
      [t('cpuBudget'), Number.isFinite(tick.dspLoad) ? pct(tick.dspLoad) : unknown],
      [t('battery'), battery ? pct(battery.level) : unknown],
      [
        t('freeSpace'),
        Number.isFinite(disk?.quota)
          ? Math.round((disk.quota - (disk.usage || 0)) / 1048576) + ' MiB'
          : unknown,
      ],
      [
        t('samples'),
        s.p.tracks.filter((tr) => tr.sample?.pcm).length + ' · ' + (valid ? ready : t('badProject')),
      ],
      ['MIDI', midi ? [...midi.inputs.values()].map((x) => x.name).join(', ') || '0' : unknown],
      [t('output'), outputLabel(), true],
      [t('storage'), storageAvailable ? ready : no],
      [t('offline'), registered?.active ? ready : unknown],
    ];
    open(
      'preflight',
      t('check'),
      '<dl class="preflight">' +
        values.map(([k, v, output]) => `<div><dt>${h(k)}</dt><dd${output ? ' data-current-output aria-live="polite"' : ''}>${h(v)}</dd></div>`).join('') +
        '</dl>' +
        '<p>' + h(t('liveWiring')) + '</p>' +
        act('save', t('save')),
    );
    void outputRoute.refresh();
  }
  function targetField(id) {
    return document.querySelector('[data-field="' + id + '"]');
  }
  function fieldValue(id) {
    return targetField(id)?.value;
  }
  function readNum(id, def) {
    const v = Number(fieldValue(id));
    return Number.isFinite(v) ? v : def;
  }
  async function doExport() {
    if (exportController || !guardLive()) return;
    const fmt = fieldValue('format');
    const opts = audioExportOptions();
    const filename = exportBasename(s.p);
    const d = el('panel');
    exportController = new AbortController();
    opts.signal = exportController.signal;
    const progress = (f) => {
      const pr = el('render-progress');
      if (pr) pr.value = Math.min(1, f);
    };
    opts.onProgress = progress;
    d.querySelector('[data-action=render]').disabled = true;
    d.querySelector('[data-action=cancel-render]').disabled = false;
    try {
      let blob,
        ext = fmt;
      switch (fmt) {
        case 'vfreq':
        case 'json':
          blob = audio.projectFile(s.p);
          break;
        case 'midi':
          blob = audio.renderMidi(s.p);
          ext = 'mid';
          break;
        case 'zip':
          blob = await audio.renderZip(s.p);
          break;
        case 'stems':
          blob = await audio.renderStems(s.p, { ...opts, flatNames: true });
          ext = 'zip';
          break;
        case 'flac':
          blob = await audio.renderFlac(s.p, opts);
          break;
        case 'aiff':
          blob = await audio.renderAiff(s.p, opts);
          break;
        case 'mp3':
          blob = await audio.renderMp3(s.p, opts);
          break;
        default:
          blob = await audio.renderWav(s.p, opts);
          ext = 'wav';
      }
      if (!exportController.signal.aborted) {
        download(blob, filename + '.' + ext);
        progress(1);
        if (el('render-status')) el('render-status').textContent = t('ready');
      }
    } catch (err) {
      if (el('render-status'))
        el('render-status').textContent =
          t(err?.name === 'AbortError' ? 'cancel' : 'error') +
          (err?.name === 'RangeError' ? ' · ' + t('length') : '');
      fail(err);
    } finally {
      exportController = undefined;
      if (el('render-progress')) {
        d.querySelector('[data-action=render]').disabled = false;
        d.querySelector('[data-action=cancel-render]').disabled = true;
      }
    }
  }
  async function toggleRecord() {
    if (!off()) {
      recorder.stop();
      return;
    }
    if (!window.MediaRecorder) throw new Error('MediaRecorder');
    await engineReady();
    const audioStream = engine.stream;
    if (!audioStream) throw new Error('MediaStream');
    const video = s.recordMode === 'video';
    let picture;
    try {
      if (video) {
        picture = visual?.startRecording(24);
        if (!picture) throw Error('Video');
      }
      const stream = video
        ? new MediaStream([...audioStream.getAudioTracks(), ...picture.stream.getVideoTracks()])
        : audioStream;
      const formats = video
        ? ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm']
        : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
      const type = formats.find((v) => MediaRecorder.isTypeSupported(v));
      const current = new MediaRecorder(stream, type ? { mimeType: type } : undefined),
        chunks = [];
      recorder = current;
      current.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      current.onstop = () => {
        picture?.stop();
        const mime = current.mimeType;
        if (chunks.length)
          download(
            new Blob(chunks, { type: mime }),
            'Frequency-live.' + (mime.includes('mp4') ? (video ? 'mp4' : 'm4a') : 'webm'),
          );
        recUnclosed = false;
        updateTransport();
        say(t('ready'));
      };
      current.onerror = (e) => fail(e.error);
      current.start(1000);
      recUnclosed = true;
      updateTransport();
    } catch (err) {
      picture?.stop();
      throw err;
    }
  }
  function clearDialog() {
    if (el('panel')?.open) close();
  }
  async function replace(p) {
    audio.validateProject(p);
    remember();
    restoreSnapshot(p);
    clearDialog();
    say(t('open') + ' · ' + p.name);
  }
  function ensureStep() {
    if (!event()) pattern().steps[s.step] = newNote(noteBase());
    return event();
  }
  function selectCh(i) {
    s.channel = i;
    s.bank = Math.floor(i / s.bankSize);
    s.selected.clear();
    s.step = Math.min(s.step, pattern().length - 1);
    s.page = Math.min(s.page, Math.floor((pattern().length - 1) / 16));
    editor();
  }
  function chooseScene(i) {
    s.scene = i;
    saveSoon();
    s.selected.clear();
    s.step = 0;
    s.page = 0;
    if (playing) engine.queueScene(i);
    editor();
  }
  function writeNotes(fn) {
    mutate(() => {
      const pat = pattern();
      for (const i of s.selected.size ? s.selected : [s.step])
        if (pat.steps[i]) fn(pat.steps[i], i, pat);
    });
  }
  function moveNotes(delta, pitch = 0, duplicate = false, origin = s.step) {
    const selected = s.selected.has(origin) ? [...s.selected] : [origin];
    const apply = relocateNotes(pattern(), selected, delta, pitch, duplicate);
    if (!apply) return;
    mutate(() => {
      s.selected = new Set(apply());
      s.step = origin + delta;
      s.page = Math.floor(s.step / 16);
    });
  }
  function reorderClip(from, to) {
    const items = s.p.arrangement;
    if (from === to || !items[from] || !items[to]) return;
    mutate(() => items.splice(to, 0, items.splice(from, 1)[0]));
  }
  async function action(btn) {
    const id = btn.dataset.action,
      i = Number(btn.dataset.index),
      key = btn.dataset.id;
    if (exportController && ['library', 'demo', 'blank', 'saved', 'import', 'close'].includes(id))
      return;
    switch (id) {
      case 'tab':
        s.view = btn.dataset.tab;
        renderTabs();
        editor();
        return;
      case 'about':
        help();
        return;
      case 'close':
        close();
        return;
      case 'play':
        if (!playing) await play(s.view === 'arrangement');
        return;
      case 'stop':
        stop();
        return;
      case 'panic':
        stop();
        if (!off()) recorder.stop();
        say('Panic');
        return;
      case 'play-song':
        stop();
        await play(true);
        return;
      case 'record':
        await toggleRecord();
        return;
      case 'metro':
        mutate(() => (s.p.metronome = !s.p.metronome), false);
        updateTransport();
        return;
      case 'loop':
        mutate(() => {
          s.p.loop ||= { start: 0, end: s.p.arrangement.reduce((a, b) => a + b.bars, 0) };
          s.p.loop.on = !s.p.loop.on;
        });
        return;
      case 'tap': {
        const now = performance.now();
        taps = taps.filter((v) => now - v < 4000).slice(-5);
        taps.push(now);
        if (taps.length > 1) {
          const bpm = Math.max(
            40,
            Math.min(300, Math.round((60000 * (taps.length - 1)) / (now - taps[0]))),
          );
          mutate(() => {
            s.p.bpm = bpm;
          }, false);
          updateTransport();
        }
        return;
      }
      case 'undo':
        if (undo.length) {
          redo.push(snapshot());
          recall(undo.pop());
        }
        return;
      case 'redo':
        if (redo.length) {
          undo.push(snapshot());
          recall(redo.pop());
        }
        return;
      case 'library':
        if (guardLive()) await projects();
        return;
      case 'ui-preferences': uiPreferences(); return;
      case 'enable-keys':
        controls.enabled = !controls.enabled;
        persistControls(controls);
        uiPreferences();
        return;
      case 'reset-keys':
        Object.assign(controls,defaultControls());
        applyScale();
        persistControls(controls);
        uiPreferences();
        return;
      case 'settings':
        settings();
        return;
      case 'preflight':
        await preflight();
        return;
      case 'save':
      case 'save-as':
        await save(s.p, { named: true });
        say(t('saved'));
        if (activeDialog === 'library') await projects();
        return;
      case 'recover-backup': {
        const prev = await previousProject();
        if (prev) {
          await replace(prev);
        } else say(t('unsupported'));
        return;
      }
      case 'backup':
        download(audio.projectFile(s.p), s.p.name + '.vfreq');
        return;
      case 'demo':
        if (guardLive()) await replace(audio.createProject(key));
        return;
      case 'generator':
        if (guardLive()) generator();
        return;
      case 'compose':
        if (guardLive()) {
          const fields = el('panel').querySelectorAll('input[type=number]');
          for (const f of fields) if (!f.reportValidity()) return;
          const project = generateSession(audio.createProject, {
            seed: readNum('gen-seed', 81),
            root: readNum('gen-root', 36),
            genre: readNum('gen-genre', 0),
            bpm: readNum('gen-bpm', 155),
            intensity: readNum('gen-intensity', 0.72),
            complexity: readNum('gen-complexity', 0.57),
            scale: readNum('gen-scale', 1),
          });
          await replace(project);
          chooseScene(3);
        }
        return;
      case 'blank':
        if (guardLive()) await replace(audio.createProject('blank'));
        return;
      case 'saved':
        if (guardLive()) await replace(await loadNamed(key));
        return;
      case 'import':
        if (guardLive()) el('project-file').click();
        return;
      case 'export':
        if (guardLive()) exportPane();
        return;
      case 'render':
        await doExport();
        return;
      case 'cancel-render':
        exportController?.abort();
        return;
      case 'bank-prev':
        s.bank = Math.max(0, s.bank - 1);
        editor();
        return;
      case 'bank-next':
        s.bank = Math.min(Math.ceil(s.p.tracks.length / s.bankSize) - 1, s.bank + 1);
        editor();
        return;
      case 'page-prev':
        s.page = Math.max(0, s.page - 1);
        editor();
        return;
      case 'page-next':
        s.page = Math.min(7, s.page + 1);
        editor();
        return;
      case 'channel':
        selectCh(i);
        return;
      case 'preview':
        await audition(s.channel, noteBase());
        return;
      case 'audition':
        await audition(s.channel, Number(btn.dataset.note));
        return;
      case 'inspect-step':
        s.inspectStep = !s.inspectStep; editor(); return;
      case 'step': {
        s.channel = Number(btn.dataset.channel);
        s.step = Number(btn.dataset.pos);
        s.selected = new Set([s.step]);
        if (s.inspectStep) { editor(); stepDialog(); return; }
        mutate(() => {
          const p = pattern();
          p.steps[s.step] = p.steps[s.step] ? null : newNote(noteBase());
        });
        return;
      }
      case 'piano-cell': {
        const pos = Number(btn.dataset.pos),
          pitch = Number(btn.dataset.note),
          pat = pattern();
        const displayed = btn.hasAttribute('data-origin') ? Number(btn.dataset.origin) : null;
        if (s.pianoTool === 'chords' && pat.steps[pos]) {
          const old = pat.steps[pos];
          const chord = changeChord(old, pitch);
          if (chord === old) return;
          s.step = pos; s.selected = new Set([pos]);
          mutate(() => { pat.steps[pos] = chord; });
          if (!playing && chord) await audition(s.channel,pitch);
          return;
        }
        if (displayed !== null && s.pianoTool !== 'chords') {
          s.step = displayed;
          if (s.multi) {
            if (s.selected.delete(displayed)) {
              // Keep the inspector and the keyboard move command on a selected note.
              if (s.selected.size) s.step = [...s.selected].at(-1);
            } else s.selected.add(displayed);
          } else s.selected = new Set([displayed]);
          editor();
          if (!playing && !s.multi) await audition(s.channel,pitch);
          return;
        }
        s.step = pos;
        s.selected = new Set([pos]);
        mutate(() => {
          if (pat.steps[pos]) pat.steps[pos].note = pitch;
          else pat.steps[pos] = newNote(pitch);
        });
        if (!playing) await audition(s.channel, pitch);
        return;
      }
      case 'duplicate-notes': {
        const notes = [...(s.selected.size ? s.selected : [s.step])].filter(i => pattern().steps[i]);
        if (!notes.length) return;
        moveNotes(Math.max(...notes) - Math.min(...notes) + 1, 0, true, Math.min(...notes));
        return;
      }
      case 'multi':
        s.multi = !s.multi;
        editor();
        return;
      case 'transpose-down':
      case 'transpose-up':
        writeNotes((e) => (e.note = Math.max(0, Math.min(127, e.note + (id.endsWith('up') ? 1 : -1)))));
        return;
      case 'move-prev':
      case 'move-next':
        moveNotes(id.endsWith('prev') ? -1 : 1);
        return;
      case 'copy-notes': {
        const set = [...(s.selected.size ? s.selected : [s.step])].sort((a, b) => a - b);
        notesClipboard = set
          .filter((i) => pattern().steps[i])
          .map((i) => ({ off: i - set[0], note: structuredClone(pattern().steps[i]) }));
        return;
      }
      case 'paste-notes':
        if (notesClipboard?.length)
          mutate(() =>
            notesClipboard.forEach(({ off, note }) => {
              if (s.step + off < pattern().length)
                pattern().steps[s.step + off] = structuredClone(note);
            }),
          );
        return;
      case 'delete-notes':
        writeNotes((e, i, p) => (p.steps[i] = null));
        return;
      case 'edit-step':
        stepDialog();
        return;
      case 'step-prev':
      case 'step-next':
        s.step += id.endsWith('prev') ? -1 : 1;
        stepDialog();
        return;
      case 'insert-note':
        mutate(ensureStep);
        stepDialog();
        return;
      case 'remove-note':
        mutate(() => (pattern().steps[s.step] = null));
        stepDialog();
        return;
      case 'flag':
        mutate(() => {
          const e = ensureStep();
          e[key] = !e[key];
        });
        stepDialog();
        return;
      case 'clear-locks':
        mutate(() => (ensureStep().locks = {}));
        stepDialog();
        return;
      case 'pattern-tools':
        patternTools();
        return;
      case 'copy':
        clipboard = structuredClone(pattern());
        patternTools();
        return;
      case 'paste':
        if (clipboard)
          mutate(() => (s.p.scenes[s.scene].patterns[s.channel] = structuredClone(clipboard)));
        return;
      case 'reverse':
        mutate(() => {
          const p = pattern();
          p.steps = p.steps.slice(0, p.length).reverse();
        });
        return;
      case 'double':
        mutate(() => {
          const p = pattern(),
            a = p.steps.slice(0, p.length);
          p.steps = [...a, ...structuredClone(a)].slice(0, 128);
          p.length = p.steps.length;
        });
        patternTools();
        return;
      case 'piano-quantize':
      case 'piano-quantize-scale':
      case 'quant':
      case 'scale-notes': {
        const pat = pattern();
        const positions = id.startsWith('piano-') ? s.selected : pat.steps.keys();
        const scale = id === 'scale-notes' || id === 'piano-quantize-scale' ? scales[s.scale ?? 1] : null;
        const apply = planQuantization(pat, positions, scale, s.root ?? 36);
        if (apply) mutate(apply);
        return;
      }
      case 'vary':
        mutate(() =>
          seededVariation(
            pattern(),
            s.p.seed,
            s.intensity ?? 0.45,
            s.root ?? 36,
            ['acid', 'lead', 'stab', 'fm', 'industrial', 'sub'].includes(track().instrument),
          ),
        );
        return;
      case 'add-channel':
        if (s.p.tracks.length < 32)
          open(
            'channel',
            t('instrument'),
            `<div class="project-grid">${audio.INSTRUMENTS.map((v) => act('new-channel', v.name, { data: 'data-id="' + attr(v.id) + '"' })).join('')}</div>`,
          );
        return;
      case 'new-channel':
        if (s.p.tracks.length < 32)
          mutate(() => {
            const n = s.p.tracks.length;
            s.p.tracks.push(audio.createTrack(key, n));
            s.p.scenes.forEach((v) => v.patterns.push({ length: 16, steps: Array(16).fill(null) }));
            s.p.arrangement.forEach((c) => c.trackScenes?.push(null));
            s.channel = n;
            s.bank = Math.floor(n / s.bankSize);
          });
        close();
        return;
      case 'add-scene':
      case 'scene-copy':
        if (s.p.scenes.length < 128)
          mutate(() => {
            const copy = structuredClone(s.p.scenes[s.scene]);
            copy.id = 'scene-' + crypto.randomUUID();
            copy.name = sceneName(s.scene) + ' +';
            if (id === 'add-scene') copy.patterns.forEach((p) => p.steps.fill(null));
            s.p.scenes.push(copy);
          });
        return;
      case 'launch':
        s.scene = i;
        say(t('waiting') + ' · ' + sceneName(i));
        if (!playing) await play();
        else engine.queueScene(i);
        editor();
        return;
      case 'add-clip':
        if (s.p.arrangement.length >= 2048) {say(t('maxSize'));return;}
        mutate(() => s.p.arrangement.push({ scene: s.scene, bars: 4 }));
        return;
      case 'auto-open': automationEditor.begin(Math.min(s.clipIndex || 0,s.p.arrangement.length-1)); return;
      case 'auto-add':
      case 'auto-save':
      case 'auto-delete': automationEditor.action(id); return;
      case 'region-add': regionEditor.begin(0); return;
      case 'region-edit': regionEditor.begin(i, Number(btn.dataset.region)); return;
      case 'region-save': regionEditor.commit(); return;
      case 'region-delete': regionEditor.commit(true); return;
      case 'clip-source': {
        s.clipIndex = i;
        s.lane = +btn.dataset.channel;
        const clip = s.p.arrangement[i];
        open(
          'clip-source',
          s.p.tracks[s.lane].name,
          `${select(t('source'), 'clip-source', option(-2, t('scene') + ' · ' + sceneName(clip.scene), clip.trackScenes?.[s.lane] == null) + option(-1, 'Mute', clip.trackScenes?.[s.lane] === -1) + s.p.scenes.map((sc, ti) => option(ti, sc.name, clip.trackScenes?.[s.lane] === ti)).join(''))}`,
        );
        return;
      }
      case 'clip-marker': {
        s.clipIndex = i;
        const clip = s.p.arrangement[i];
        open(
          'marker',
          t('marker'),
          `<input class="wide" data-field="marker" maxlength="80" aria-label="${h(t('marker'))}" value="${attr(clip.marker || '')}">`,
        );
        return;
      }
      case 'clip-move-to': {
        s.clipIndex = i;
        open('clip-position',t('shift')+' · '+t('clip'),select(t('position'),'clip-position',
          s.p.arrangement.map((part,j)=>option(j,(j+1)+' · '+(part.marker || sceneName(part.scene)),j===i)).join('')));
        return;
      }
      case 'clip-up':
      case 'clip-down':
        mutate(() => {
          const j = i + (id === 'clip-up' ? -1 : 1),
            a = s.p.arrangement;
          [a[i], a[j]] = [a[j], a[i]];
        });
        return;
      case 'clip-duplicate': {
        if (s.p.arrangement.length >= 2048) {say(t('maxSize'));return;}
        const copy = structuredClone(s.p.arrangement[i]);
        try { validateAutomation([...s.p.arrangement,copy],s.p.tracks); }
        catch { say(t('maxSize'));return; }
        mutate(() => s.p.arrangement.splice(i+1,0,copy));
        return;
      }
      case 'clip-delete':
        if (s.p.arrangement.length > 1) mutate(() => s.p.arrangement.splice(i, 1));
        return;
      case 'bus-mute':
        mutate(() => {
          const bus = busSettings(key);
          bus.mute = !bus.mute;
        });
        return;
      case 'mute':
      case 'solo':
        mutate(() => (s.p.tracks[i][id] = !s.p.tracks[i][id]));
        return;
      case 'master-mute':
        mutate(() => {
          if (s.p.master.volume) {
            restoreVolume = s.p.master.volume;
            s.p.master.volume = 0;
          } else s.p.master.volume = restoreVolume;
        });
        return;
      case 'patches':
        presets();
        return;
      case 'apply-patch': {
        const preset = (audio.PATCHES || []).find(
          (v) => v.id === key && v.instrument === track().instrument,
        );
        if (preset) mutate(() => Object.assign(track().params, preset.params));
        close();
        return;
      }
      case 'apply-chain': {
        const master = activeDialog === 'masterfx',
          chain = (audio.CHAINS || []).find(
            (v) => v.id === fieldValue('chain') && v.scope === (master ? 'master' : 'track'),
          );
        if (chain) mutate(() => ((master ? s.p.master : track()).fx = structuredClone(chain.fx)));
        fxPane(master);
        return;
      }
      case 'rename-scene':
        open(
          'scene-name',
          t('scene'),
          '<label class="field">' +
            h(t('title')) +
            '<input data-field="scene-name" maxlength="80" value="' +
            attr(sceneName(s.scene)) +
            '"></label>',
        );
        return;
      case 'track-settings':
        fxPane();
        return;
      case 'master-fx':
        fxPane(true);
        return;
      case 'invert':
        mutate(() => (track().invert = !track().invert));
        fxPane();
        return;
      case 'add-fx':
      case 'fx-up':
      case 'fx-down':
      case 'fx-bypass':
      case 'fx-remove': {
        const master = activeDialog === 'masterfx',
          subject = master ? s.p.master : track(),
          fx = (subject.fx ||= []);
        mutate(() => {
          if (id === 'add-fx' && fx.length < 12)
            fx.push({ id: fieldValue('fx-new'), amount: 0.4, bypass: false });
          else if (id === 'fx-up' || id === 'fx-down') {
            const next = i + (id === 'fx-up' ? -1 : 1);
            if (fx[next]) [fx[i], fx[next]] = [fx[next], fx[i]];
          } else if (id === 'fx-bypass') fx[i].bypass = !fx[i].bypass;
          else if (id === 'fx-remove') fx.splice(i, 1);
        });
        fxPane(master);
        return;
      }
      case 'motion':
        motion = !motion;
        document.documentElement.dataset.motion = motion ? 'reduce' : 'full';
        visual?.setMotion(!motion);
        settings();
        return;
      case 'protect':
        s.protect = !s.protect;
        updateTransport();
        if (activeDialog === 'settings') settings();
        else editor();
        return;
      case 'midi':
        await connectMidi();
        settings();
        return;
      case 'midi-clock':
        s.midiClock = !s.midiClock;
        clockInput?.reset();
        settings();
        return;
      case 'learn':
        learn = !learn;
        pendingMidi = undefined;
        settings();
        if (learn) close();
        return;
      case 'audio-output':
        if (canChooseOutput()) {
          try {
            if (await outputRoute.choose()) say(outputLabel());
          } catch (error) {
            fail(Error(error.name === 'NotAllowedError' || error.name === 'SecurityError'
              ? 'audio.outputDenied' : 'audio.outputFailed'));
          }
        }
        return;
      case 'offline':
        await offline();
        return;
      case 'erase':
        if (!guardLive()) return;
        open(
          'erase',
          t('erase'),
          `<p>${h(t('eraseScope'))}</p><div class="bar-tools">${act('cancel-erase', t('cancel'))}${act('confirm-erase', t('confirm'))}</div><p role="status"></p>`,
        );
        el('panel').querySelector('[data-action="cancel-erase"]').focus();
        return;
      case 'cancel-erase':
        close();
        return;
      case 'confirm-erase': {
        if (!guardLive() || activeDialog !== 'erase' || exportController) return;
        if (erasing) return;
        const panel = el('panel');
        const buttons = panel.querySelectorAll('button');
        erasing = true;
        buttons.forEach(button => { button.disabled = true; });
        try {
          await removeSaved(() => { panel.querySelector('[role=status]').textContent = t('eraseBlocked'); });
        } finally {
          erasing = false;
          buttons.forEach(button => { button.disabled = false; });
        }
        return;
      }
    }
  }
  function busSettings(key) {
    s.p.buses ||= {};
    return (s.p.buses[key] ||= { volume: 1, mute: false });
  }
  let rangeEditing;
  async function field(node, live = false) {
    const id = node.dataset.field,
      raw = node.value,
      v = Number(raw),
      [group, index, prop] = id.split(':');
    if (node.type === 'number' && (!node.validity.valid || !raw)) return;
    const change = (fn) => {
      if (live) {
        if (rangeEditing !== node) {
          remember();
          rangeEditing = node;
        }
        fn();
        const command =
          id === 'master:volume'
            ? 'm'
            : group === 'track' && prop === 'volume'
              ? 'v:' + index
              : group === 'param'
                ? 'p:' + s.channel + ':' + index
                : null;
        if (command && engine.control) {
          engine.control(command, v);
          saveSoon();
          renderTabs();
        } else changed({ draw: false });
      } else mutate(fn, false);
    };
    if (group === 'export' && ['title','artist','filename'].includes(index)) {
      if (s.p.exportInfo?.[index] !== raw) {
        remember();
        s.p.exportInfo = { ...s.p.exportInfo, [index]: raw.slice(0, 240) };
        saveSoon();
      }
      return;
    }
    if (['auto-part','auto-track','auto-target','auto-select'].includes(id)) { automationEditor.change(id,raw); return; }
    if (id === 'ui-size' && interfaceScales.includes(v)) {
      controls.size=v;
      applyScale();
      persistControls(controls);
      return;
    }
    if (id.startsWith('bind-')) {
      if(assignKey(controls,Number(id.slice(5)),raw)) persistControls(controls);
      uiPreferences();
      return;
    }
    if (id.startsWith('gen-')) return;
    if (id === 'lang') {
      if (!names[raw]) return;
      const requested = ++languageRequest;
      const next = await translator(raw);
      if (requested !== languageRequest) return;
      lang = raw;
      t = next;
      pageAttrs();
      try {
        localStorage.setItem('visionoir-language', lang);
      } catch {}
      el('studio').querySelector('.topright').innerHTML =
        act('about', t('about')) + ' <a href="' + href('/support/') + '">' + h(t('support')) + ' ↗</a>';
      document.querySelector('.brand').href = '/' + lang.toLowerCase() + '/';
      document.querySelector('footer a').href = href('/legal/');
      updateTransport();
      renderTabs();
      editor();
      el('tabs').setAttribute('aria-label', t('tools'));
      const analyser = targetField('analyser');
      analyser.closest('label').querySelector('span').textContent = t('output');
      for (const op of analyser.options) op.textContent = t(op.value);
      visual?.setLocale(lang);
      setState();
      settings();
      targetField('lang')?.focus();
      return;
    }
    if (
      activeDialog === 'export' &&
      [
        'format',
        'bitrate',
        'sample-rate',
        'bits',
        'channel-count',
        'start-bar',
        'render-bars',
        'render-tail',
        'render-region',
      ].includes(id)
    ) {
      exportFields();
      return;
    }
    if (id === 'crossfade-beats') {
      change(() => (s.p.crossfadeBeats = v));
      return;
    }
    if (id === 'record-mode') {
      s.recordMode = raw;
      return;
    }
    if (id === 'analyser') {
      s.analyser = raw;
      return;
    }
    if (group === 'livefx') {
      change(() => {
        s.p.master.fx ||= [];
        let fx = s.p.master.fx.find((e) => e.id === index);
        if (!fx) {
          fx = { id: index, amount: 0, bypass: true };
          if (s.p.master.fx.length >= 12) throw new RangeError('FX');
          s.p.master.fx.push(fx);
        }
        fx.amount = v;
        fx.bypass = v === 0;
      });
      return;
    }
    if (id === 'scene') {
      chooseScene(v);
      return;
    }
    if (id === 'channel') {
      selectCh(v);
      return;
    }
    if (id === 'clip-position') { reorderClip(s.clipIndex, v); close(); return; }
    if (id === 'piano-tool') { s.pianoTool = raw; editor(); return; }
    if (id === 'piano-root' || id === 'piano-scale') {
      if (id === 'piano-root') s.root = 36+v; else s.scale = v;
      editor(); return;
    }
    if (id === 'piano-gate' || id === 'piano-velocity') {
      writeNotes(note => {if (id === 'piano-gate') note.gate = v; else note.velocity = v/100;});
      return;
    }
    if (id === 'octave') {
      s.octave = v;
      editor();
      return;
    }
    if (id === 'intensity' || id === 'root' || id === 'scale') {
      s[id] = v;
      return;
    }
    if (id === 'name') {
      change(() => (s.p.name = raw.trim().slice(0, 160) || 'FREQUENCY'));
      editor();
      return;
    }
    if (id === 'bpm' || id === 'swing' || id === 'seed') {
      change(() => (s.p[id] = id === 'swing' ? v / 100 : v));
      return;
    }
    if (id === 'length') {
      mutate(() => resizePattern(pattern(), v));
      return;
    }
    if (group === 'clip-scene' || group === 'clip-bars') {
      mutate(() => (s.p.arrangement[index][group === 'clip-bars' ? 'bars' : 'scene'] = v));
      return;
    }
    if (group === 'bus' && audio.BUSSES.includes(index)) {
      change(() => (busSettings(index).volume = v));
      return;
    }
    if (group === 'master') {
      change(() => (s.p.master[index] = v));
      return;
    }
    if (group === 'track') {
      change(() => (s.p.tracks[index][prop] = v));
      return;
    }
    if (group === 'param') {
      change(() => (track().params[index] = v));
      return;
    }
    if (group === 'note') {
      change(() => (ensureStep()[index] = v));
      editor();
      return;
    }
    if (group === 'lock') {
      change(() => {
        const e = ensureStep();
        e.locks ||= {};
        e.locks[index] = v;
      });
      return;
    }
    if (group === 'trackfx' || group === 'masterfx') {
      change(() => ((group === 'masterfx' ? s.p.master : track()).fx[index].amount = v));
      return;
    }
    if (id === 'clip-source') {
      mutate(() => {
        const clip = s.p.arrangement[s.clipIndex];
        clip.trackScenes ||= Array(s.p.tracks.length).fill(null);
        clip.trackScenes[s.lane] = v === -2 ? null : v;
      });
      close();
      return;
    }
    if (id === 'marker') {
      mutate(() => (s.p.arrangement[s.clipIndex].marker = raw.trim().slice(0, 80)));
      return;
    }
    if (id === 'chord') {
      mutate(() => (ensureStep().chord = [[], [3, 7], [4, 7], [7, 12], [4, 7, 10]][v]));
      return;
    }
    if (id === 'loop-start' || id === 'loop-end') {
      const total = s.p.arrangement.reduce((sum, v) => sum + v.bars, 0);
      mutate(() => {
        s.p.loop ||= { on: false, start: 0, end: total };
        if (id === 'loop-start') s.p.loop.start = Math.max(0, Math.min(s.p.loop.end - 1, v - 1));
        else s.p.loop.end = Math.min(total, Math.max(s.p.loop.start + 1, v));
      });
      return;
    }
    if (id === 'scene-name') {
      if (raw.trim()) mutate(() => (s.p.scenes[s.scene].name = raw.trim().slice(0, 80)));
      return;
    }
    if (id === 'sidechain-bus') {
      change(() => (track().sidechainBus = raw));
      return;
    }
    if (id === 'routing') {
      change(() => (track().bus = raw));
      return;
    }
  }
  async function connectMidi() {
    if (!navigator.requestMIDIAccess) throw Error('MIDI');
    const access = await navigator.requestMIDIAccess({ sysex: false });
    midiPorts?.close();
    midi = access;
    clockInput = createMidiClock({
      tempo(bpm) {
        s.p.bpm = bpm;
        if (engine.control) engine.control('tempo', bpm);
        else engine.update(s.p);
        updateTransport();
      },
      start: () => { void play(s.view === 'arrangement'); },
      stop,
    });
    const hardwareToField = (id, x) => {
      const [group, idx, prop] = id.split(':');
      if (group === 'm') s.p.master.volume = x;
      else if (group === 'v' && s.p.tracks[idx]) s.p.tracks[idx].volume = x;
      else if (group === 'p' && Object.hasOwn(s.p.tracks[idx]?.params || {}, prop))
        s.p.tracks[idx].params[prop] = x;
      else return;
      if (engine.control) engine.control(id, x);
      else engine.update(s.p);
      saveSoon();
      if (!renderTask)
        renderTask = requestAnimationFrame(() => {
          renderTask = undefined;
          editor();
        });
    };
    function receive(message, inputId) {
      const [status, a, b] = message.data;
      if (status === 0xf8 || status === 0xfa || status === 0xfc) {
        if (s.midiClock) clockInput.receive(inputId, message);
        return;
      }
      const channel = status & 15,
        cmd = status >> 4;
      if (cmd === 11) {
        if (a === 120 || a === 123) midiNotes.reset(inputId, channel);
        visual?.handleCC?.(channel, a, b / 127);
        const k = channel + ':' + a;
        if (learn && pendingMidi) {
          s.p.midiMappings ||= {};
          mutate(() => (s.p.midiMappings[k] = pendingMidi));
          learn = false;
          pendingMidi = undefined;
          say('MIDI CC ' + a);
          return;
        }
        if (s.p.midiMappings?.[k]) hardwareToField(s.p.midiMappings[k], b / 127);
      } else if (cmd === 9 && b > 0) {
        void midiNotes.press(inputId, channel, a, s.channel, b / 127);
      } else if (cmd === 8 || (cmd === 9 && b === 0)) midiNotes.release(inputId, channel, a);
    }
    midiPorts = bindMidiInputs(midi, receive, id => {
      midiNotes.reset(id);
      clockInput.detach(id);
    });
    midi.onstatechange = () => {
      midiPorts.refresh();
      say([...midi.inputs.values()].map((v) => v.name).join(' · ') || t('unsupported'));
    };
  }
  async function offline() {
    if (!guardLive()) return;
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const worker = reg.installing || reg.waiting || reg.active;
    if (!worker) throw Error('Offline');
    if (!['installed', 'activated'].includes(worker.state))
      await new Promise((resolve, reject) => {
        const inspect = () => {
          if (['activated', 'installed'].includes(worker.state)) {
            worker.removeEventListener('statechange', inspect);
            resolve();
          } else if (worker.state === 'redundant') {
            worker.removeEventListener('statechange', inspect);
            reject(Error('Offline'));
          }
        };
        worker.addEventListener('statechange', inspect);
        inspect();
      });
    say(t('offlineReady'));
  }
  const root = el('studio');
  automationEditor.bind(root);
  bindEditorDrags(root, {
    noteDrop(from,to) {
      const origin = Number(from.dataset.origin), end = Number(to.dataset.pos);
      if (s.pianoTool === 'gate') {
        const gate = Math.min(128, Math.max(1, end - origin + 1));
        if (pattern().steps[origin]?.gate === gate) return;
        s.step = origin; s.selected = new Set([origin]);
        mutate(() => { pattern().steps[origin].gate = gate; });
      } else moveNotes(end - Number(from.dataset.pos), Number(to.dataset.note) - Number(from.dataset.note), false, origin);
    },
    clipDrop: reorderClip,
  });
  root.addEventListener('click', (e) => {
    if (e.target === el('panel')) {
      const rect = el('panel').getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        close();
      return;
    }
    const b = e.target.closest('[data-action]');
    if (b && !b.disabled) void action(b).catch(fail);
  });
  root.addEventListener('keydown', (e) => {
    const b = e.target.closest('.cell,.piano-cell');
    if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'End', 'Home'].includes(e.key))
      return;
    const row = b.parentElement,
      rows = [...row.parentElement.children],
      col = Array.from(row.children).indexOf(b);
    const horizontal = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0,
      vertical = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    const next = vertical
      ? rows[rows.indexOf(row) + vertical]?.children[col]
      : row.children[
          e.key === 'Home' ? 1 : e.key === 'End' ? row.children.length - 1 : col + horizontal
        ];
    if (next?.matches('button:not(:disabled)')) {
      e.preventDefault();
      next.focus();
    }
  });
  root.addEventListener('pointerdown', (e) => {
    const padBtn = e.target.closest('[data-pad]');
    if (padBtn) {
      const i = Number(padBtn.dataset.pad);
      padBtn.setPointerCapture(e.pointerId);
      void audition(i, noteBase(i), e.pressure > 0.01 && e.pressure !== 0.5 ? e.pressure : 0.9).catch(
        fail,
      );
    }
    const f = e.target.closest('input[data-field]');
    if (learn && f) {
      const [g, i, p] = f.dataset.field.split(':');
      pendingMidi =
        g === 'param'
          ? 'p:' + s.channel + ':' + i
          : g === 'track' && p === 'volume'
            ? 'v:' + i
            : g === 'master' && i === 'volume'
              ? 'm'
              : undefined;
      if (pendingMidi) say('MIDI CC → ' + f.dataset.field);
    }
  });
  const releasePad = (e) => {
    const p = e.target.closest('[data-pad]');
    if (p) {
      const i = Number(p.dataset.pad);
      engine.release(i, noteBase(i));
    }
  };
  root.addEventListener('pointerup', releasePad);
  root.addEventListener('pointercancel', releasePad);
  root.addEventListener('input', (e) => {
    if (e.target.dataset.field === 'region-out' || e.target.dataset.field === 'region-in') targetField('region-out')?.setCustomValidity('');
    const f = e.target;
    if (f.type === 'range' && f.dataset.field) {
      const label = f.closest('.fader');
      label?.style.setProperty(
        '--fill',
        ((Number(f.value) - Number(f.min)) / (Number(f.max) - Number(f.min))) * 100 + '%',
      );
      label?.style.setProperty('--angle', -132 + Number(f.value) * 264 + 'deg');
      if (label?.querySelector('output')) label.querySelector('output').value = f.value;
      void field(f, true).catch(fail);
    }
  });
  root.addEventListener('change', async (e) => {
    const node = e.target;
    try {
      if (node.id === 'project-file') {
        const file = node.files[0];
        node.value = '';
        if (file) await replace(await audio.readProject(file));
        return;
      }
      if (node.hasAttribute('data-region-file')) { await regionEditor.importFile(node.files[0]); return; }
      if (['region-source','region-part'].includes(node.dataset.field)) { regionEditor.change(node.dataset.field, node.value); return; }
      if (node.id === 'sample-file') {
        if (node.files[0]) {
          const target = track(),
            project = s.p;
          if (project.arrangement.some(part => part.audioRegions?.some(r => r.track === target.id))) {
            say(t('regionProtect')); return;
          }
          const sampleTarget = { ...target };
          await audio.importSample(node.files[0], sampleTarget);
          if (s.p !== project || !project.tracks.includes(target)) return;
          mutate(() => (target.sample = sampleTarget.sample));
          say(t('ready'));
        }
        return;
      }
      if (rangeEditing === node) rangeEditing = undefined;
      else if (node.dataset.field) await field(node);
    } catch (err) {
      fail(err);
    }
  });
  const performanceKeys = bindPerformanceKeys(document,{
    getControls:()=>controls,
    modal:()=>el('panel').open,
    transport:()=>playing ? stop() : void play(s.view === 'arrangement'),
    stop,
    standard:command=>void action({dataset:{action:command}}).catch(fail),
    async playPad(index,token){
      if(!s.p.tracks[index]) return;
      const pitch=noteBase(index);
      await audition(index,pitch,.85,token);
      return ()=>engine.release(index,pitch,token);
    },
    onError:fail,
  });
  window.addEventListener(eraseEvent, () => {
    erasedSession = true;
    storageAvailable = false;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    exportController?.abort();
    recUnclosed = false;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    performanceKeys.clear();
    stop();
    location.reload();
  }, {once:true});
  window.addEventListener('pagehide', event => {
    if (!event.persisted) outputRoute.dispose();
    performanceKeys.clear();
    flushSave();
    scopeObserver.disconnect();
    midiPorts?.close();
    midiNotes.reset();
    engine.stop();
    visual?.dispose();
  });
  window.addEventListener('beforeunload', (e) => {
    if (!erasedSession && (recUnclosed || exportController)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSave();
  });
  pageAttrs();
  shell();
  el('panel').addEventListener('cancel', (e) => {
    e.preventDefault();
    if (!exportController) close();
  });
  if (!storageAvailable) say(t('storage') + ' · ' + t('unsupported'));
  meter();
  try {
    const { mountChromatic } = await import('./chromatic/index.js');
    visual = await mountChromatic(el('chromatic'), {
      locale: lang,
      state: s.p.visual,
      getSignal: readVisualSignal,
      onChange: (value) => {
        s.p.visual = value;
        saveSoon();
      },
    });
    visual?.setMotion(!motion);
  } catch (err) {
    el('chromatic').innerHTML = '<img class="flat-logo" src="/assets/logo.svg" alt="VISIONOIR">';
    console.warn('[Chromatic]', err?.name);
  }
}
