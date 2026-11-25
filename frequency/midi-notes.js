/** Input identity stays local. Only an opaque voice token enters the audio thread. */
export function createMidiNotes({ ready, noteOn, noteOff, onError }) {
  const notes = new Map();
  let nextToken = 0;
  const keyFor = (input, channel, pitch) => JSON.stringify([input, channel, pitch]);
  function finish(key, held) {
    notes.delete(key);
    if (held.started) noteOff(held.track, held.pitch, held.token);
  }
  return {
    async press(input, channel, pitch, track, velocity) {
      const key = keyFor(input, channel, pitch),
        previous = notes.get(key);
      if (previous) finish(key, previous);
      const held = { input, channel, pitch, track, token: ++nextToken, started: false };
      notes.set(key, held);
      try {
        await ready();
        // A note-off, input disconnect or panic can precede context resume.
        if (notes.get(key) !== held) return;
        held.started = true;
        noteOn(track, pitch, velocity, held.token);
      } catch (error) {
        if (notes.get(key) === held) {
          finish(key, held);
          onError(error);
        }
      }
    },
    release(input, channel, pitch) {
      const key = keyFor(input, channel, pitch),
        held = notes.get(key);
      if (held) finish(key, held);
    },
    reset(input, channel) {
      for (const [key, held] of notes) {
        if (
          (input === undefined || input === held.input) &&
          (channel === undefined || channel === held.channel)
        )
          finish(key, held);
      }
    },
  };
}

/** Reconcile hot-plug events by port ID and instance; unplug only releases that input. */
export function bindMidiInputs(access, receive, detach) {
  let attached = new Map();
  function refresh() {
    const available = new Map(
      [...access.inputs.values()].filter((p) => p.state !== 'disconnected').map((p) => [p.id, p]),
    );
    for (const [id, old] of attached)
      if (available.get(id) !== old) {
        old.onmidimessage = null;
        detach(id);
      }
    for (const [id, port] of available)
      if (attached.get(id) !== port) {
        port.onmidimessage = (event) => receive(event, id);
      }
    attached = available;
  }
  function close() {
    access.onstatechange = null;
    for (const [id, port] of attached) {
      port.onmidimessage = null;
      detach(id);
    }
    attached.clear();
  }
  refresh();
  return { refresh, close };
}
