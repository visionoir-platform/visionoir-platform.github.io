import { deviceTilt, mountDeviceTilt } from '../../src/device-tilt.js';
import { mountDeviceShake } from '../../src/device-shake.js';
import { tiltLabels } from '../../src/tilt-labels.js';
import { setLogoNegative } from '../../src/logo-polarity.js';
import { buildStage } from './stage.js';
import {
  normalizeSignal,
  normalizeVisual,
  readPresetBank,
  sceneLook,
  defaultVisual,
  instruments,
  modes,
  parameters,
  routes,
  unit,
} from './model.js';
import { labels } from './labels.js';
import { editLook, lookTime, recallLook } from './look-transition.js';
import { projectorUrl } from './projector-url.js';
import './styles.css';

import {chromaticPresetKey as presetKey} from '../storage.js';
const node = (name, cls) => {
  const n = document.createElement(name);
  if (cls) n.className = cls;
  return n;
};
const add = (parent, ...children) => {
  parent.append(...children);
  return parent;
};
const opt = (value, title) => new Option(title, value);
const syncToggle = (button, yes) => button.setAttribute('aria-pressed', String(!!yes));
function button(title, click) {
  const b = node('button');
  b.type = 'button';
  b.textContent = title;
  b.addEventListener('click', click);
  return b;
}
function select(values) {
  const s = node('select');
  s.append(...values.map(([v, t]) => opt(v, t)));
  return s;
}

