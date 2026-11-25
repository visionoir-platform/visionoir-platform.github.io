import { deviceTilt, mountDeviceTilt } from '../../src/device-tilt.js';
import { buildStage } from './stage.js';
import {
  normalizeSignal,
  normalizeVisual,
  defaultVisual,
  instruments,
  modes,
  parameters,
  routes,
  unit,
} from './model.js';
import { labels } from './labels.js';
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
  let visual = normalizeVisual(state),
    lang = locale,
    cueScene = -1,
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
  const tiltButton = node('button');
  tiltButton.type = 'button';
  tiltButton.className = 'chromatic-tilt';
  tiltButton.hidden = true;
  const tiltNotice = node('span', 'chromatic-tilt-notice');
  tiltNotice.setAttribute('role', 'status');
  let getTiltLabels, loadingTiltLabels;
  const tilt = mountDeviceTilt(syncTilt);
  function syncTilt() {
    tiltButton.hidden = !tilt.showControl || !getTiltLabels;
    if (tilt.showControl && !getTiltLabels && !loadingTiltLabels) {
      loadingTiltLabels = import('../../src/tilt-labels.js').then(module => {
        getTiltLabels = module.tiltLabels;
        if (!disposed) syncTilt();
      }).catch(() => { loadingTiltLabels = null; });
    }
    if (getTiltLabels) {
      const text = getTiltLabels(lang);
      tiltButton.textContent = text.tiltEnable;
      tiltNotice.textContent = tilt.showControl && tilt.status === 'unavailable' ? text.tiltUnavailable : '';
    }
    tiltButton.setAttribute('aria-busy', String(tilt.status === 'waiting'));
  }
  tiltButton.onclick = () => { void tilt.request(); };
  const buttons = {};
  let localized, parameterSelect, voiceSelect, routeSelect, slider, level, modeSelect, quality, colorInput;
  function update(notify = true) {
    visual = normalizeVisual(visual);
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
    stage?.invalidate();
    if (notify) onChange(structuredClone(visual));
  }
  function mutate(change, notify = true) {
    visual = { ...visual, ...change };
    update(notify);
  }
  function toggle(k) {
    mutate({ [k]: !visual[k] });
  }
  function getFrame() {
    const frame = normalizeSignal(getSignal() || {}, currentSignal);
    if (frame.scene !== cueScene) {
      cueScene = frame.scene;
      const cue = visual.automation.find((x) => x.scene === cueScene);
      if (cue) mutate({ mode: cue.mode });
      else if (visual.auto && frame.level > 0.012) mutate({ mode: modes[cueScene % modes.length][0] });
    }
    return frame;
  }
  function stopOutputFrames() {
    clearInterval(timer);
    timer = 0;
    outputVisible = false;
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
    if (force || lastSentState !== visual) {
      packet.state = visual;
      lastSentState = visual;
    }
    outputWin.postMessage(packet, location.origin);
  }
  function trigger(index, value = 1) {
    if (!Number.isInteger(index) || index < 0 || index >= instruments.length || !Number.isFinite(value))
      return;
    value = unit(value);
    stage?.trigger(index, value);
    if (outputVisible && outputWin && !outputWin.closed) {
      outputWin.postMessage({ type: 'visionoir.visual.hit', id: outputKey, index, value }, location.origin);
    }
  }
  function external() {
    if (outputWin && !outputWin.closed) {
      outputWin.focus();
      return;
    }
    const id = crypto.randomUUID?.() || String(Date.now());
    const url = new URL(location.href);
    url.searchParams.set('view', 'vj');
    url.searchParams.set('output', id);
    url.hash = '';
    outputKey = id;
    outputWin = window.open(url.href, 'visionoir-vj-' + id, 'popup,width=1024,height=640');
    if (!outputWin) {
      message.textContent = localized.blocked;
      return;
    }
    message.textContent = '';
    stopOutputFrames();
    lastSentState = null;
  }
  const outputReady = (e) => {
    if (e.origin !== location.origin || e.source !== outputWin || e.data?.id !== outputKey) return;
    if (e.data.type !== 'visionoir.visual.ready' && e.data.type !== 'visionoir.visual.visibility') return;
    stopOutputFrames();
    outputVisible = e.data.visible === true;
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
  function restorePreset() {
    try {
      const saved = localStorage.getItem(presetKey);
      if (saved) {
        visual = normalizeVisual(JSON.parse(saved));
        update();
      }
    } catch {
      /* private browsing */
    }
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
    quality.onchange = () => {
      mutate({ quality: quality.value });
      stage?.resize?.();
    };
    labeled(rack, 'quality', quality);
    for (const [k, action] of Object.entries({
      sync: () => toggle('sync'),
      reduced: () => toggle('reduced'),
      auto: () => toggle('auto'),
      random: randomize,
      reset: () => {
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
      const scene = getFrame().scene;
      mutate({
        automation: [...visual.automation.filter((v) => v.scene !== scene), { scene, mode: visual.mode }],
      });
    });
    rack.append(cue);
    rack.append(
      button(localized.store, () => {
        try {
          localStorage.setItem(presetKey, JSON.stringify(visual));
        } catch {
          /* .vfreq export remains available */
        }
      }),
      button(localized.recall, restorePreset),
    );
    update(false);
  }
  renderControls();
  stage = await buildStage(surface, { getSignal: getFrame, getState: () => visual });
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
    getState: () => structuredClone(visual),
    getCanvas: () => stage.captureCanvas?.() ?? null,
    startRecording: fps => stage.startRecording(fps),
    setState: (v) => {
      visual = normalizeVisual(v);
      update(false);
    },
    setLocale: (v) => {
      lang = v;
      renderControls();
    },
    trigger,
    sendOutputFrame: tellOutput,
    setMotion: (v) => mutate({ reduced: !v }, false),
    handleCC,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      if (outputWin && !outputWin.closed) outputWin.close();
      window.removeEventListener('message', outputReady);
      window.removeEventListener('keydown', escape);
      tilt.dispose();
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
  let state = defaultVisual(),
    frame = normalizeSignal(),
    stage;
  const projectedTilt = { x: 0, y: 0 };
  const receive = (e) => {
    if (e.origin !== location.origin || e.source !== window.opener || !key || e.data?.id !== key) return;
    if (e.data.type === 'visionoir.visual.hit') {
      const { index, value } = e.data;
      if (Number.isInteger(index) && index >= 0 && index < instruments.length && Number.isFinite(value)) {
        stage?.trigger(index, unit(value));
      }
      return;
    }
    if (e.data.type !== 'visionoir.visual.frame') return;
    if (e.data.state) state = normalizeVisual(e.data.state);
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
  stage = await buildStage(surface, { getState: () => state, getSignal: () => frame, tilt: projectedTilt });
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
