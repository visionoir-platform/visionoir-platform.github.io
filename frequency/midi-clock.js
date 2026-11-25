// MIDI Timing Clock sends 24 pulses per quarter note. Measure message arrival, never handler dispatch.
const pulsesPerBeat = 24;
const silenceMs = 500;
const validTime = (time) => Number.isFinite(time) && time >= 0;

export function createMidiClock({ tempo, start, stop, now = () => performance.now() }) {
  const inputs = new Map();
  let master = null;
  let lastMaster = -Infinity;
  let startedByMaster = false;

  function release() {
    if (master !== null) inputs.delete(master);
    master = null;
    lastMaster = -Infinity;
    startedByMaster = false;
  }

  return {
    get master() {
      return master;
    },
    reset() {
      release();
      inputs.clear();
    },
    detach(input) {
      if (master === input) {
        const shouldStop = startedByMaster;
        release();
        if (shouldStop) stop();
      } else inputs.delete(input);
    },
    receive(input, message) {
      const status = message.data?.[0];
      if (![0xf8, 0xfa, 0xfc].includes(status)) return;
      const time = validTime(message.receivedTime)
        ? message.receivedTime
        : validTime(message.timeStamp)
          ? message.timeStamp
          : now();
      if (!validTime(time)) return;
      // Freewheel at the last accepted BPM after missing clock. A new master may acquire the next beat.
      if (status !== 0xfc && time - lastMaster > silenceMs && master !== null) release();
      if (master !== null && master !== input && status === 0xf8) return;
      let source = inputs.get(input);
      if (!source) {
        source = { last: -Infinity, first: null, count: 0, bad: 0, stopped: false };
        inputs.set(input, source);
      }
      if (time < source.last) return;
      if (master !== null && master !== input) {
        // A foreign transport message may change that port's own eligibility, never the running transport.
        source.stopped = status === 0xfc;
        source.first = null;
        source.count = 0;
        source.last = time;
        return;
      }
      if (status === 0xfc) {
        if (master === input) {
          release();
          stop();
        }
        // Many devices keep their clock running after Stop; those pulses cannot reclaim transport.
        source.stopped = true;
        source.last = time;
        inputs.set(input, source);
        return;
      }
      if (status === 0xfa) {
        for (const [id, state] of inputs) if (id !== input && !state.stopped) inputs.delete(id);
        Object.assign(source, { first: null, count: 0, bad: 0, stopped: false, last: time });
        inputs.set(input, source);
        master = input;
        lastMaster = time;
        startedByMaster = true;
        start();
        return;
      }
      if (source.stopped || (source.first !== null && time === source.last)) return;
      if (source.first === null || time - source.last > silenceMs) {
        source.first = time;
        source.count = 0;
      } else {
        // An entire burst with indiscernible timestamps cannot establish a new tempo.
        source.count++;
      }
      source.last = time;
      if (master === input) lastMaster = time;
      if (source.count < pulsesPerBeat) return;
      const bpm = Math.round(600000 / (time - source.first)) / 10;
      source.first = time;
      source.count = 0;
      if (bpm < 40 || bpm > 300 || !Number.isFinite(bpm)) {
        if (++source.bad >= 2 && master === input) release();
        return;
      }
      source.bad = 0;
      if (master === null) {
        // Clear competing partial beats, while respecting Stop until an input explicitly sends Start.
        for (const [id, state] of inputs) if (id !== input && !state.stopped) inputs.delete(id);
        master = input;
      }
      lastMaster = time;
      tempo(bpm);
    },
  };
}