export async function mountChromatic(
  host,
  { getSignal = () => ({}), state, locale = 'it', onChange = () => {} } = {},
) {
  let cueId = 0, lookCue = null;
  let visual = normalizeVisual(state),
    lang = locale,
    cueScene = -1,
    autoPending = false,
    activeParam = 'intensity',
    routeIndex = 0,
    learning = false;
  let stage,
    outputWin = null,
    outputKey = '',
    outputVisible = false,
    lastFrame = -Infinity,
    timer = 0,
    disposed = false,
    lastSentState = null;
  const currentSignal = normalizeSignal();
  function loadBank(project) {
    if (Array.isArray(project?.presetBank?.slots)) return readPresetBank(project.presetBank);
    try {
      return readPresetBank(JSON.parse(localStorage.getItem(presetKey)));
    } catch {
      return readPresetBank();
    }
  }
  let bank = loadBank(state);
  function projectVisual() {
    return structuredClone(bank.slots.some(Boolean) ? {...visual, presetBank: bank} : visual);
  }
  const shell = node('section', 'chromatic-panel'),
    surface = node('div', 'chromatic-surface'),
    heading = node('header', 'chromatic-head'),
    title = node('strong');
  title.textContent = 'CHROMATIC ENGINE';
  shell.setAttribute('aria-label', 'VISIONOIR Chromatic Engine');
  const top = node('div', 'chromatic-bar'),
    panel = node('details', 'chromatic-rack'),
    summary = node('summary'),
    rack = node('div', 'chromatic-controls'),
    message = node('p', 'chromatic-message');
  message.setAttribute('role', 'status');
  add(heading, title);
  add(panel, summary, rack);
  add(shell, heading, surface, top, panel, message);
  host.append(shell);
  const tiltButton = button('', () => { void tilt.request(); });
  tiltButton.className = 'chromatic-tilt';
  const tiltNotice = node('span', 'chromatic-tilt-notice');
  tiltNotice.setAttribute('role', 'status');
  const tilt = mountDeviceTilt(syncTilt);
  const negative = () => document.documentElement.classList.contains('logo-negative');
  const shake = mountDeviceShake({onToggle: () => setLogoNegative(!negative())});
  window.addEventListener('visionoir:logo-negative', tellOutputMaterial);
  function syncTilt() {
    const text = tiltLabels(lang);
    tiltButton.textContent = text.tiltEnable;
    tiltButton.hidden = !tilt.showControl;
    tiltButton.setAttribute('aria-busy', String(tilt.status === 'waiting'));
    tiltNotice.textContent = tilt.showControl && tilt.status === 'unavailable' ? text.tiltUnavailable : '';
  }
  const buttons = {};
  let localized, parameterSelect, voiceSelect, routeSelect, slider, level, modeSelect, quality, colorInput, slotSelect;
  let priorQuality = visual.quality;
  function update(notify = true) {
    tilt.setEnabled(!visual.reduced && !visual.freeze);
    syncTilt();
    if (modeSelect) modeSelect.value = visual.mode;
    if (quality) quality.value = visual.quality;
    for (const k of ['freeze', 'reduced', 'auto', 'sync']) if (buttons[k]) syncToggle(buttons[k], visual[k]);
    if (buttons.learn) syncToggle(buttons.learn, learning);
    if (slider) {
      slider.value = Math.round(100 * visual[activeParam]);
      level.value = slider.value + '%';
      slider.setAttribute('aria-label', localized[activeParam]);
    }
    if (routeSelect) routeSelect.value = visual.mapping[routeIndex];
    if (colorInput) colorInput.value = visual.color || modes.find((x) => x[0] === visual.mode)[2];
    if (priorQuality !== visual.quality) {
      priorQuality = visual.quality;
      stage?.resize?.();
    }
    stage?.invalidate();
    if (notify) onChange(projectVisual());
  }
  function recall(next) {
    visual = next;
    lookCue = recallLook(++cueId, visual, lookTime());
    update();
  }
  function mutate(change, notify = true) {
    if (lookCue) editLook(lookCue, change, lookTime());
    visual = { ...visual, ...change };
    update(notify);
  }
  function toggle(k) {
    mutate({ [k]: !visual[k] });
  }
  function syncScene(scene, running) {
    if (visual.freeze || !Number.isInteger(scene) || scene < 0) return;
    if (scene !== cueScene) {
      cueScene = scene;
      const cue = visual.automation.find((entry) => entry.scene === scene);
      autoPending = !cue && visual.auto;
      if (cue) recall({ ...visual, ...cue.look, mode: cue.mode });
    }
    if (autoPending && running) {
      autoPending = false;
      if (visual.auto) mutate({ mode: modes[scene % modes.length][0], color: '' });
    }
  }
  function getFrame() {
    const frame = normalizeSignal(getSignal() || {}, currentSignal);
    syncScene(frame.scene, frame.level > 0.012);
    return frame;
  }
  function stopOutputFrames() {
    clearInterval(timer);
    timer = 0;
    outputVisible = false;
  }
  function tellOutputMaterial() {
    if (!outputWin || outputWin.closed) return;
    outputWin.postMessage({type:'visionoir.visual.material', id:outputKey, logoNegative:negative()}, location.origin);
  }
  function attachOutputState(packet) {
    // Cues and MIDI mappings are interpreted by the studio; the projector renders the resulting look.
    const { automation, midi, ...renderState } = visual;
    packet.state = renderState;
    packet.lookCue = lookCue;
    lastSentState = visual;
  }
  function tellOutput(force = false) {
    if (!outputVisible) return;
    if (!outputWin || outputWin.closed) {
      stopOutputFrames();
      return;
    }
    if (!force && lastSentState === visual && visual.freeze) return;
    const now = performance.now();
    if (!force && now - lastFrame < 50) return;
    lastFrame = now;
    const packet = { type: 'visionoir.visual.frame', id: outputKey, signal: getFrame(), viewOffset: [deviceTilt.x,deviceTilt.y] };
    if (force || lastSentState !== visual) attachOutputState(packet);
    outputWin.postMessage(packet, location.origin);
  }
  function trigger(index, value = 1) {
    if (!Number.isInteger(index) || index < 0 || index >= instruments.length || !Number.isFinite(value))
      return;
    value = unit(value);
    stage?.trigger(index, value);
    if (outputVisible && outputWin && !outputWin.closed) {
      const packet = { type: 'visionoir.visual.hit', id: outputKey, index, value };
      // A performer can remap a voice and tap it before the next periodic frame.
      if (lastSentState !== visual) attachOutputState(packet);
      outputWin.postMessage(packet, location.origin);
    }
  }
  function external() {
    if (outputWin && !outputWin.closed) {
      outputWin.focus();
      return;
    }
    const id = crypto.randomUUID?.() || crypto.getRandomValues(new Uint32Array(4)).join('-');
    outputKey = id;
    outputWin = window.open(projectorUrl(location, lang, id), 'visionoir-vj-' + id, 'popup,width=1024,height=640');
    if (!outputWin) {
      message.textContent = localized.blocked;
      return;
    }
    message.textContent = '';
    stopOutputFrames();
    lastSentState = null;
  }
  function noteEdges(notes) {
    if (visual.freeze || !(notes.releases || notes.attacks.some(value => value > 0))) return;
    stage?.noteEdges?.(notes.attacks, notes.gates, notes.releases);
    if (outputVisible && outputWin && !outputWin.closed) {
      const packet = { type:'visionoir.visual.notes', id:outputKey, attacks:notes.attacks,
        gates:notes.gates, releases:notes.releases, accents:notes.accents };
      if (lastSentState !== visual) attachOutputState(packet);
      outputWin.postMessage(packet, location.origin);
    }
  }
  const outputReady = (e) => {
    if (e.origin !== location.origin || e.source !== outputWin || e.data?.id !== outputKey) return;
    if (e.data.type !== 'visionoir.visual.ready' && e.data.type !== 'visionoir.visual.visibility') return;
    stopOutputFrames();
    outputVisible = e.data.visible === true;
    tellOutputMaterial();
    if (outputVisible) {
      tellOutput(true);
      timer = setInterval(tellOutput, 55);
    }
  };
  window.addEventListener('message', outputReady);
  const exitExpanded = button('×', () => surface.classList.remove('is-expanded'));
  exitExpanded.className = 'chromatic-exit';
  surface.append(exitExpanded);
  function fullscreen() {
    if (document.fullscreenElement === surface) {
      document.exitFullscreen?.();
      return;
    }
    if (surface.requestFullscreen)
      surface.requestFullscreen().catch(() => surface.classList.toggle('is-expanded'));
    else surface.classList.toggle('is-expanded');
  }
  const escape = (e) => {
    if (e.key === 'Escape') surface.classList.remove('is-expanded');
  };
  window.addEventListener('keydown', escape);
  function randomize() {
    const r = () => 0.25 + Math.random() * 0.54;
    mutate({
      mode: modes[Math.floor(Math.random() * modes.length)][0],
      warp: r(),
      refraction: r(),
      rebuild: r(),
      turbulence: r(),
      phase: r(),
      color: '',
    });
  }
  function showBank() {
    if (!slotSelect) return;
    for (const [index, saved] of bank.slots.entries()) {
      const name = modes.find(([id]) => id === saved?.mode)?.[1] || '—';
      slotSelect.options[index].textContent = String(index + 1).padStart(2, '0') + ' / ' + name;
    }
    slotSelect.selectedIndex = bank.selected;
    buttons.recall.disabled = !bank.slots[bank.selected];
  }
  function storePreset() {
    bank.slots[bank.selected] = normalizeVisual(visual);
    try { localStorage.setItem(presetKey, JSON.stringify(bank)); }
    catch { /* The bank is also included in the project and in .vfreq exports. */ }
    showBank();
    onChange(projectVisual());
  }
  function restorePreset() {
    const saved = bank.slots[bank.selected];
    if (!saved) return;
    recall(normalizeVisual(saved));
  }
  function renderControls() {
    localized = labels(lang);
    exitExpanded.setAttribute('aria-label', localized.fullscreen);
    heading.replaceChildren(title);
    top.replaceChildren();
    rack.replaceChildren();
    summary.textContent = localized.rack;
    const labeled = (dest, key, control) => {
      const label = node('label'),
        t = node('span');
      t.textContent = localized[key];
      control.setAttribute('aria-label', localized[key]);
      add(label, t, control);
      dest.append(label);
      return label;
    };
    modeSelect = select(modes.map(([k, t], i) => [k, String(i + 1).padStart(2, '0') + ' / ' + t]));
    modeSelect.setAttribute('aria-label', localized.scene);
    modeSelect.onchange = () => mutate({ mode: modeSelect.value, color: '' });
    heading.append(modeSelect);
    for (const [k, action] of Object.entries({
      freeze: () => toggle('freeze'),
      trigger: () => trigger(routeIndex, 1),
      fullscreen,
      output: external,
    })) {
      buttons[k] = button(localized[k], action);
      top.append(buttons[k]);
    }
    top.append(tiltButton, tiltNotice);
    parameterSelect = select(Object.keys(parameters).map((k) => [k, localized[k]]));
    parameterSelect.value = activeParam;
    parameterSelect.onchange = () => {
      activeParam = parameterSelect.value;
      update(false);
    };
    labeled(rack, 'control', parameterSelect);
    slider = node('input', 'chromatic-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    level = node('output');
    const sliderLabel = labeled(rack, 'value', slider);
    sliderLabel.append(level);
    slider.oninput = () => mutate({ [activeParam]: Number(slider.value) / 100 });
    colorInput = node('input');
    colorInput.type = 'color';
    colorInput.oninput = () => mutate({ color: colorInput.value });
    labeled(rack, 'color', colorInput);
    quality = select([
      ['auto', localized.autoQuality],
      ['low', localized.low],
      ['high', localized.high],
    ]);
    quality.onchange = () => mutate({ quality: quality.value });
    labeled(rack, 'quality', quality);
    for (const [k, action] of Object.entries({
      sync: () => toggle('sync'),
      reduced: () => toggle('reduced'),
      auto: () => { cueScene = -1; toggle('auto'); },
      random: randomize,
      reset: () => {
        lookCue = null;
        visual = defaultVisual();
        update();
      },
      learn: () => {
        learning = !learning;
        update(false);
      },
    })) {
      buttons[k] = button(localized[k], action);
      rack.append(buttons[k]);
    }
    voiceSelect = select(instruments.map((label, i) => [String(i), label]));
    voiceSelect.value = String(routeIndex);
    voiceSelect.onchange = () => {
      routeIndex = Number(voiceSelect.value);
      update(false);
    };
    labeled(rack, 'mapping', voiceSelect);
    routeSelect = select(routes.map((key, i) => [key, localized.routeLabels[i]]));
    routeSelect.onchange = () => {
      const mapping = visual.mapping.slice();
      mapping[routeIndex] = routeSelect.value;
      mutate({ mapping });
    };
    labeled(rack, 'response', routeSelect);
    const cue = button(localized.storeCue, () => {
      const scene = normalizeSignal(getSignal() || {}, currentSignal).scene;
      mutate({
        automation: [...visual.automation.filter((v) => v.scene !== scene), { scene, mode: visual.mode, look: sceneLook(visual) }],
      });
    });
    rack.append(cue);
    slotSelect = select(bank.slots.map((_, index) => [String(index), '']));
    slotSelect.onchange = () => {
      bank.selected = slotSelect.selectedIndex;
      showBank();
      if (bank.slots.some(Boolean)) onChange(projectVisual());
    };
    labeled(rack, 'presetSlot', slotSelect);
    buttons.recall = button(localized.recall, restorePreset);
    rack.append(button(localized.store, storePreset), buttons.recall);
    showBank();
    update(false);
  }
  renderControls();
  stage = await buildStage(surface, { getSignal: getFrame, getState: () => visual, getLookCue: () => lookCue });
  function handleCC(channel, cc, value) {
    const key = channel + ':' + cc;
    if (learning) {
      learning = false;
      mutate({ midi: { ...visual.midi, [key]: activeParam } });
    }
    const param = visual.midi[key];
    if (param) {
      mutate({ [param]: unit(value > 1 ? value / 127 : value) });
      return true;
    }
    return false;
  }
  return {
    getState: projectVisual,
    getCanvas: () => stage.captureCanvas?.() ?? null,
    startRecording: fps => stage.startRecording(fps),
    setState: (v) => {
      lookCue = null;
      visual = normalizeVisual(v);
      bank = loadBank(v);
      cueScene = -1;
      autoPending = false;
      showBank();
      update(false);
    },
    setLocale: (v) => {
      lang = v;
      renderControls();
    },
    trigger,
    syncScene,
    sendOutputFrame: tellOutput,
    noteEdges,
    setMotion: (v) => mutate({ reduced: !v }, false),
    handleCC,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      if (outputWin && !outputWin.closed) outputWin.close();
      window.removeEventListener('message', outputReady);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('visionoir:logo-negative', tellOutputMaterial);
      tilt.dispose();
      shake.dispose();
      stage?.dispose();
      shell.remove();
    },
  };
}

