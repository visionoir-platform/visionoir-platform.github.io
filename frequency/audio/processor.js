import { renderClock } from './live-budget.js';
import { LiveRack } from './live-rack.js';
class FrequencyProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.dsp = null;
    this.meterCount = 0;
    this.tick = { type: 'tick', data: undefined };
    this.awake = 0;
    this.port.onmessage = ({ data: m }) => {
      try {
        switch (m.type) {
          case 'project':
            if (this.dsp) this.dsp.update(m.project);
            else this.dsp = new LiveRack(m.project, sampleRate);
            break;
          case 'control':
            this.dsp?.control(m.id, m.value);
            break;
          case 'play':
            this.dsp.start(m.options);
            this.awake = 1;
            break;
          case 'pause':
            this.dsp?.pause();
            this.report();
            break;
          case 'resume':
            this.dsp?.resume();
            break;
          case 'stop':
            this.dsp?.stop();
            this.awake = 0;
            this.report();
            break;
          case 'queue':
            this.dsp?.queueScene(m.scene);
            break;
          case 'note':
            this.dsp?.trigger(m.track, m.note, m.velocity, m.gate);
            this.awake = sampleRate * 9;
            break;
          case 'held-note':
            this.dsp?.noteOn(m.track, m.note, m.velocity, m.token);
            this.awake = sampleRate * 9;
            break;
          case 'off':
            this.dsp?.release(m.track, m.note, m.token);
            break;
        }
      } catch (e) {
        this.port.postMessage({ type: 'error', message: e.message });
      }
    };
  }
  report() {
    if (!this.dsp) return;
    // postMessage clones each reading before the audio thread reuses these arrays.
    this.tick.data = this.dsp.status(this.tick.data);
    this.port.postMessage(this.tick);
  }
  process(_ins, outs) {
    const channels = outs[0];
    if (!channels.length || !this.dsp || (!this.awake && !this.dsp.running && !this.dsp.hasHeldNotes)) return true;
    const started = renderClock.now();
    this.dsp.render(channels[0], channels[1] || channels[0]);
    this.dsp.observeBudget(renderClock.now() - started, channels[0].length);
    if (this.dsp.needsAudioRender) this.awake = sampleRate * 9;
    else this.awake = Math.max(0, this.awake - channels[0].length);
    this.meterCount += channels[0].length;
    if (this.meterCount >= sampleRate / 24) {
      this.meterCount = 0;
      this.report();
    }
    return true;
  }
}
registerProcessor('frequency-rack-v1', FrequencyProcessor);
