import { act, attr, escape as h, noteName, number, option, select } from './ui-kit.js';

export const scaleNames = ['chromatic', 'minor', 'major', 'phrygian'];
export const scales = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 2, 4, 5, 7, 9, 11],
  [0, 1, 3, 5, 7, 8, 10],
];

function noteDisplay(pattern, first) {
  const cells = new Map();
  const last = Math.min(first + 16, pattern.length);
  for (let start = 0; start < last; start++) {
    const event = pattern.steps[start];
    if (!event) continue;
    const gate = event.gate ?? 0.8;
    for (const offset of [0, ...(event.chord || [])]) {
      const pitch = Math.max(0, Math.min(127, event.note + offset));
      for (let pos = Math.max(first, start); pos < Math.min(start + gate, last); pos++) {
        cells.set(pos * 128 + pitch, {
          start,
          root: event.note,
          gate,
          velocity: event.velocity,
          width: Math.min(1, start + gate - pos),
        });
      }
    }
  }
  return cells;
}

export function pianoView(state, t, commands, header) {
  const { p, channel, scene, page, step } = state,
    pat = p.scenes[scene].patterns[channel];
  const first = page * 16,
    floor = state.octave * 12,
    event = pat.steps[step];
  const paints = noteDisplay(pat, first),
    tonic = state.root ?? 36,
    scale = scales[state.scale ?? 1];
  const visibleRows = Math.min(12, 128 - floor);
  const rows = Array.from({ length: visibleRows }, (_, row) => {
    const n = floor + visibleRows - 1 - row;
    const keys = Array.from({ length: 16 }, (_, col) => {
      const pos = first + col,
        paint = paints.get(pos * 128 + n),
        onset = paint?.start === pos;
      const label = noteName(n) + ' · ' + t('step') + ' ' + (pos + 1);
      const extra = paint
        ? ' data-origin="' +
          paint.start +
          '" data-root="' +
          paint.root +
          '" style="--duration:' +
          100 * paint.width +
          '%;--strength:' +
          paint.velocity +
          '"'
        : '';
      return (
        '<button type="button" class="piano-cell ' +
        (onset ? 'note ' : '') +
        (paint ? 'sounding ' : '') +
        (paint && state.selected.has(paint.start) ? 'picked' : '') +
        '" data-action="piano-cell" data-pos="' +
        pos +
        '" data-note="' +
        n +
        '" data-beat="' +
        col +
        '"' +
        extra +
        ' aria-label="' +
        attr(label + (paint ? ' · ' + t('gate') + ' ' + paint.gate : '')) +
        '" aria-pressed="' +
        !!paint +
        '"' +
        (pos >= pat.length ? ' disabled' : '') +
        '></button>'
      );
    }).join('');
    const inScale = scale.includes((((n - tonic) % 12) + 12) % 12);
    return (
      '<div class="piano-row ' +
      ([0, 2, 4, 5, 7, 9, 11].includes(n % 12) ? 'white' : 'black') +
      (inScale ? ' in-scale' : '') +
      '"><button data-action="audition" data-note="' +
      n +
      '">' +
      noteName(n) +
      '</button>' +
      keys +
      '</div>'
    );
  }).join('');
  const activeTool = state.pianoTool || 'shift';
  const selectedCount = [...state.selected].filter((pos) => pos >= 0 && pos < pat.length && pat.steps[pos]).length;
  const sel = selectedCount || (event ? 1 : 0);
  return (
    header +
    commands +
    '<div class="bar-tools">' +
    select(
      t('instrument'),
      'channel',
      p.tracks.map((tr, i) => option(i, tr.name, i === channel)).join(''),
    ) +
    select(
      t('pitch'),
      'octave',
      Array.from({ length: 11 }, (_, i) =>
        option(i, noteName(i * 12) + '–' + noteName(Math.min(127, i * 12 + 11)), i === state.octave),
      ).join(''),
    ) +
    act('multi', t('multiSelection'), { pressed: state.multi }) +
    '</div>' +
    '<div class="piano-tools">' +
    select(
      t('tools'),
      'piano-tool',
      ['shift', 'gate', 'chords'].map((k) => option(k, t(k), k === activeTool)).join(''),
    ) +
    select(
      t('scale'),
      'piano-scale',
      scaleNames.map((key, i) => option(i, t(key), i === (state.scale ?? 1))).join(''),
    ) +
    select(
      t('pitch'),
      'piano-root',
      Array.from({ length: 12 }, (_, n) =>
        option(n, noteName(60 + n).replace(/-?\d+$/, ''), n === tonic % 12),
      ).join(''),
    ) +
    act('piano-quantize', t('quantize') + ' · 1/16', { disabled: !selectedCount }) +
    act('piano-quantize-scale', t('quantize') + ' · ' + t('scale'), { disabled: !selectedCount }) +
    '</div>' +
    '<div class="scroll-zone" tabindex="0"><div dir="ltr" class="piano" data-tool="' +
    activeTool +
    '">' +
    rows +
    '</div></div>' +
    '<fieldset class="piano-inspector" aria-label="' +
    attr(t('note')) +
    '"' +
    (sel ? '' : ' disabled') +
    '><strong dir="ltr">' +
    (event ? h(noteName(event.note)) : '—') +
    '</strong>' +
    number(t('gate'), 'piano-gate', event?.gate ?? 0.8, 0.01, 128, 'any') +
    number(
      t('velocity') + ' %',
      'piano-velocity',
      Math.round((event?.velocity ?? 0.82) * 100),
      0,
      100,
      1,
    ) +
    '</fieldset>' +
    '<div class="bar-tools">' +
    act('transpose-down', '−1 ♩', { title: t('transpose') + ' −1' }) +
    act('transpose-up', '+1 ♩', { title: t('transpose') + ' +1' }) +
    act('move-prev', '← ♩', { title: t('shift') + ' · ' + t('previous') }) +
    act('move-next', '♩ →', { title: t('shift') + ' · ' + t('next') }) +
    act('copy-notes', t('copy')) +
    act('paste-notes', t('paste')) +
    act('duplicate-notes', t('duplicate'), { disabled: !sel }) +
    act('delete-notes', t('deleteStep')) +
    act('edit-step', t('edit') + ' · ' + t('note')) +
    '</div>'
  );
}