export async function mountVJ(host) {
  const key = new URL(location.href).searchParams.get('output');
  const box = node('div', 'chromatic-projector'),
    surface = node('div', 'chromatic-surface');
  add(box, surface);
  host.replaceChildren(box);
  let lookCue = null,
    state = defaultVisual(),
    frame = normalizeSignal(),
    stage;
  const projectedTilt = { x: 0, y: 0 };
  function applyState(packet) {
    if (!packet.state) return;
    lookCue = packet.lookCue || null;
    const previousQuality = state.quality;
    state = normalizeVisual(packet.state);
    if (state.quality !== previousQuality) stage?.resize?.();
    stage?.invalidate();
  }
  const receive = (e) => {
    if (e.origin !== location.origin || e.source !== window.opener || !key || e.data?.id !== key) return;
    if (e.data.type === 'visionoir.visual.material') {
      if (typeof e.data.logoNegative === 'boolean') setLogoNegative(e.data.logoNegative);
      return;
    }
    if (e.data.type === 'visionoir.visual.notes') {
      const { attacks, gates, releases } = e.data;
      if (attacks instanceof Float32Array && attacks.length === instruments.length &&
          gates instanceof Float32Array && gates.length === instruments.length && Number.isInteger(releases)) {
        applyState(e.data);
        stage?.noteEdges?.(attacks, gates, releases);
      }
      return;
    }
    if (e.data.type === 'visionoir.visual.hit') {
      const { index, value } = e.data;
      if (Number.isInteger(index) && index >= 0 && index < instruments.length && Number.isFinite(value)) {
        applyState(e.data);
        stage?.trigger(index, unit(value));
      }
      return;
    }
    if (e.data.type !== 'visionoir.visual.frame') return;
    applyState(e.data);
    frame = normalizeSignal(e.data.signal || {}, frame);
    const offset = e.data.viewOffset;
    if (Array.isArray(offset) && offset.length === 2 && offset.every(Number.isFinite)) {
      projectedTilt.x = Math.max(-1, Math.min(1, offset[0]));
      projectedTilt.y = Math.max(-1, Math.min(1, offset[1]));
    }
    stage?.invalidate();
  };
  window.addEventListener('message', receive);
  const full = () => {
    if (!document.fullscreenElement) box.requestFullscreen?.().catch(() => {});
  };
  box.addEventListener('dblclick', full);
  stage = await buildStage(surface, { getState: () => state, getSignal: () => frame, getLookCue: () => lookCue, tilt: projectedTilt });
  const reportVisibility = (type) =>
    window.opener?.postMessage(
      {
        type,
        id: key,
        visible: !document.hidden && stage.getRenderState() === 'webgl',
      },
      location.origin,
    );
  const visibility = () => reportVisibility('visionoir.visual.visibility');
  const renderObserver = new MutationObserver(visibility);
  renderObserver.observe(surface, { attributes: true, attributeFilter: ['data-render'] });
  document.addEventListener('visibilitychange', visibility);
  reportVisibility('visionoir.visual.ready');
  const clean = () => {
    renderObserver.disconnect();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('message', receive);
    window.removeEventListener('pagehide', clean);
    box.removeEventListener('dblclick', full);
    stage.dispose();
    box.remove();
  };
  window.addEventListener('pagehide', clean, { once: true });
  return { dispose: clean };
}
