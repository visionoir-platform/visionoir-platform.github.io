import { act, escape as h, number, option, select } from './ui-kit.js';

export function createAutomationEditor({ state, t, open, mutate, field, say }) {
  let part = 0,
    track = '',
    target = 'volume',
    selected;
  const clip = () => state.p.arrangement[part];
  const lane = () => clip().automation?.find((l) => l.track === track && l.target === target);
  const minimum = () => (target === 'pan' ? -1 : 0);
  const maxStep = () => clip().bars * 16 - 1;
  const name = () => (target === 'pan' ? 'Pan' : t('volume'));
  const manualValue = () => state.p.tracks.find((item) => item.id === track)?.[target] ?? 0;
  const bound = (v, min, max) => Math.min(max, Math.max(min, v));
  function totalPoints() {
    return state.p.arrangement.reduce(
      (total, part) =>
        total + (part.automation || []).reduce((sum, lane) => sum + lane.points.length, 0),
      0,
    );
  }
  function write(points) {
    mutate(() => {
      const rest = (clip().automation || []).filter((l) => l.track !== track || l.target !== target);
      if (points.length)
        rest.push({
          track,
          target,
          points: points.sort((a, b) => a.step - b.step),
        });
      if (rest.length) clip().automation = rest;
      else delete clip().automation;
    });
  }
  function draw() {
    const points = lane()?.points || [],
      end = maxStep(),
      min = minimum();
    const x = (step) => (step / end) * 100,
      y = (value) => ((1 - value) / (1 - min)) * 100;
    let curve = '0,' + y(manualValue());
    if (points.length) curve += ' ' + x(points[0].step) + ',' + y(manualValue());
    for (const p of points) curve += ' ' + x(p.step) + ',' + y(p.value);
    curve += ' 100,' + y(points.at(-1)?.value ?? manualValue());
    const active = points.find((p) => p.step === selected),
      value = active?.value ?? manualValue();
    const handles = points
      .map(
        (p) =>
          '<span class="point ' +
          (selected === p.step ? 'active' : '') +
          '" aria-hidden="true" data-point="' +
          p.step +
          '" style="left:' +
          x(p.step) +
          '%;top:' +
          y(p.value) +
          '%"></span>',
      )
      .join('');
    const graph =
      '<div class="curve" data-curve tabindex="-1"><svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<polyline points="' +
      curve +
      '" vector-effect="non-scaling-stroke"/></svg>' +
      handles +
      '</div>';
    const options = points
      .map((p) =>
        option(p.step, p.step + 1 + ' · ' + Math.round(p.value * 100) + '%', p.step === selected),
      )
      .join('');
    open(
      'automation',
      t('automation'),
      '<div class="field-grid">' +
        select(
          t('part'),
          'auto-part',
          state.p.arrangement
            .map((c, i) =>
              option(i, i + 1 + ' · ' + (c.marker || state.p.scenes[c.scene].name), part === i),
            )
            .join(''),
        ) +
        select(
          t('instrument'),
          'auto-track',
          state.p.tracks.map((c) => option(c.id, c.name, track === c.id)).join(''),
        ) +
        select(
          t('lane'),
          'auto-target',
          option('volume', t('volume'), target === 'volume') + option('pan', 'Pan', target === 'pan'),
        ) +
        '</div>' +
        graph +
        '<div class="curve-axis" dir="ltr"><span>1</span><span>' +
        h(t('step')) +
        '</span><span>' +
        (end + 1) +
        '</span></div>' +
        '<div class="field-grid">' +
        (points.length ? select(t('point'), 'auto-select', options) : '') +
        number(
          t('position') + ' · ' + t('step'),
          'auto-step',
          (selected ?? 0) + 1,
          1,
          end + 1,
          1,
          true,
        ) +
        number(name() + ' %', 'auto-value', Math.round(value * 100), min * 100, 100, 1, true) +
        '</div>' +
        '<div class="bar-tools">' +
        act('auto-add', '+ ' + t('point'), { disabled: points.length >= 128 }) +
        act('auto-save', t('save'), { disabled: !active }) +
        act('auto-delete', t('remove'), { disabled: !active }) +
        '</div>',
    );
  }
  function begin(index = 0) {
    part = index;
    track = state.p.tracks[state.channel].id;
    target = 'volume';
    selected = lane()?.points[0]?.step;
    draw();
  }
  function change(key, val) {
    if (key === 'auto-select') selected = Number(val);
    else {
      if (key === 'auto-part') part = Number(val);
      if (key === 'auto-track') track = val;
      if (key === 'auto-target') target = val;
      selected = lane()?.points[0]?.step;
    }
    draw();
  }
  function upsert(step, value, old) {
    const points = lane()?.points || [];
    const isNew = old === undefined && !points.some((p) => p.step === step);
    if (isNew && totalPoints() >= 8192) return say(t('point') + ' · 8192 / 8192');
    if (!points.length && (clip().automation?.length || 0) >= 64) return say(t('lane') + ' · 64 / 64');
    if (isNew && points.length >= 128) return say(t('point') + ' · 128 / 128');
    if (old !== undefined && old !== step && points.some((p) => p.step === step)) {
      draw();
      return say(t('point') + ' · ' + (step + 1) + ' · ' + t('unsupported'));
    }
    write([...points.filter((p) => p.step !== old && p.step !== step), { step, value }]);
    selected = step;
    draw();
  }
  function action(id) {
    if (id === 'auto-delete') {
      const next = (lane()?.points || []).filter((p) => p.step !== selected);
      write(next);
      selected = next[0]?.step;
      draw();
      return;
    }
    const a = field('auto-step'),
      b = field('auto-value');
    if (!a.reportValidity() || !b.reportValidity()) return;
    const step = a.valueAsNumber - 1;
    const value = b.valueAsNumber / 100;
    if (
      !Number.isInteger(step) ||
      step < 0 ||
      step > maxStep() ||
      !Number.isFinite(value) ||
      value < minimum() ||
      value > 1
    )
      return;
    upsert(step, value, id === 'auto-save' ? selected : undefined);
  }
  function bind(root) {
    let drag;
    root.addEventListener('pointerdown', (e) => {
      const chart = e.target.closest('[data-curve]');
      if (!chart || e.button !== 0 || drag) return;
      const point = e.target.closest('[data-point]');
      drag = {
        chart,
        id: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        old: point ? Number(point.dataset.point) : undefined,
      };
      chart.setPointerCapture(e.pointerId);
    });
    function position(chart, e) {
      const rect = chart.getBoundingClientRect();
      return {
        step: Math.round(bound((e.clientX - rect.left) / rect.width, 0, 1) * maxStep()),
        value:
          Math.round((1 - bound((e.clientY - rect.top) / rect.height, 0, 1) * (1 - minimum())) * 100) /
          100,
      };
    }
    root.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const p = position(drag.chart, e);
      field('auto-step').value = p.step + 1;
      field('auto-value').value = Math.round(p.value * 100);
    });
    root.addEventListener('pointerup', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const { chart, old, originX, originY } = drag;
      drag = null;
      if (old !== undefined && Math.hypot(e.clientX - originX, e.clientY - originY) < 4) {
        selected = old;
        draw();
        return;
      }
      const { step, value } = position(chart, e);
      upsert(step, value, old);
    });
    root.addEventListener('pointercancel', (e) => {
      if (drag?.id === e.pointerId) {
        drag = null;
        draw();
      }
    });
  }
  return { begin, action, change, bind };
}
