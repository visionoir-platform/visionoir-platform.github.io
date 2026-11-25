import { INSTRUMENTS } from './model.js';

const slots = () => new Float32Array(INSTRUMENTS.length);
const audibleGain = (deck, channel) => (channel.volumeLane.value ?? channel.t.volume) *
  channel.mixGain * deck.busGain[channel.b] * deck.volume;

// The live decks share one latch. Only actual voice starts write it. Reading
// once per meter packet preserves short attacks even after their gate closes.
export class VisualNotes {
  constructor() {
    this.attacks = slots();
    this.reset();
  }
  reset() {
    this.attacks.fill(0);
    this.accents = this.releases = 0;
  }
  end(voice) {
    if (voice.visualOpen) this.releases |= 1 << voice.kind;
    voice.visualOpen = false;
  }
  start(deck, channel, voice, accented) {
    this.end(voice); // A stolen polyphonic voice ends its previous gate.
    const gain = audibleGain(deck, channel) * (voice.p.gain ?? 1);
    if (gain <= 0 || voice.vel <= 0) return;
    voice.visualOpen = true;
    const attack = Math.min(1, .85 * gain * voice.vel);
    this.attacks[channel.kind] = Math.max(this.attacks[channel.kind], attack);
    if (accented) this.accents |= 1 << channel.kind;
  }
  endDeck(deck) {
    for (const channel of deck.channels) for (const voice of channel.voices) this.end(voice);
  }
  sampleDeck(deck, out) {
    for (const c of deck.channels) {
      const gain = audibleGain(deck, c);
      const slot = c.kind;
      // DSP energy is post-fader and pre-bus. A muted track/bus cannot leak
      // its meter into Chromatic, even while the analyser itself has a tail.
      const level = gain > 0 ? Math.sqrt(c.energy) * deck.busGain[c.b] * deck.volume : 0;
      out.levels[slot] = Math.max(out.levels[slot], Math.min(1, level));
      for (const voice of c.voices) {
        if (!voice.visualOpen) continue;
        if (!voice.active || voice.age >= voice.gate || gain <= 0) this.end(voice);
        else out.gates[slot] = Math.max(out.gates[slot],
          Math.min(1, .85 * gain * (voice.p.gain ?? 1) * voice.vel * voice.env));
      }
    }
  }
  read(active, outgoing, out = { attacks: slots(), gates: slots(), levels: slots() }) {
    out.gates.fill(0);
    out.levels.fill(0);
    this.sampleDeck(active, out);
    if (outgoing) this.sampleDeck(outgoing, out);
    out.attacks.set(this.attacks);
    out.accents = this.accents;
    out.releases = this.releases;
    this.reset();
    return out;
  }
}
