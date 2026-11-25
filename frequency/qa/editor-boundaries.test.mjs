import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomationEditor } from '../automation-editor.js';
import { validateAutomation } from '../audio/automation.js';
import { pianoView } from '../piano.js';

function projectState() {
  return {
    p: {
      arrangement: [{ scene: 0, bars: 1 }],
      tracks: [{ id: 'a', name: 'A', pan: 0, volume: 0.8 }],
      scenes: [{ name: 'S', patterns: [{ length: 128, steps: Array(128).fill(null) }] }],
    },
    channel: 0,
    scene: 0,
    page: 0,
    step: 0,
    octave: 0,
    selected: new Set([0]),
  };
}

test('incomplete envelope fields never invalidate a restorable arrangement', () => {
  const state = projectState();
  let markup;
  const fields = {
    'auto-step': { valueAsNumber: NaN, reportValidity: () => true },
    'auto-value': { valueAsNumber: 50, reportValidity: () => true },
  };
  const editor = createAutomationEditor({
    state,
    t: (k) => k,
    open: (id, title, html) => {
      markup = html;
    },
    mutate: (fn) => fn(),
    field: (k) => fields[k],
    say() {},
  });
  editor.begin();
  assert.match(markup, /data-field="auto-step"[^>]+ required/);
  assert.match(markup, /data-field="auto-value"[^>]+ required/);
  editor.action('auto-add');
  assert.equal(state.p.arrangement[0].automation, undefined);
  fields['auto-step'].valueAsNumber = 1;
  editor.action('auto-add');
  const snapshot = structuredClone(state.p.arrangement);
  fields['auto-value'].valueAsNumber = NaN;
  editor.action('auto-save');
  assert.deepEqual(state.p.arrangement, snapshot);
  validateAutomation(state.p.arrangement, state.p.tracks);
});

test('imported sustained notes retain their full duration and chord pitches stay on their step', () => {
  const state = projectState(),
    pat = state.p.scenes[0].patterns[0];
  pat.steps[0] = { note: 125, velocity: 0.7, gate: 120, chord: [9] };
  state.octave = 10;
  state.page = 6;
  const roll = pianoView(state, (k) => k, '', '');
  assert.match(roll, /data-pos="96" data-note="127"[^>]+data-origin="0"/);
  assert.match(roll, /data-pos="111" data-note="125"[^>]+data-origin="0"/);
  assert.match(roll, /data-field="piano-gate" value="120" min="0.01" max="128"/);
  state.octave = 0;
  assert.doesNotMatch(
    pianoView(state, (k) => k, '', ''),
    /data-origin="0"/,
  );
});
