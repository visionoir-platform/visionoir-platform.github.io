import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpectrumMeter } from '../../visual-spectrum.js';

function source(rate, fftSize) {
  const spectrum = new Uint8Array(fftSize / 2);
  return {
    spectrum,
    fftSize,
    context: { sampleRate: rate },
    frequencyBinCount: spectrum.length,
    getByteFrequencyData(out) {
      assert.equal(out.length, spectrum.length);
      out.set(spectrum);
    },
  };
}
for (const rate of [44100, 48000, 96000])
  for (const fft of [512, 2048, 4096]) {
    test(
      rate +
        ' Hz / FFT ' +
        fft +
        ' routes bass, mids and treble by frequency and preserves the 15 kHz octave',
      () => {
        for (const [tone, band] of [
          [110, 'bass'],
          [1000, 'mid'],
          [8000, 'high'],
          [15000, 'high'],
        ]) {
          const analyser = source(rate, fft),
            meter = createSpectrumMeter(analyser),
            signal = { bass: 0, mid: 0, high: 0 };
          const bin = Math.round((tone * fft) / rate),
            frequency = (bin * rate) / fft;
          analyser.spectrum[bin] = 255;
          meter.read(signal);
          assert.equal(meter.bins.length, fft / 2);
          assert.equal(meter.bins[bin], 255);
          assert.ok(signal[band] > 0 && signal[band] <= 1, tone + 'Hz should reach ' + band);
          for (const other of ['bass', 'mid', 'high'].filter((b) => b !== band))
            assert.equal(signal[other], 0);
          const count = 24,
            values = Array.from({ length: count }, (_, i) => meter.bucket(i, count));
          assert.ok(values.every((x) => Number.isFinite(x) && x >= 0 && x <= 1));
          const strongest = values.indexOf(Math.max(...values));
          const binWidth = rate / fft,
            index = (f) => Math.floor((Math.log(f / 20) / Math.log(rate / 2 / 20)) * count);
          assert.ok(
            values[strongest] > 0 &&
              strongest >= index(Math.max(20, frequency - binWidth)) - 1 &&
              strongest <= index(frequency + binWidth) + 1,
            tone + ' Hz appears in log bucket ' + strongest,
          );
          analyser.spectrum.fill(0);
          for (let i = 0; i < 120; i++) meter.read(signal);
          assert.ok(Math.max(signal.bass, signal.mid, signal.high) < 0.001);
        }
      },
    );
  }
