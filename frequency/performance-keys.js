import { act, escape as h, option, select } from './ui-kit.js';

import {controlsKey} from './storage.js';
export const scales = [85, 100, 115, 130, 150];
const commands = ['transport', ...Array.from({ length: 8 }, (_, i) => 'pad' + i)];
const defaults = ['Space', ...Array.from({ length: 8 }, (_, i) => 'Digit' + (i + 1))];
const choices = [
  'Space',
  ...Array.from({ length: 10 }, (_, i) => 'Digit' + i),
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', (c) => 'Key' + c),
];
export function defaultControls() {
  return { size: 100, enabled: true, bindings: [...defaults] };
}

export function readControls() {
  const fallback = defaultControls();
  try {
    const data = JSON.parse(localStorage.getItem(controlsKey));
    if (!data) return fallback;
    if (scales.includes(data.size)) fallback.size = data.size;
    if (typeof data.enabled === 'boolean') fallback.enabled = data.enabled;
    if (
      Array.isArray(data.bindings) &&
      data.bindings.length === commands.length &&
      data.bindings.every((key) => key === '' || choices.includes(key))
    ) {
      const used = data.bindings.filter(Boolean);
      if (new Set(used).size === used.length) fallback.bindings = data.bindings.slice();
    }
  } catch {
    /* Restricted storage leaves the choices available in this tab. */
  }
  return fallback;
}
export function persistControls(settings) {
  try {
    localStorage.setItem(controlsKey, JSON.stringify(settings));
  } catch {}
}

const label = (key, t) =>
  !key ? t('unassignedKey') : key === 'Space' ? t('spaceKey') : key.replace(/^(Digit|Key)/, '');
const commandLabel = (i, t) => (i === 0 ? t('play') + ' / ' + t('stop') : 'Pad ' + i);
export function controlsForm(cfg, t) {
  return (
    '<div class="field-grid">' +
    select(
      t('interfaceScale'),
      'ui-size',
      scales.map((n) => option(n, n + '%', n === cfg.size)).join(''),
    ) +
    '</div>' +
    '<div class="bar-tools">' +
    act('enable-keys', t('performanceKeys'), { pressed: cfg.enabled }) +
    act('reset-keys', t('defaultKeys')) +
    '</div>' +
    '<div class="field-grid">' +
    commands
      .map((cmd, i) =>
        select(
          commandLabel(i, t),
          'bind-' + i,
          ['', ...choices]
            .filter((key) => !key || key === cfg.bindings[i] || !cfg.bindings.includes(key))
            .map((key) => option(key, label(key, t), key === cfg.bindings[i]))
            .join(''),
        ),
      )
      .join('') +
    '</div>'
  );
}
export function keysHelp(cfg, t) {
  const bindings = cfg.enabled
    ? commands
        .map(
          (_, i) =>
            cfg.bindings[i] &&
            '<kbd>' + h(label(cfg.bindings[i], t)) + '</kbd> ' + h(commandLabel(i, t)),
        )
        .filter(Boolean)
    : [];
  bindings.push('<kbd>Esc</kbd> Panic');
  return bindings.join(' · ');
}

export function assignKey(cfg, i, key) {
  if (!Number.isInteger(i) || i < 0 || i >= commands.length || (key !== '' && !choices.includes(key)))
    return false;
  if (key && cfg.bindings.some((v, n) => v === key && n !== i)) return false;
  cfg.bindings[i] = key;
  return true;
}

// Physical digit positions preserve the original drum layout. Letters follow the active Latin layout.
function bindingId(event) {
  if (/^[A-Za-z]$/.test(event.key)) return 'Key' + event.key.toUpperCase();
  return event.code;
}

export function bindPerformanceKeys(
  doc,
  { getControls, modal, transport, stop, standard, playPad, onError },
) {
  const held = new Map();
  let serial = 0;
  function release(code) {
    const hit = held.get(code);
    if (!hit) return;
    held.delete(code);
    hit.released = true;
    hit.stop?.();
  }
  function clear() {
    for (const code of held.keys()) release(code);
  }
  function keyDown(e) {
    if (
      e.defaultPrevented ||
      e.repeat ||
      e.isComposing ||
      modal() ||
      e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false])')
    )
      return;
    if (e.key === 'Escape') {
      stop();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && ['s', 'z'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      standard(e.key.toLowerCase() === 's' ? 'save' : e.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const cfg = getControls(),
      nativeButton = e.target.closest?.('button,a,summary');
    // A focused control retains its native activation with Space.
    const focusedPad = e.target.matches?.('[data-pad]') && (e.key === 'Enter' || e.code === 'Space');
    if (e.code === 'Space' && nativeButton && !focusedPad) return;
    const i = !focusedPad && cfg.enabled ? cfg.bindings.indexOf(bindingId(e)) : -1;
    if (i === 0) {
      e.preventDefault();
      transport();
      return;
    }
    const pad = focusedPad ? Number(e.target.dataset.pad) : i - 1;
    if (pad < 0 || held.has(e.code)) return;
    e.preventDefault();
    const hit = { released: false, stop: null };
    held.set(e.code, hit);
    // Keyboard tokens use a separate range from MIDI and keep simultaneous input sources independent.
    const token = 0x100000000 + ++serial;
    Promise.resolve(playPad(pad, token))
      .then((unpress) => {
        if (typeof unpress !== 'function') return;
        if (hit.released) unpress();
        else hit.stop = unpress;
      })
      .catch((error) => {
        if (held.get(e.code) === hit) held.delete(e.code);
        onError(error);
      });
  }
  const keyUp = (e) => release(e.code);
  const hidden = () => {
    if (doc.hidden) clear();
  };
  doc.addEventListener('keydown', keyDown);
  doc.addEventListener('keyup', keyUp);
  doc.addEventListener('visibilitychange', hidden);
  doc.defaultView.addEventListener('blur', clear);
  return {
    clear,
    dispose() {
      clear();
      doc.removeEventListener('keydown', keyDown);
      doc.removeEventListener('keyup', keyUp);
      doc.removeEventListener('visibilitychange', hidden);
      doc.defaultView.removeEventListener('blur', clear);
    },
  };
}
