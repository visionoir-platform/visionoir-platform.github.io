import { generateSession, genres } from './composer.js';
import * as audio from './audio/index.js';
import { translator, names, direction, getInitialLocale } from './i18n.js';
import { save, restore, library, loadNamed, removeSaved, previousProject } from './storage.js';
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

export async function startStudio() {
  let lang = getInitialLocale(),
    t = await translator(lang);
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
  let storageAvailable = true;
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
    outputDevice,
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
  const scaleNames = ['chromatic', 'minor', 'major', 'phrygian'];
  const scales = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 2, 3, 5, 7, 8, 10],
    [0, 2, 4, 5, 7, 9, 11],
    [0, 1, 3, 5, 7, 8, 10],
  ];
  const track = () => s.p.tracks[s.channel];
  const pattern = () => s.p.scenes[s.scene].patterns[s.channel];
  const event = () => pattern().steps[s.step];
  let noticeTimer;
  const off = () => !(recorder && recorder.state === 'recording');
  const engineReady = async () => {
    if (!engine.context || engine.context.state !== 'running') await engine.prepare(s.p);
    return engine;
  };
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
    const key =
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
      `<div class="case"><header class="topbar"><a class="brand" href="/${encodeURIComponent(lang.toLowerCase())}/"><img src="/assets/logo.svg" alt="">VISIONOIR</a><span class="unit-name">FREQUENCY</span><div class="topright">${act('about', t('about'))} <a href="${href('/support/')}">${h(t('support'))} ↗</a></div></header><div class="console-title"><div><h1 dir="ltr">FREQUENCY<span>.</span></h1><p>DESIGN THE SOUND OF THE UNSEEN.</p><small class="byline" dir="ltr" lang="en">Created, designed and developed by Flavio Giorgio Guarini.</small></div><div class="session-id"><span class="status-led"></span><span id="state"></span><strong id="clock" dir="ltr">001.01.01</strong></div></div><div class="transport" id="transport"></div><nav class="tabs" aria-label="${attr(t('tools'))}" id="tabs"></nav><div class="deck"><section class="editor" id="editor"></section><aside class="right-rack"><div id="chromatic"></div><section class="master-screen"><header><strong>MASTER</strong>${select(t('output'), 'analyser', ['fft', 'scope', 'history'].map((k) => option(k, t(k), k === (s.analyser || 'fft'))).join(''))}<output id="db">−∞ dBFS</output></header><canvas id="scope" width="320" height="82" aria-label="Master"></canvas><div class="readings" aria-live="off"><span>L/R <output id="rms">−∞</output></span><span>φ <output id="corr">—</output></span><span id="clip-light">CLIP</span></div></section></aside></div><footer><span>VISIONOIR: FREQUENCY</span><p>Created, designed and developed by Flavio Giorgio Guarini.</p><a href="${href('/legal/')}">© VISIONOIR</a></footer><div id="notice" role="status" aria-live="polite"></div></div><dialog id="panel"></dialog><input type="file" id="project-file" hidden accept=".vfreq,.json,application/json">`;
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
  function editor() {
    const root = el('editor'),
      old = document.activeElement;
    const labels = root.contains(old)
      ? Object.entries(old.dataset).filter(([key]) =>
          ['action', 'field', 'index', 'id', 'pos', 'note', 'channel'].includes(key),
        )
      : [];
    const scroll = [...root.querySelectorAll('.scroll-zone')].map((z) => z.scrollLeft);
    root.innerHTML = renderEditor(s, t, audio);
    drawTick();
    root.querySelectorAll('.scroll-zone').forEach((z, i) => {
      if (scroll[i]) z.scrollLeft = scroll[i];
    });
    if (labels.length)
      root
        .querySelector(
          labels.map(([key, val]) => '[data-' + key + '="' + CSS.escape(val) + '"]').join(''),
        )
        ?.focus({ preventScroll: true });
  }
  function snapshot() {
    // Embedded PCM can be several MB. It is immutable after import, so history
    // can share the payload while cloning each editable track, note and setting.
    const source = { ...s.p, tracks: s.p.tracks.map(({ sample, ...track }) => track) };
    const p = structuredClone(source);
    p.tracks.forEach((tr, i) => {
      if (s.p.tracks[i].sample) tr.sample = { ...s.p.tracks[i].sample };
    });
    return { p, scene: s.scene, channel: s.channel, page: s.page, step: s.step };
  }
  function recall(v) {
    s.p = v.p;
    s.scene = v.scene;
    s.channel = v.channel;
    s.page = v.page;
    s.step = v.step;
    s.bank = Math.floor(s.channel / s.bankSize);
    s.selected.clear();
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
    saveTimer = setTimeout(() => save(s.p).catch(fail), 550);
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
  async function audition(ch, pitch, velocity = 0.85) {
    await engineReady();
    engine.trigger(ch, pitch, velocity);
    visual?.trigger(ch, velocity);
  }
  function noteBase(i = s.channel) {
    return ['kick', 'rumble', 'sub', 'industrial'].includes(s.p.tracks[i].instrument)
      ? 36
      : ['closed', 'open', 'ride', 'sampler'].includes(s.p.tracks[i].instrument)
        ? 60
        : 48;
  }
  const signal = { voices: [], level: 0, bass: 0, mid: 0, high: 0, beat: 0, bpm: s.p.bpm, scene: 0 };
  const spectrum = new Uint8Array(512),
    wave = new Uint8Array(512);
  function drawTick() {
    if (!el('clock')) return;
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
    document.querySelectorAll('meter[data-meter]').forEach((m) => {
      const [mode, id] = m.dataset.meter.split(':');
      m.value = (mode === 'peak' ? tick.peaks : mode === 'bus' ? tick.buses : tick.levels)?.[id] || 0;
    });
  }
  engine = audio.createEngine({
    onTick: (next) => {
      tick = next;
      s.playScene = next.scene;
      if (next.ended && playing) {
        playing = false;
        audioState = 'stopped';
        updateTransport();
        setState();
      }
      signal.voices = next.levels || [];
      signal.beat = Math.max(
        0,
        (next.absoluteStep ?? (next.bar || 0) * 16 + ((next.step || 0) % 16)) / 4,
      );
      signal.buses = next.buses || [];
      signal.bpm = s.p.bpm;
      signal.scene = next.scene;
      if (renderTask === undefined)
        renderTask = requestAnimationFrame(() => {
          renderTask = undefined;
          drawTick();
        });
    },
    onState: (state) => {
      if (state === 'interrupted' || state === 'suspended') {
        audioState = 'stopped';
        say(t('audioOff'));
      }
    },
    onError: fail,
  });
  function meter() {
    const canvas = el('scope'),
      an = engine.analyser;
    if (canvas && !document.hidden) {
      const c = canvas.getContext('2d');
      if (s.analyser !== 'history') c.clearRect(0, 0, 320, 82);
      const nums = playing || !off() || engine.analyser ? an : null;
      if (nums) {
        an.getByteFrequencyData(spectrum);
        const band = (a, b) => {
          let sum = 0;
          for (let i = a; i < b; i++) sum += spectrum[i];
          return sum / ((b - a) * 255);
        };
        signal.bass = band(1, 8);
        signal.mid = band(8, 60);
        signal.high = band(60, 220);
        signal.level = tick.masterRms?.length
          ? Math.min(
              1,
              Math.sqrt(tick.masterRms.reduce((sum, x) => sum + x * x, 0) / tick.masterRms.length),
            )
          : band(0, 220);
        const vals = tick.masterPeak || tick.peaks || [],
          peak = Math.max(0, ...vals);
        el('db').textContent = peak > 0 ? (20 * Math.log10(peak)).toFixed(1) + ' dBFS' : '−∞ dBFS';
      } else {
        spectrum.fill(0);
        signal.level = signal.bass = signal.mid = signal.high = 0;
      }
      if (s.analyser === 'scope') {
        if (nums) an.getByteTimeDomainData(wave);
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
          const f = Math.min(511, Math.round(2 ** ((81 - i) / 9)));
          const n = spectrum[f];
          c.fillStyle = 'rgb(' + Math.round(n * 0.77) + ',' + n + ',' + Math.round(n * 0.54) + ')';
          c.fillRect(319, i, 1, 1);
        }
      } else
        for (let i = 0; i < 60; i++) {
          const f = 1 + Math.round(Math.pow(i / 60, 2) * 350),
            v = spectrum[f] / 255;
          c.fillStyle = i < 36 ? '#bcc7b8' : '#d5f490';
          c.fillRect(i * 5.4, 81 - v * 78, 3.4, Math.max(1, v * 78));
        }
      const db = (n) => (n > 0 ? (20 * Math.log10(n)).toFixed(1) : '−∞');
      el('rms').textContent = (tick.masterRms || [0, 0]).map(db).join(' / ');
      el('corr').textContent = Number.isFinite(tick.correlation) ? tick.correlation.toFixed(2) : '—';
      el('clip-light').classList.toggle('clipping', !!tick.clipped);
    }
    setTimeout(meter, document.hidden ? 700 : 70);
  }
  function open(id, title, body) {
    const d = el('panel');
    if (!d.open) dialogTrigger = document.activeElement;
    activeDialog = id;
    d.innerHTML = `<div class="dialog-inner"><header><h2>${h(title)}</h2>${act('close', '×', { title: t('close') })}</header>${body}</div>`;
    if (!d.open) d.showModal();
  }
  function close() {
    if (el('panel').open) el('panel').close();
    activeDialog = undefined;
    if (dialogTrigger?.isConnected) dialogTrigger.focus();
  }
  function help() {
    open(
      'about',
      t('about'),
      `<p class="about-brand">FREQUENCY</p><p>The Underground Is Your Instrument.</p><ol><li>${h(t('guide1'))}</li><li>${h(t('guide2'))}</li><li>${h(t('guide3'))}</li></ol><kbd>Space</kbd> ▶ / ■ · <kbd>Esc</kbd> Panic · <kbd>1–8</kbd> Pads<p>Created, designed and developed by Flavio Giorgio Guarini.</p><a href="${href('/legal/')}">© VISIONOIR · MIT</a>`,
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
      ? `<div class="field-grid">${number(t('pitch') + ' MIDI', 'note:note', ev.note, 0, 127)}${number(t('velocity'), 'note:velocity', ev.velocity, 0, 1, 0.01)}${number(t('gate'), 'note:gate', ev.gate ?? 1, 0.05, 64, 0.05)}${number(t('probability'), 'note:probability', ev.probability ?? 1, 0, 1, 0.01)}${number('Ratchet', 'note:ratchet', ev.ratchet ?? 1, 1, 8)}${number('Microtiming', 'note:offset', ev.offset ?? 0, -0.49, 0.49, 0.01)}${number('1× / N', 'note:condition', ev.condition ?? 1, 1, 16)} ${select(
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
  function exportFields() {
    const fmt = fieldValue('format');
    const wav = ['wav', 'flac', 'aiff', 'stems'].includes(fmt),
      audioFmt = wav || fmt === 'mp3';
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
              : audioFmt;
      e.disabled = !on;
      e.closest('label').hidden = !on;
    }
    const rate = targetField('sample-rate');
    for (const opt of rate.options)
      opt.disabled = fmt === 'mp3' && ![44100, 48000].includes(+opt.value);
    if (rate.selectedOptions[0]?.disabled) rate.value = '48000';
    const estimate = el('render-estimate');
    if (estimate) {
      try {
        const spec = audio.estimateExport(s.p, {
          sampleRate: readNum('sample-rate', 48000),
          channels: readNum('channel-count', 2),
          bits: readNum('bits', 24),
          tail: readNum('render-tail', 0.35),
          scene: fieldValue('render-region') === 'scene' ? s.scene : null,
          startBar: readNum('start-bar', 1) - 1,
          bars: readNum('render-bars', 1),
        });
        estimate.textContent = audioFmt
          ? spec.seconds.toFixed(1) +
            ' s' +
            (wav
              ? ' · ' +
                ((spec.bytes * (fmt === 'stems' ? s.p.tracks.length : 1)) / 1048576).toFixed(1) +
                ' MiB'
              : '')
          : '';
      } catch {
        estimate.textContent = '';
      }
    }
  }
  function exportPane() {
    const bars = s.p.arrangement.reduce((n, e) => n + e.bars, 0);
    open(
      'export',
      t('export'),
      `<div class="field-grid">${select(t('export'), 'format', [['wav', 'WAV'], ['aiff', 'AIFF'], ['flac', 'FLAC'], ['midi', 'MIDI'], ['vfreq', '.vfreq'], ['json', 'JSON'], ['zip', 'ZIP · .vfreq + MIDI'], ['stems', 'ZIP · stems WAV'], ...(audio.renderMp3 ? [['mp3', 'MP3']] : [])].map(([k, n]) => option(k, n)).join(''))}${select('kbps', 'bitrate', [128, 192, 256, 320].map((v) => option(v, v, v === 320)).join(''))} ${select('Hz', 'sample-rate', audio.SAMPLE_RATES.map((v) => option(v, v, v === 48000)).join(''))}${select('Bit', 'bits', [16, 24, 32].map((v) => option(v, v === 32 ? '32 float' : v, v === 24)).join(''))}${select(t('output'), 'channel-count', [option(2, 'Stereo', true), option(1, 'Mono')].join(''))}${select(t('instrument'), 'render-track', option('mix', t('master'), true) + s.p.tracks.map((tr, i) => option('t' + i, tr.name)).join('') + (audio.BUSSES || []).map((b) => option('b' + b, 'Bus ' + b)).join(''))}${select(t('source'), 'render-region', option('song', t('arrangement'), true) + option('scene', t('scene')))}${select(t('master'), 'render-mastering', option('1', t('master'), true) + option('0', t('bypass')))}${select('Peak −0.54 dBFS', 'render-normalize', option('0', t('bypass'), true) + option('1', t('peak')))}${number('FX tail · s', 'render-tail', 0.35, 0, 30, 0.05)}${number(t('start') + ' · ' + t('bars'), 'start-bar', 1, 1, bars)}${number(t('length') + ' · ' + t('bars'), 'render-bars', bars, 1, bars)}</div><div class="bar-tools">${act('render', t('download'), { classes: 'play' })}${act('cancel-render', t('cancel'), { disabled: true })}</div><output id="render-estimate"></output><progress id="render-progress" max="1" value="0"></progress><output id="render-status" role="status"></output>`,
    );
    exportFields();
  }
  function settings() {
    open(
      'settings',
      t('settings'),
      `<div class="field-grid">${localeSelect()}${select(t('record'), 'record-mode', option('audio', 'Audio', s.recordMode !== 'video') + (visual?.getCanvas?.()?.captureStream && window.MediaRecorder ? option('video', 'Audio + Chromatic VJ', s.recordMode === 'video') : ''))}${slider(t('volume'), 'master:volume', s.p.master.volume)}${slider('Limiter', 'master:ceiling', s.p.master.ceiling, 0.1, 0.999, 0.001)}</div><div class="bar-tools">${act('motion', t('motion'), { pressed: motion })}${act('protect', t('protectedMode'), { pressed: s.protect })}${act('offline', t('offline') + ' ↓', { disabled: !('serviceWorker' in navigator) })}${act('erase', t('erase'))}</div><p>${h(t('storageHelp'))} ${h(t('offlineHelp'))}</p><h3>MIDI / Audio I/O</h3><div class="bar-tools">${act('preflight', t('check'))}${act('midi', 'MIDI · ' + t('connect'), { disabled: !navigator.requestMIDIAccess })}${act('learn', 'MIDI ' + t('learn'), { pressed: learn, disabled: !midi })} ${act('midi-clock', 'MIDI clock', { pressed: !!s.midiClock, disabled: !midi })}${act('audio-output', t('output'), { disabled: !navigator.mediaDevices?.selectAudioOutput || !engine.setOutput })}</div><p id="midi-state">${midi ? h([...midi.inputs.values()].map((v) => v.name).join(' · ')) : !navigator.requestMIDIAccess ? t('unsupported') : ''}</p>${act('about', t('help'))} <a href="${href('/legal/')}">© VISIONOIR</a>`,
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
      [t('output'), outputDevice?.label || t('device')],
      [t('storage'), storageAvailable ? ready : no],
      [t('offline'), registered?.active ? ready : unknown],
    ];
    open(
      'preflight',
      t('check'),
      '<dl class="preflight">' +
        values.map(([k, v]) => `<div><dt>${h(k)}</dt><dd>${h(v)}</dd></div>`).join('') +
        '</dl>' +
        act('save', t('save')),
    );
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
    const fmt = fieldValue('format'),
      rate = readNum('sample-rate', 48000),
      bits = readNum('bits', 24),
      count = readNum('channel-count', 2);
    const total = s.p.arrangement.reduce((n, a) => n + a.bars, 0),
      startBar = Math.min(total - 1, Math.max(0, readNum('start-bar', 1) - 1)),
      bars = Math.min(total - startBar, Math.max(1, readNum('render-bars', total)));
    const dest = fieldValue('render-track'),
      opts = {
        sampleRate: rate,
        bits,
        channels: count,
        startBar,
        bars,
        scene: fieldValue('render-region') === 'scene' ? s.scene : null,
        tail: readNum('render-tail', 0.35),
        mastering: fieldValue('render-mastering') !== '0',
        normalize: fieldValue('render-normalize') === '1',
      };
    if (dest?.startsWith('t')) opts.track = Number(dest.slice(1));
    if (dest?.startsWith('b')) opts.bus = dest.slice(1);
    const filename =
      (s.p.name || 'Frequency').replace(/[^\p{L}\p{N} _-]+/gu, '').slice(0, 80) || 'Frequency';
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
        case 'stems': {
          const files = [],
            p = structuredClone(s.p);
          const expected = p.tracks.length * rate * count * (bits / 8) * ((bars * 240) / p.bpm + 2);
          if (expected > 430 * 1024 * 1024) throw new RangeError(t('length') + ' / ' + t('bars'));
          for (let i = 0; i < p.tracks.length; i++) {
            const b = await audio.renderWav(p, {
              ...opts,
              bus: undefined,
              track: i,
              onProgress: (f) => progress((i + f) / p.tracks.length),
            });
            files.push({ name: pad(i + 1) + '-' + p.tracks[i].instrument + '.wav', blob: b });
          }
          blob = await audio.renderZip(p, files);
          ext = 'zip';
          break;
        }
        case 'flac':
          blob = await audio.renderFlac(s.p, opts);
          break;
        case 'aiff':
          blob = await audio.renderAiff(s.p, opts);
          break;
        case 'mp3':
          blob = await audio.renderMp3(s.p, { ...opts, bitrate: readNum('bitrate', 320) });
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
        const canvas = visual?.getCanvas?.();
        if (!canvas?.captureStream) throw Error('Video');
        picture = canvas.captureStream(24);
      }
      const stream = video
        ? new MediaStream([...audioStream.getAudioTracks(), ...picture.getVideoTracks()])
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
        picture?.getTracks().forEach((x) => x.stop());
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
      picture?.getTracks().forEach((x) => x.stop());
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
  function moveNotes(delta) {
    const pat = pattern(),
      set = [...(s.selected.size ? s.selected : [s.step])].filter((i) => pat.steps[i]);
    if (
      !set.length ||
      set.some(
        (i) =>
          i + delta < 0 ||
          i + delta >= pat.length ||
          (pat.steps[i + delta] && !set.includes(i + delta)),
      )
    )
      return;
    const values = set.map((i) => pat.steps[i]);
    mutate(() => {
      for (const i of set) pat.steps[i] = null;
      set.forEach((i, j) => (pat.steps[i + delta] = values[j]));
      s.selected = new Set(set.map((i) => i + delta));
      s.step += delta;
      s.page = Math.floor(s.step / 16);
    });
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
      case 'step': {
        s.channel = Number(btn.dataset.channel);
        s.step = Number(btn.dataset.pos);
        s.selected = new Set([s.step]);
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
        s.step = pos;
        if (s.multi && pat.steps[pos]?.note === pitch) {
          s.selected.has(pos) ? s.selected.delete(pos) : s.selected.add(pos);
          editor();
          return;
        }
        s.selected = new Set([pos]);
        mutate(() => {
          if (pat.steps[pos]) pat.steps[pos].note = pitch;
          else pat.steps[pos] = newNote(pitch);
        });
        if (!playing) await audition(s.channel, pitch);
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
      case 'quant':
        mutate(() =>
          pattern().steps.forEach((e) => {
            if (e) e.offset = 0;
          }),
        );
        return;
      case 'scale-notes':
        mutate(() => {
          const root = s.root ?? 36,
            scale = scales[s.scale ?? 1];
          pattern().steps.forEach((e) => {
            if (!e) return;
            const pitch = e.note,
              oct = Math.floor((pitch - root) / 12),
              base = root + 12 * oct;
            e.note = Math.max(
              0,
              Math.min(
                127,
                base +
                  scale.reduce((a, b) =>
                    Math.abs(base + b - pitch) < Math.abs(base + a - pitch) ? b : a,
                  ),
              ),
            );
          });
        });
        return;
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
        mutate(() => s.p.arrangement.push({ scene: s.scene, bars: 4 }));
        return;
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
      case 'clip-up':
      case 'clip-down':
        mutate(() => {
          const j = i + (id === 'clip-up' ? -1 : 1),
            a = s.p.arrangement;
          [a[i], a[j]] = [a[j], a[i]];
        });
        return;
      case 'clip-duplicate':
        mutate(() => s.p.arrangement.splice(i + 1, 0, structuredClone(s.p.arrangement[i])));
        return;
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
        settings();
        return;
      case 'learn':
        learn = !learn;
        pendingMidi = undefined;
        settings();
        if (learn) close();
        return;
      case 'audio-output':
        if (engine.setOutput && navigator.mediaDevices?.selectAudioOutput) {
          await engineReady();
          outputDevice = await navigator.mediaDevices.selectAudioOutput();
          await engine.setOutput(outputDevice.deviceId);
          say(outputDevice.label);
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
          `<div class="bar-tools">${act('confirm-erase', t('confirm'))}${act('close', t('cancel'))}</div>`,
        );
        return;
      case 'confirm-erase':
        clearTimeout(saveTimer);
        await removeSaved();
        stop();
        undo = [];
        redo = [];
        s.p = audio.createProject('blank');
        resetSelection();
        visual?.setState({});
        updateTransport();
        renderTabs();
        editor();
        close();
        say(t('ready'));
        return;
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
    midi = await navigator.requestMIDIAccess({ sysex: false });
    let previousClock,
      beats = 0;
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
    function receive(message) {
      const [status, a, b] = message.data;
      if (status === 0xf8) {
        if (++beats % 24 === 0) {
          const now = performance.now();
          if (previousClock && s.midiClock) {
            const bpm = Math.round(60000 / (now - previousClock));
            if (bpm >= 40 && bpm <= 300) {
              s.p.bpm = bpm;
              if (engine.control) engine.control('tempo', bpm);
              else engine.update(s.p);
              updateTransport();
            }
          }
          previousClock = now;
        }
        return;
      }
      const channel = status & 15,
        cmd = status >> 4;
      if (cmd === 11) {
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
        void audition(s.channel, a, b / 127).catch(fail);
      } else if (cmd === 8 || (cmd === 9 && b === 0)) engine.release(s.channel, a);
      else if (status === 0xfa && s.midiClock) {
        void play(s.view === 'arrangement');
      } else if (status === 0xfc && s.midiClock) stop();
    }
    function bind() {
      for (const input of midi.inputs.values()) input.onmidimessage = receive;
    }
    bind();
    midi.onstatechange = () => {
      bind();
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
      if (node.id === 'sample-file') {
        if (node.files[0]) {
          const target = track(),
            project = s.p;
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
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (e.key === 'Escape') {
      if (el('panel').open) return;
      stop();
      return;
    }
    if (el('panel').open) return;
    if ((e.ctrlKey || e.metaKey) && ['s', 'z'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      void action({
        dataset: { action: e.key.toLowerCase() === 's' ? 'save' : e.shiftKey ? 'redo' : 'undo' },
      }).catch(fail);
      return;
    }
    if (e.code === 'Space' && !e.target.closest('button,a,summary')) {
      e.preventDefault();
      playing ? stop() : void play(s.view === 'arrangement');
    }
    if (/^Digit[1-8]$/.test(e.code)) {
      const i = Number(e.code.slice(-1)) - 1;
      if (s.p.tracks[i]) void audition(i, noteBase(i)).catch(fail);
    }
    if (e.key === 'Enter' && e.target.matches('[data-pad]')) {
      const i = +e.target.dataset.pad;
      void audition(i, noteBase(i)).catch(fail);
    }
  });
  document.addEventListener('keyup', (e) => {
    if (/^Digit[1-8]$/.test(e.code)) {
      const i = Number(e.code.slice(-1)) - 1;
      if (s.p.tracks[i]) engine.release(i, noteBase(i));
    }
  });
  window.addEventListener('pagehide', () => {
    if (saveTimer && storageAvailable) {
      clearTimeout(saveTimer);
      void save(s.p).catch(() => {});
    }
    engine.stop();
    visual?.dispose();
  });
  window.addEventListener('beforeunload', (e) => {
    if (recUnclosed || exportController) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && storageAvailable) {
      clearTimeout(saveTimer);
      void save(s.p).catch(fail);
    }
  });
  pageAttrs();
  shell();
  el('panel').addEventListener('cancel', (e) => {
    if (exportController) e.preventDefault();
    else activeDialog = undefined;
  });
  if (!storageAvailable) say(t('storage') + ' · ' + t('unsupported'));
  meter();
  try {
    const { mountChromatic } = await import('./chromatic/index.js');
    visual = await mountChromatic(el('chromatic'), {
      locale: lang,
      state: s.p.visual,
      getSignal: () => signal,
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
