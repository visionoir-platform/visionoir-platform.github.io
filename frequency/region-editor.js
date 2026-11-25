import { act, escape as h, number, option, select } from './ui-kit.js';
import { sampleFrameCount } from './audio/regions.js';

export function audioRegionList(project, t) {
  const clips = [];
  project.arrangement.forEach((part, i) =>
    (part.audioRegions || []).forEach((r, j) => {
      const track = project.tracks.find((x) => x.id === r.track);
      clips.push(
        act(
          'region-edit',
          i + 1 + ' · ' + t('step') + ' ' + (r.step + 1) + ' · ' + (track?.sample?.name || track?.name || ''),
          { data: 'data-index="' + i + '" data-region="' + j + '"' },
        ),
      );
    }),
  );
  return '<div class="bar-tools">' + act('region-add', '+ ' + t('audioRegion')) + clips.join('') + '</div>';
}

export function createRegionEditor({ state, t, audio, open, close, mutate, field, guardLive }) {
  let draft = null;
  function readPlacement() {
    if (!draft || !field('region-part')) return;
    draft.part = Number(field('region-part').value);
    draft.step = Number(field('region-position')?.value || 1) - 1;
  }
  function availableTrack() {
    return state.p.tracks.find(
      (x) =>
        x.instrument === 'sampler' &&
        !x.sample &&
        state.p.scenes.every((scene) => !scene.patterns[state.p.tracks.indexOf(x)].steps.some(Boolean)),
    );
  }
  function draw() {
    const project = state.p,
      part = project.arrangement[draft.part];
    const sources = project.tracks.filter((track) => track.sample);
    const sample = draft.imported || sources.find((track) => track.id === draft.track)?.sample;
    const canImport = project.tracks.length < 32 || !!availableTrack();
    const seconds = sample ? sampleFrameCount(sample) / sample.rate : 0;
    const options = sources.map((track) =>
      option(track.id, track.sample.name || track.name, !draft.imported && track.id === draft.track),
    );
    if (draft.imported) options.push(option('', draft.imported.name, true));
    const sourceOptions = options.join('') || option('', '—', true);
    const place = select(
      t('part'),
      'region-part',
      project.arrangement
        .map((x, i) =>
          option(i, i + 1 + ' · ' + (x.marker || project.scenes[x.scene].name), i === draft.part),
        )
        .join(''),
    );
    const pos = Math.min(Math.max(0, draft.step), part.bars * 16 - 1);
    const secondsAt = (frame) => Number((frame / sample.rate).toFixed(6));
    const trim = sample
      ? number(t('trimStart') + ' (s)', 'region-in', secondsAt(draft.from), 0, seconds, 'any') +
        number(
          t('trimEnd') + ' (s)',
          'region-out',
          secondsAt(draft.to || sampleFrameCount(sample)),
          0,
          Math.ceil(seconds * 1e6) / 1e6,
          'any',
        )
      : '';
    open(
      'audio-region',
      t('audioRegion'),
      '<div class="field-grid">' +
        select(t('source'), 'region-source', sourceOptions) +
        (canImport
          ? '<label class="field"><span>' +
            h(t('regionImport')) +
            '</span><input type="file" accept="audio/*" data-region-file></label>'
          : '') +
        place +
        number(t('position') + ' · ' + t('step'), 'region-position', pos + 1, 1, part.bars * 16) +
        trim +
        '</div>' +
        '<div class="bar-tools">' +
        act('region-save', t('save'), { disabled: !sample }) +
        (draft.old ? act('region-delete', t('remove')) : '') +
        '</div>',
    );
  }
  function begin(i, j) {
    if (!guardLive()) return;
    const p = state.p,
      old = p.arrangement[i]?.audioRegions?.[j];
    const source = old?.track || p.tracks.find((tr) => tr.sample)?.id;
    draft = {
      old,
      originalPart: p.arrangement[i],
      part: i,
      step: old?.step || 0,
      track: source,
      from: old?.from || 0,
      to: old?.to || 0,
      imported: null,
      project: p,
    };
    draw();
  }
  async function importFile(file) {
    if (!file || !draft || !guardLive()) return;
    const active = draft;
    readPlacement();
    const sample = await audio.importSample(file, {});
    if (draft !== active || state.p !== active.project) return;
    Object.assign(draft, { imported: sample, track: null, from: 0, to: sampleFrameCount(sample) });
    draw();
  }
  function change(id, value) {
    if (!draft) return;
    readPlacement();
    if (id === 'region-source') {
      const selected = state.p.tracks.find((x) => x.id === value && x.sample);
      if (selected)
        Object.assign(draft, {
          track: selected.id,
          imported: null,
          from: 0,
          to: sampleFrameCount(selected.sample),
        });
    } else if (id === 'region-part' && field('region-in')) {
      const sample = draft.imported || state.p.tracks.find((x) => x.id === draft.track)?.sample;
      if (sample) {
        draft.from = Math.round(Number(field('region-in').value) * sample.rate);
        draft.to = Math.round(Number(field('region-out').value) * sample.rate);
      }
    }
    draw();
  }
  function removeOld(parts, old, originalPartIndex) {
    if (old)
      parts[originalPartIndex].audioRegions = parts[originalPartIndex].audioRegions.filter((r) => r !== old);
  }
  function commit(remove = false) {
    if (!draft || state.p !== draft.project || !guardLive()) return;
    readPlacement();
    const p = state.p,
      prev = p.arrangement.indexOf(draft.originalPart);
    const parts = p.arrangement.map((part) => ({ ...part })),
      tracks = p.tracks.slice();
    removeOld(parts, draft.old, prev);
    let added = false;
    if (!remove) {
      const controls = ['region-position', 'region-in', 'region-out'].map(field);
      if (controls.some((input) => !input?.value || !input.reportValidity())) return;
      let tr = tracks.find((x) => x.id === draft.track);
      if (draft.imported) {
        const empty = tracks.length === 32 ? availableTrack() : null;
        if (empty) tr = { ...empty, sample: draft.imported };
        else {
          if (tracks.length >= 32) return;
          tr = { ...audio.createTrack('sampler', tracks.length), sample: draft.imported };
          while (tracks.some((x) => x.id === tr.id)) tr.id += '-a';
          added = true;
        }
        if (empty) tracks[tracks.indexOf(empty)] = tr;
        else tracks.push(tr);
      }
      if (!tr?.sample) return;
      const from = Math.round(Number(controls[1].value) * tr.sample.rate),
        to = Math.round(Number(controls[2].value) * tr.sample.rate);
      if (from >= to) {
        controls[2].setCustomValidity(t('regionBounds'));
        controls[2].reportValidity();
        return;
      }
      const r = { track: tr.id, step: draft.step, from, to };
      const part = parts[draft.part];
      part.audioRegions = [...(part.audioRegions || []), r];
    }
    const scenes = added
      ? p.scenes.map((scene) => ({
          ...scene,
          patterns: [...scene.patterns, { length: 16, steps: Array(16).fill(null) }],
        }))
      : p.scenes;
    audio.validateProject({ ...p, tracks, arrangement: parts, scenes });
    mutate(() => {
      p.arrangement = parts;
      p.tracks = tracks;
      p.scenes = scenes;
    });
    close();
  }
  return {
    begin,
    importFile,
    change,
    commit,
    clear: () => {
      draft = null;
    },
  };
}
