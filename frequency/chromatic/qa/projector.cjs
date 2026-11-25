const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const origin = process.env.CHROMATIC_ORIGIN || 'http://127.0.0.1:4198';
const proof = process.env.CHROMATIC_PROOF;

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_BIN,
    args: ['--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1180, height: 810 },
    reducedMotion: 'reduce',
  });
  // Passive instrumentation of browser boundaries; all transport, pads and popup actions use real UI.
  await context.addInitScript(() => {
    const counts = { contexts: 0, fft: 0, frames: 0, bands: [], hits: [], shaderMax: 0 };
    if (window.WebGL2RenderingContext) {
      const gl = WebGL2RenderingContext.prototype,
        locations = new WeakSet(),
        locate = gl.getUniformLocation,
        submit = gl.uniform1fv;
      gl.getUniformLocation = function (...args) {
        const result = Reflect.apply(locate, this, args);
        if (result && /^uVoices(?:\[0\])?$/.test(args[1])) {locations.add(result);counts.shaderLocations=(counts.shaderLocations||0)+1;}
        return result;
      };
      gl.uniform1fv = function (loc, values, ...args) {
        if (loc && locations.has(loc)) {counts.shaderWrites=(counts.shaderWrites||0)+1;counts.shaderMax = Math.max(counts.shaderMax, ...values);}
        return Reflect.apply(submit, this, [loc, values, ...args]);
      };
    }
    window.__projectorCounts = counts;
    const AC = window.AudioContext;
    window.AudioContext = new Proxy(AC, {
      construct(target, args, type) {
        counts.contexts++;
        return Reflect.construct(target, args, type);
      },
    });
    const read = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = function (...args) {
      counts.fft++;
      return Reflect.apply(read, this, args);
    };
    window.addEventListener('message', (e) => {
      if (
        !window.opener ||
        e.origin !== location.origin ||
        e.source !== window.opener ||
        e.data?.id !== new URL(location.href).searchParams.get('output')
      )
        return;
      if (e.data.type === 'visionoir.visual.hit')
        counts.hits.push({ index: e.data.index, value: e.data.value });
      if (e.data.type === 'visionoir.visual.frame') {
        const s = e.data.signal;
        counts.frames++;
        counts.bands.push([s.bass, s.mid, s.high].map((n) => Math.round(n * 10000)).join('/'));
        if (counts.bands.length > 128) counts.bands.shift();
      }
    });
  });
  const page = await context.newPage();
  const report = { browser: browser.version(), visibilityOverrides: [], errors: [] };
  const errors = (p) => p.on('pageerror', (e) => report.errors.push(e.message));
  errors(page);
  async function visibility(target, hidden, label) {
    if (!hidden) await target.bringToFront();
    const applied = await target.evaluate((hidden) => {
      if (document.hidden === hidden) return false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (hidden ? 'hidden' : 'visible'),
      });
      document.dispatchEvent(new Event('visibilitychange'));
      return true;
    }, hidden);
    if (applied) report.visibilityOverrides.push(label);
  }
  const counts = (p) => p.evaluate(() => structuredClone(window.__projectorCounts));
  async function noSampling(reason) {
    // One pending timer can still arrive during the visibility/message handshake.
    await page.waitForTimeout(950);
    const before = await counts(page);
    await page.waitForTimeout(1550);
    const after = await counts(page);
    assert.equal(after.fft, before.fft, reason);
    return after.fft - before.fft;
  }
  try {
    await page.goto(new URL('/frequency/?lang=it', origin).href);
    const promised = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Finestra proiettore', exact: true }).click();
    const output = await promised;
    errors(output);
    await output.locator('.chromatic-projector').waitFor();
    await output.waitForFunction(() => window.__projectorCounts.frames > 0);
    assert.equal(await page.locator('html').getAttribute('data-play'), 'off');
    await output.evaluate(() => {
      window.__projectorCounts.shaderMax = 0;
    });
    await page.getByRole('button', { name: 'Impulso', exact: true }).click();
    await output.waitForFunction(
      () => window.__projectorCounts.hits.some((h) => h.index === 0 && h.value === 1),
      null,
      { timeout: 8000 },
    );
    await output.waitForFunction(() => window.__projectorCounts.shaderMax > 0.005,null,{timeout:4500}).catch(async()=>{throw Error('shader '+JSON.stringify(await output.evaluate(()=>({...window.__projectorCounts,bands:undefined,state:document.querySelector('.chromatic-surface')?.dataset.render,hidden:document.hidden}))))});
    report.manualGpuImpulse = (await counts(output)).shaderMax;
    await page.locator('[data-tab=live]').click();
    await page.locator('[data-pad="2"]').click();
    await output.waitForFunction(() =>
      window.__projectorCounts.hits.some((h) => h.index === 2 && h.value > 0),
    );
    report.manualHits = (await counts(output)).hits;
    await page.locator('[data-action=play]').click();
    await page.waitForFunction(
      () => document.documentElement.dataset.play === 'on' && window.__projectorCounts.fft >= 2,
    );
    await visibility(output, false, 'popup visible');
    await visibility(page, true, 'workstation hidden with visible popup');
    const initial = await counts(page);
    await output.evaluate(() => {
      window.__projectorCounts.bands.length = 0;
    });
    await output.waitForFunction(() => new Set(window.__projectorCounts.bands).size >= 3, null, {
      timeout: 10000,
    });
    const projected = await counts(output),
      current = await counts(page);
    assert.ok(current.fft > initial.fft, 'hidden workstation did not read fresh master FFT');
    report.hiddenWorkstation = {
      fftReads: current.fft - initial.fft,
      distinctSpectra: new Set(projected.bands).size,
    };
    await visibility(output, true, 'popup hidden');
    report.bothHiddenReads = await noSampling('both windows hidden');
    await visibility(output, false, 'popup restored');
    await page.waitForFunction((old) => window.__projectorCounts.fft > old, (await counts(page)).fft);
    report.audioContexts = {
      studio: (await counts(page)).contexts,
      projector: (await counts(output)).contexts,
    };
    assert.deepEqual(report.audioContexts, { studio: 1, projector: 0 });
    await output.close();
    await visibility(page, true, 'workstation hidden after popup closes');
    report.closedOutputReads = await noSampling('projector closed with workstation hidden');
    assert.equal(await page.locator('html').getAttribute('data-play'), 'on');
    await context.addInitScript(() => {
      // This init script is installed after the existing workstation has loaded.
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        if (type.includes('webgl')) {window.__blockedWebGL=true;return null;}
        return Reflect.apply(get, this, [type, ...args]);
      };
    });
    await visibility(page, false, 'workstation restored before reopening');
    const fallbackReady = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Finestra proiettore', exact: true }).click();
    const fallback = await fallbackReady;
    await fallback.waitForFunction(()=>window.__blockedWebGL===true);
    await fallback.locator('.chromatic-surface[data-render=fallback]').waitFor();
    await visibility(fallback, false, 'visible fallback');
    await visibility(page, true, 'workstation hidden with fallback VJ');
    report.webglFallbackReads = await noSampling('fallback-only projector cannot use FFT');
    assert.equal((await counts(fallback)).contexts, 0);
    await fallback.close();
    assert.deepEqual(report.errors, []);
    if (proof) {
      await fs.mkdir(proof, { recursive: true });
      await fs.writeFile(path.join(proof, 'projector-background.json'), JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
