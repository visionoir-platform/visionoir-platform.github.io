import { createProject, createTrack, validateProject } from './model.js';

const invalid = () => Error('midiImportInvalid');
const unsupported = () => Error('midiImportUnsupported');
const tooLarge = () => Error('midiImportTooLarge');
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const label = text => typeof text === 'string'
  ? text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 240) : '';

function projectTempo(midi) {
  const changes = new Map();
  for (const change of midi.tempos) {
    const {tick, microsPerQuarter} = change || {};
    if (!integer(tick, 0, midi.endTick) || !integer(microsPerQuarter, 1, 0xffffff)) throw invalid();
    changes.set(tick, microsPerQuarter);
  }
  const tempo = changes.get(0) ?? 500000;
  const bpm = 60000000 / tempo;
  if (bpm < 40 || bpm > 300) throw unsupported();
  for (const [tick, value] of changes) if (tick < midi.endTick && value !== tempo) throw unsupported();
  return bpm;
}

function startLane(lanes, groupLanes, group) {
  if (lanes.length === 32) throw tooLarge();
  const track = createTrack(group.channel === 9 ? 'schranz' : 'lead', lanes.length);
  const {volume, pan} = group.mix ?? {};
  if (volume !== undefined) {
    if (!integer(volume, 0, 127)) throw invalid();
    track.volume = volume / 127;
  }
  if (pan !== undefined) {
    if (!integer(pan, 0, 127)) throw invalid();
    track.pan = (pan - 64) / (pan < 64 ? 64 : 63);
  }
  const name = label(group.name) || 'MIDI ' + (group.channel + 1);
  track.name = groupLanes.length ? name + ' · ' + (groupLanes.length + 1) : name;
  const lane = { track, notes: new Map(), activeEnds: [], last: null };
  lanes.push(lane);
  groupLanes.push(lane);
  return lane;
}

function placeNotes(midi, lanes, occupied) {
  const ticksPerStep = midi.ppqn / 4;
  for (const group of midi.groups) {
    if (!group || !integer(group.channel, 0, 15) || !Array.isArray(group.notes)) throw invalid();
    const groupLanes = [];
    // The loudest member can act as the chord root, with up to three extra
    // voices on this engine channel. Incompatible pitches or dynamics get a lane.
    const notes = group.notes.map(event => {
      if (!event || !integer(event.tick, 0, midi.endTick) || !integer(event.endTick, event.tick, midi.endTick) ||
          !integer(event.velocity, 1, 127) || !integer(event.note, 0, 127)) throw invalid();
      return event;
    }).sort((a, b) => a.tick - b.tick || b.velocity - a.velocity || a.note - b.note);
    for (const event of notes) {
      const { tick, endTick, velocity, note } = event;
      const pos = tick / ticksPerStep, step = Math.round(pos);
      const gate = (endTick - tick) / ticksPerStep;
      // visitStepNotes clamps the actually audible gate to this range.
      if (gate < .035 || gate > 128) throw unsupported();
      let free, chord;
      for (const lane of groupLanes) {
        lane.activeEnds = lane.activeEnds.filter(end => end > tick);
        if (lane.activeEnds.length === 4) continue;
        const last = lane.last;
        if (last.step !== step) { free ??= lane; continue; }
        const interval = note - last.note;
        // The sequencer plays each extra chord tone at 73% of root velocity.
        if (last.tick === tick && last.endTick === endTick && velocity * 100 === last.velocity * 73 &&
            interval && Math.abs(interval) <= 48 && !lane.notes.get(step).chord?.includes(interval)) {
          chord = lane;
          break;
        }
      }
      const lane = chord || free || startLane(lanes, groupLanes, group);
      if (chord) {
        (chord.notes.get(step).chord ??= []).push(note - chord.last.note);
      } else {
        // At a grid midpoint the nearest supported offset is within .01 of a sixteenth.
        const offset = Math.max(-.49, Math.min(.49, pos - step));
        lane.notes.set(step, { note, velocity: velocity / 127, gate, offset });
        lane.last = { step, tick, endTick, velocity, note };
      }
      lane.activeEnds.push(endTick);
      occupied.add(Math.floor(step / 16));
    }
  }
}

export function projectFromMidi(midi, fileName = '') {
  if (!midi || !integer(midi.ppqn, 1, 32767) || !Number.isSafeInteger(midi.endTick) || midi.endTick < 0 ||
      !Array.isArray(midi.groups) || !Array.isArray(midi.tempos) || !Array.isArray(midi.markers)) throw invalid();
  const ticksPerBar = midi.ppqn * 4;
  let bars = Math.ceil(midi.endTick / ticksPerBar);
  // The studio's MIDI renderer supports up to 300,000 sixteenths.
  if (bars * 16 > 300000) throw tooLarge();
  const bpm = projectTempo(midi);
  const lanes = [], occupied = new Set();
  placeNotes(midi, lanes, occupied);
  if (!lanes.length) throw Error('midiImportNoNotes');
  const busy = [...occupied].sort((a, b) => a - b);
  bars = Math.max(bars, busy.at(-1) + 1);
  if (bars * 16 > 300000) throw tooLarge();
  const markers = new Map();
  for (const marker of midi.markers) {
    const {tick, name} = marker || {};
    if (!integer(tick, 0, midi.endTick)) throw invalid();
    const bar = tick / ticksPerBar, text = label(name);
    if (Number.isInteger(bar) && bar < bars && text) {
      markers.set(bar, [markers.get(bar), text].filter(Boolean).join(' · ').slice(0, 512));
    }
  }
  const boundaries = [...markers.keys(), bars].sort((a, b) => a - b);
  const project = createProject('blank');
  const baseName = typeof fileName === 'string' ? fileName.split(/[\\/]/).pop() : '';
  project.name = label(baseName.replace(/\.(mid|midi)$/i, '')) || 'MIDI';
  project.bpm = bpm;
  project.tracks = lanes.map(lane => lane.track);
  project.scenes = [];
  project.arrangement = [];
  let markerIndex = 0, busyIndex = 0, restScene, cells = 0;
  for (let bar = 0; bar < bars;) {
    while (boundaries[markerIndex] <= bar) markerIndex++;
    while (busy[busyIndex] < bar) busyIndex++;
    const nextNoteBar = busy[busyIndex] ?? bars;
    const silent = nextNoteBar > bar;
    const end = Math.min(boundaries[markerIndex], silent ? Math.min(nextNoteBar, bar + 4096) : bar + 8);
    const marker = markers.get(bar);
    let scene = silent ? restScene : undefined;
    if (scene === undefined) {
      scene = project.scenes.length;
      if (scene === 128) throw tooLarge();
      const patterns = lanes.map(lane => {
        const steps = silent ? [null] : Array.from({length: (end - bar) * 16}, (_, i) => lane.notes.get(bar * 16 + i) ?? null);
        if (!steps.some(Boolean)) steps.length = 1;
        cells += steps.length;
        if (cells > 350000) throw tooLarge();
        return { length: steps.length, steps };
      });
      project.scenes.push({ id: 'scene-' + (scene + 1), name: marker || 'MIDI ' + (bar + 1), patterns });
      if (silent) restScene = scene;
    }
    if (project.arrangement.length === 2048) throw tooLarge();
    project.arrangement.push({ scene, bars: end - bar, ...(marker && {marker}) });
    bar = end;
  }
  return validateProject(project);
}
