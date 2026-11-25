import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject, INSTRUMENTS, validateProject} from '../model.js';
import {DSP} from '../dsp.js';
import {designTimbre} from '../../timbre-design.js';

test('two adjacent timbre seeds make different audible voices on all sixteen instruments', () => {
  const project = createProject('blank');
  for (const [channel, instrument] of INSTRUMENTS.entries()) {
    const hashes = [];
    for (const seed of [133, 134]) {
      const params = designTimbre(instrument.id, seed);
      assert.deepEqual(params, designTimbre(instrument.id, seed));
      for (const [key, value] of Object.entries(params)) {
        assert.ok(Object.hasOwn(instrument.params, key), instrument.id + '/' + key);
        assert(value >= 0 && value <= 1);
      }
      if (instrument.id === 'sampler') assert.deepEqual(Object.keys(params).sort(), ['attack','cutoff','decay']);
      project.tracks[channel].params = {...instrument.params, ...params};
      validateProject(project);
      const render = new DSP(project, 48000);
      const left = new Float32Array(8192), right = new Float32Array(left.length);
      render.trigger(channel, 48, 0.9, 0.15);
      render.render(left,right);
      assert(left.every(Number.isFinite));
      assert(left.some(v => Math.abs(v) > 0.0001), instrument.id);
      hashes.push(createHash('sha256').update(Buffer.from(left.buffer)).digest('hex'));
    }
    assert.notEqual(hashes[0],hashes[1],instrument.id);
  }
});