function nearestScaleNote(note, root, scale) {
  const allowed = n => n >= 0 && n <= 127 && scale.includes(((n - root) % 12 + 12) % 12);
  for (let distance = 0; distance < 12; distance++) {
    if (allowed(note - distance)) return note - distance;
    if (allowed(note + distance)) return note + distance;
  }
  return note;
}

// Microtiming is less than half a sixteenth. The nearest grid point is the
// event's own step; swing remains a property of the transport.
export function planQuantization(pattern, positions, scale, root = 0) {
  const updates = [];
  for (const pos of positions) {
    const event = pattern.steps[pos];
    if (!event || pos < 0 || pos >= pattern.length) continue;
    if (!scale) {
      if (event.offset) updates.push([pos, 'offset', 0]);
      continue;
    }
    // The pattern tool tunes the root of each onset, preserving its chord voicing.
    const pitch = nearestScaleNote(event.note, root, scale);
    if (pitch !== event.note) updates.push([pos, 'note', pitch]);
  }
  if (!updates.length) return null;
  return () => {
    for (const [pos, field, value] of updates) pattern.steps[pos][field] = value;
  };
}

// All selected voices keep their relative intervals. Refuse overlaps instead of deleting another onset.
export function relocateNotes(pattern, selected, stepDelta, pitchDelta, duplicate = false) {
  const starts = [...new Set(selected)].filter((i) => pattern.steps[i] && i < pattern.length);
  const blocked = starts.some((i) => {
    const pos = i + stepDelta,
      note = pattern.steps[i];
    return (
      pos < 0 ||
      pos >= pattern.length ||
      (pattern.steps[pos] && (duplicate || !starts.includes(pos))) ||
      [0, ...(note.chord || [])].some(
        (interval) => note.note + interval + pitchDelta < 0 || note.note + interval + pitchDelta > 127,
      )
    );
  });
  if (!starts.length || blocked || (!stepDelta && !pitchDelta && !duplicate)) return null;
  const items = starts.map((i) => [
    i + stepDelta,
    {
      ...structuredClone(pattern.steps[i]),
      note: pattern.steps[i].note + pitchDelta,
    },
  ]);
  return () => {
    if (!duplicate) for (const i of starts) pattern.steps[i] = null;
    for (const [i, ev] of items) pattern.steps[i] = ev;
    return items.map(([i]) => i);
  };
}

export function changeChord(event, pitch) {
  const notes = new Set([event.note, ...(event.chord || []).map((v) => event.note + v)]);
  if (notes.has(pitch)) {
    if (notes.size === 1) return null;
    notes.delete(pitch);
  } else {
    if (notes.size >= 8) return event;
    notes.add(pitch);
  }
  const ordered = [...notes].sort((a, b) => a - b);
  if (ordered.at(-1) - ordered[0] > 48) return event;
  return {
    ...event,
    note: ordered[0],
    chord: ordered.slice(1).map((n) => n - ordered[0]),
  };
}

export function bindEditorDrags(root, { noteDrop, clipDrop }) {
  let gesture, suppress;
  const hit = (e, q) => document.elementFromPoint(e.clientX, e.clientY)?.closest(q);
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || gesture) return;
    const cell = e.target.closest('.piano-cell.sounding'),
      clip = e.target.closest('[data-grip]');
    if (!cell && !clip) return;
    if (cell?.closest('.piano').dataset.tool === 'chords') return;
    const source = cell || clip;
    gesture = {
      id: e.pointerId,
      source,
      x: e.clientX,
      y: e.clientY,
      cell,
      clip,
      active: false,
    };
    source.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.id !== e.pointerId) return;
    if (!gesture.active && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) < 5) return;
    gesture.active = true;
    const destination = hit(e, gesture.cell ? '.piano-cell:not(:disabled)' : '[data-arrange-index]');
    if (destination !== gesture.target) {
      gesture.target?.classList.remove('drop-target');
      destination?.classList.add('drop-target');
      gesture.target = destination;
    }
  });
  function finish(e) {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    gesture = null;
    g.target?.classList.remove('drop-target');
    if (!g.active || e.type === 'pointercancel') return;
    suppress = { x: e.clientX, y: e.clientY, at: performance.now() };
    const target = hit(e, g.cell ? '.piano-cell:not(:disabled)' : '[data-arrange-index]');
    if (!target) return;
    if (g.cell) noteDrop(g.cell, target);
    else clipDrop(Number(g.clip.dataset.grip), Number(target.dataset.arrangeIndex));
  }
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  root.addEventListener('lostpointercapture', (e) => {
    if (gesture?.id === e.pointerId) {
      gesture.target?.classList.remove('drop-target');
      gesture = null;
    }
  });
  root.addEventListener(
    'click',
    (e) => {
      if (
        suppress &&
        e.detail &&
        performance.now() - suppress.at < 500 &&
        Math.hypot(e.clientX - suppress.x, e.clientY - suppress.y) < 4
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppress = null;
      }
    },
    true,
  );
}
