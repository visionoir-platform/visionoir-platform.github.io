const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_BIN });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 600 }, reducedMotion: 'reduce' });
    const url = new URL('/frequency/?lang=it', process.env.CHROMATIC_ORIGIN || 'http://127.0.0.1:4217');
    await page.route('**/*', (r) =>
      r
        .request()
        .url()
        .startsWith(url.origin + '/') && ['GET', 'HEAD'].includes(r.request().method())
        ? r.continue()
        : r.abort(),
    );
    await page.addInitScript(() => {
      const probe = (window.masterProbe = { fft: 0, time: 0 });
      for (const [key, method] of [
        ['fft', 'getByteFrequencyData'],
        ['time', 'getByteTimeDomainData'],
      ]) {
        const read = AnalyserNode.prototype[method];
        AnalyserNode.prototype[method] = function (...args) {
          probe[key]++;
          return read.apply(this, args);
        };
      }
      window.AudioWorkletNode = new Proxy(window.AudioWorkletNode, {
        construct(target, args, type) {
          const node = Reflect.construct(target, args, type);
          probe.port = node.port;
          probe.context = node.context;
          node.port.addEventListener('message', ({ data }) => {
            if (data.type === 'tick') probe.lastTick = data.data;
          });
          return node;
        },
      });
    });
    await page.goto(url.href);
    await page.locator('[data-action=play]').click();
    await page.evaluate(() => scrollTo(0, 0));
    const scopeTop = await page.locator('#scope').evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(scopeTop >= 600, 'oscilloscope must be below the viewport');
    await page.waitForFunction(
      () => window.masterProbe.lastTick && !document.getElementById('db').textContent.includes('∞'),
    );
    const native = await page.evaluate(async () => {
      const values = new Set();
      const fft = window.masterProbe.fft,
        time = window.masterProbe.time;
      for (let i = 0; i < 9; i++) {
        values.add(
          document.getElementById('db').textContent + ' / ' + document.getElementById('rms').textContent,
        );
        await new Promise((resolve) => setTimeout(resolve, 90));
      }
      return {
        values: [...values],
        fft: window.masterProbe.fft - fft,
        waveform: window.masterProbe.time - time,
      };
    });
    assert.ok(native.values.length > 1);
    assert.equal(native.fft, 0);
    assert.equal(native.waveform, 0);
    await page.locator('[data-action=stop]').click();
    const clipping = page.getByRole('meter', { name: 'CLIP' });
    await clipping.waitFor({ state: 'attached' });
    // Isolate the clipping flag with a known meter packet while the real transport is stopped.
    const fixture = await page.evaluate(async () => {
      await window.masterProbe.context.suspend();
      const port = window.masterProbe.port;
      const emit = (clipped) =>
        port.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: 'tick',
              data: {
                ...window.masterProbe.lastTick,
                masterPeak: [0.5, 0.25],
                masterRms: [0.25, 0.125],
                correlation: -0.5,
                clipped,
              },
            },
          }),
        );
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      emit(true);
      await frame();
      const read = (id) => document.getElementById(id).textContent;
      const flagged = document.getElementById('clip-light').getAttribute('aria-valuenow');
      const result = { peak: read('db'), rms: read('rms'), correlation: read('corr'), flagged };
      emit(false);
      await frame();
      result.cleared = document.getElementById('clip-light').getAttribute('aria-valuenow');
      return result;
    });
    assert.deepEqual(fixture, {
      peak: '-6.0 dBFS',
      rms: '-12.0 / -18.1',
      correlation: '-0.50',
      flagged: '1',
      cleared: '0',
    });
    const report = { browser: browser.version(), scopeTop, viewportHeight: 600, native, fixture };
    if (process.env.MASTER_READINGS_PROOF)
      await fs.writeFile(process.env.MASTER_READINGS_PROOF, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
