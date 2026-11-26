const assert = require('node:assert/strict');

function delayedTone() {
  const rate = 16000, frames = rate * 3;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = rate / 2; i < frames; i++)
    wav.writeInt16LE(Math.round(16000 * Math.sin(2 * Math.PI * 325 * i / rate)), 44 + i * 2);
  return wav;
}

module.exports = async function checkSamplerPad(browser, origin) {
  const page = await browser.newPage();
  try {
    // Read the studio's own output analyser. The native worklet and routing stay in use.
    await page.addInitScript(() => {
      const connect = AudioWorkletNode.prototype.connect;
      AudioWorkletNode.prototype.connect = function(destination, ...args) {
        if (destination instanceof AnalyserNode) window.samplerMeter = destination;
        return connect.call(this, destination, ...args);
      };
      window.samplerPeak = () => {
        if (!window.samplerMeter) return null;
        const data = new Float32Array(window.samplerMeter.fftSize);
        window.samplerMeter.getFloatTimeDomainData(data);
        return data.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
      };
    });
    await page.goto(new URL('/frequency/?lang=it',origin).href);
    const action = id => page.locator('[data-action="' + id + '"]').first();
    const tab = id => page.locator('[data-tab="' + id + '"]').first();
    const field = id => page.locator('[data-field="' + id + '"]').first();
    await action('library').click();
    await action('blank').click();
    await tab('live').click();
    await field('channel').selectOption('15');
    await tab('mixer').click();
    const file = page.locator('#sample-file'), original = await file.elementHandle();
    await file.setInputFiles({name:'delayed-tone.wav', mimeType:'audio/wav', buffer:delayedTone()});
    await page.waitForFunction(node => !node.isConnected, original);
    await original.dispose();
    await field('param:decay').fill('0');
    await action('preview').click();
    await page.waitForFunction(() => window.samplerMeter?.context.state === 'running');
    await action('stop').click();
    await tab('live').click();
    const pad = page.locator('[data-pad="15"]');
    await pad.click({delay:25});
    // The file contains silence for 500 ms, so this peak can only arrive after pointer-up.
    const signal = await page.waitForFunction(() => {
      const peak = window.samplerPeak();
      return peak > 0.02 && peak;
    }, undefined, {timeout:4500});
    const peak = await signal.jsonValue();
    await action('stop').click();
    await page.waitForFunction(() => window.samplerPeak() < 0.0001);

    await tab('mixer').click();
    await field('param:oneShot').fill('0');
    await tab('live').click();
    await pad.click({delay:25});
    // Sample the same audible section on the actual audio clock with gate mode active.
    const gatedPeak = await page.evaluate(async () => {
      const began = window.samplerMeter.context.currentTime, deadline = performance.now() + 4500;
      let maximum = 0;
      while (window.samplerMeter.context.currentTime - began < 1.3) {
        if (performance.now() > deadline) throw Error('Audio clock stopped during gated-pad measurement');
        if (window.samplerMeter.context.currentTime - began >= 0.55)
          maximum = Math.max(maximum, window.samplerPeak());
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      return maximum;
    });
    assert.ok(gatedPeak < 0.001, 'released gate leaked the delayed tone: ' + gatedPeak);
    return { oneShotPeak:peak, gatedPeak };
  } finally {
    await page.close();
  }
};
