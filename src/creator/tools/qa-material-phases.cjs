/* Run against a served Italian site build. Write private captures outside the repository. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = new URL(process.env.CREATOR_URL || 'http://127.0.0.1:4181/it/');
const output = process.env.CREATOR_PROOF;
const tracks = [
  ['chrome', 'visionoir-cromo.mp3'],
  ['acid', 'visionoir-acid-mode.mp3'],
  ['noir', 'visionoir-noir.mp3'],
  ['afterimage', 'visionoir-acid.mp3'],
  ['alloy', 'visionoir-metallogram.mp3'],
  ['aura', 'visionoir-velum.mp3'],
];

// Observe arguments actually submitted to WebGL. Leave renderer, native media and browser policies intact.
function observeCanvas() {
  localStorage.setItem('visionoir-silent', '1');
  const gl = WebGL2RenderingContext.prototype;
  const locations = new WeakMap();
  const qs = window.portraitQA = { current: {}, transitions: [], renderTimes: [], echoes: 0, draws: 0 };
  const observed = new Set(['uProfile', 'uTime', 'uLiquid', 'uScatter', 'uEcho', 'uAudio']);
  const active = new WeakMap(), values = new WeakMap();
  // Take a small binary silhouette from one complete rendered frame, only on explicit request.
  qs.silhouette = () => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { qs.captureMask = null; reject(Error('Portrait did not draw a frame for readback')); }, 7000);
    qs.captureMask = mask => { clearTimeout(timer); resolve(mask); };
  });
  const get = gl.getUniformLocation;
  gl.getUniformLocation = function (program, name) {
    const loc = get.call(this, program, name);
    if (loc && observed.has(name) && this.canvas.closest('#creator-stage')) {
      if (!values.has(program)) values.set(program, {});
      locations.set(loc, { name, state: values.get(program) });
    }
    return loc;
  };
  const use = gl.useProgram;
  gl.useProgram = function (program) {
    active.set(this, program);
    return use.call(this, program);
  };
  for (const method of ['uniform1f', 'uniform4f', 'uniform4fv']) {
    const send = gl[method];
    gl[method] = function (loc, ...args) {
      const info = locations.get(loc);
      if (info) {
        const { name, state } = info;
        const value = name === 'uAudio' ? Array.from(method === 'uniform4fv' ? args[0] : args) : args[0];
        state[name] = value;
        if (name === 'uLiquid' && value !== qs.current.uLiquid) qs.transitions.push(value);
        if (name === 'uTime' && value !== qs.current.uTime) qs.renderTimes.push(performance.now());
        qs.current[name] = value;
      }
      return send.call(this, loc, ...args);
    };
  }
  for (const method of ['drawElements', 'drawArrays']) {
    const draw = gl[method];
    gl[method] = function (...args) {
      const state = values.get(active.get(this));
      if (state) qs.draws++;
      if (state?.uEcho > 0) qs.echoes++;
      if (state && qs.captureMask) {
        const done = qs.captureMask;
        qs.captureMask = null;
        queueMicrotask(() => {
          const w = this.drawingBufferWidth, h = this.drawingBufferHeight;
          const pixels = new Uint8Array(w * h * 4);
          this.readPixels(0, 0, w, h, this.RGBA, this.UNSIGNED_BYTE, pixels);
          const side = 128, mask = [];
          for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
            const col = Math.floor((x + 0.5) * w / side), row = Math.floor((y + 0.5) * h / side);
            mask.push(Number(pixels[(row * w + col) * 4 + 3] >= 128));
          }
          done(mask);
        });
      }
      return draw.apply(this, args);
    };
  }
}

function compareMasks(a, b) {
  let common = 0, union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) common++;
    if (a[i] || b[i]) union++;
  }
  assert.ok(union > 300 && union < a.length * 0.95, 'Readback must contain both portrait and background');
  return { occupied: union, changed: union - common, overlap: common / union };
}

function frameSummary(times) {
  const intervals = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
  const percentile = (n) => intervals.length ? Math.round(intervals[Math.floor((intervals.length - 1) * n)]) : null;
  return { samples: intervals.length, medianMs: percentile(0.5), p95Ms: percentile(0.95) };
}

async function inspect(browser, mobile, results) {
  const name = mobile ? 'mobile' : 'desktop';
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: 'no-preference',
  });
  const report = { viewport: name, models: [], errors: [], tracks: [] };
  results.push(report);
  try {
    await context.route('**/*', route => {
      const request = route.request();
      return new URL(request.url()).origin === url.origin && ['GET', 'HEAD'].includes(request.method())
        ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error' && /GL_INVALID|THREE.WebGLProgram|shader error/i.test(m.text())) report.errors.push(m.text());
    });
    page.on('response', r => {
      if (/\/creator\/creator-(desktop|mobile)\.glb$/.test(r.url())) report.models.push([new URL(r.url()).pathname, r.status()]);
    });
    await page.addInitScript(observeCanvas);
    await page.goto(url.href);
    const stage = page.locator('#creator-stage');
    const sound = page.locator('#sound-toggle');
    const select = page.locator('#track-select');
    const wait = (predicate, arg) => page.waitForFunction(predicate, arg, { timeout: 20000 });
    const capture = label => stage.screenshot({ path: path.join(output, name + '-' + label + '.png') });
    async function silhouette() {
      // Re-selecting the current finish is a real invalidation, also when the resting renderer is asleep.
      const [mask] = await Promise.all([
        page.evaluate(() => window.portraitQA.silhouette()),
        page.locator('[data-look="metal"]').click(),
      ]);
      return mask;
    }
    await stage.scrollIntoViewIfNeeded();
    await wait(() => document.querySelector('#creator-stage').dataset.render === 'webgl' && window.portraitQA.current.uProfile === 0);
    assert.deepEqual(report.models, [['/creator/creator-' + name + '.glb', 200]]);

    // Compare a material transition at the same camera angle with all bands silent.
    if (!mobile) {
      await capture('cromo');
      assert.ok(await page.evaluate(() => window.portraitQA.current.uLiquid < 0.01));
      await page.evaluate(() => { window.portraitQA.transitions.length = 0; });
      await page.locator('[data-look="liquid"]').click();
      await wait(() => window.portraitQA.current.uLiquid > 0.99);
      report.liquidTransition = await page.evaluate(() => [...new Set(window.portraitQA.transitions)]);
      assert.ok(report.liquidTransition.filter(v => v > 0 && v < 0.99).length >= 2, 'Expected intermediate liquid values');
      assert.ok(report.liquidTransition.every((v, i, all) => !i || v >= all[i - 1]), 'Liquid transition reversed');
      await capture('liquido');
      await page.locator('[data-look="metal"]').click();
      await wait(() => window.portraitQA.current.uLiquid < 0.01);
    }

    const finalIndex = mobile ? 3 : 5;
    await select.selectOption(tracks[finalIndex][0]);
    await wait(i => window.portraitQA.current.uProfile === i && window.portraitQA.current.uScatter < 0.001, finalIndex);
    await capture('riposo');
    const restingMask = await silhouette();
    await select.selectOption('chrome');
    await sound.click();
    // Mobile exercises the costliest replicated profile and the low-detail mesh.
    for (const index of mobile ? [3] : tracks.keys()) {
      const [id, file] = tracks[index];
      await select.selectOption(id);
      await stage.scrollIntoViewIfNeeded();
      await wait(({ index, file }) => {
        const current = window.portraitQA.current;
        const playing = [...document.querySelectorAll('audio')].filter(a => !a.paused);
        return current.uProfile === index && current.uAudio?.every(v => v > 0.0001) &&
          playing.length === 1 && playing[0].currentSrc.endsWith('/' + file) &&
          !playing[0].muted && playing[0].volume > 0 && playing[0].currentTime > 0.2 && playing[0].readyState >= 2;
      }, { index, file });
      const start = await page.evaluate(() => {
        const q = window.portraitQA;
        q.renderTimes.length = 0;
        return { time: [...document.querySelectorAll('audio')].find(a => !a.paused).currentTime, echoDraws: q.echoes };
      });
      await wait(({ time, echoDraws, id }) => {
        const audio = [...document.querySelectorAll('audio')].find(a => !a.paused);
        return audio?.currentTime > time + 1.2 && (id !== 'afterimage' || window.portraitQA.echoes > echoDraws);
      }, { ...start, id });
      const current = await page.evaluate(() => {
        const q = window.portraitQA;
        const a = [...document.querySelectorAll('audio')].find(a => !a.paused);
        return { uniforms: q.current, time: a.currentTime, echoDraws: q.echoes, renderTimes: q.renderTimes };
      });
      const { renderTimes, ...state } = current;
      assert.ok(state.uniforms.uScatter > 0, id + ' did not disintegrate with audio');
      if (index === finalIndex) {
        const playingMask = await silhouette();
        report.playingSilhouette = compareMasks(restingMask, playingMask);
        assert.ok(report.playingSilhouette.changed > 0, 'Audible signal must change the rendered alpha mask');
      }
      report.tracks.push({ id, file, elapsed: state.time - start.time, echoPasses: state.echoDraws - start.echoDraws,
        bands: state.uniforms.uAudio, scatter: state.uniforms.uScatter, frames: frameSummary(renderTimes) });
      await capture(id + '-audio');
    }
    await sound.click();
    await stage.scrollIntoViewIfNeeded();
    await wait(() => {
      const q = window.portraitQA.current;
      return [...document.querySelectorAll('audio')].every(a => a.paused) && q.uScatter < 0.001 && q.uAudio.every(v => v < 0.001);
    });
    // The engine stops issuing the echo program when its mesh becomes invisible. Its last uniform is stale.
    const settled = await page.evaluate(() => {
      const { uProfile, uLiquid, uTime, uAudio, uScatter } = window.portraitQA.current;
      return { uProfile, uLiquid, uTime, uAudio, uScatter, draws: window.portraitQA.echoes };
    });
    assert.equal(settled.uTime, 0, 'Idle deformation clock must reset');
    report.reconstructedSilhouette = compareMasks(restingMask, await silhouette());
    const idleEchoDraws = await page.evaluate(() => window.portraitQA.echoes) - settled.draws;
    assert.equal(idleEchoDraws, 0, 'Echo persisted in the reconstructed frame');
    delete settled.draws;
    report.silence = { ...settled, echoDraws: idleEchoDraws };
    assert.ok(report.reconstructedSilhouette.overlap > 0.99, 'Paused silhouette must reconstruct at the same camera angle');
    await capture('silenzio');
    const idleStart = await page.evaluate(() => window.portraitQA.draws);
    await page.waitForTimeout(350);
    report.silence.additionalDraws = await page.evaluate(() => window.portraitQA.draws) - idleStart;
    assert.equal(report.silence.additionalDraws, 0, 'Idle portrait continued drawing after reconstruction');
    // An actual native media clock continues to advance with movement suppressed.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sound.click();
    await wait(() => window.portraitQA.current.uScatter < 0.001 && window.portraitQA.current.uAudio.every(v => v < 0.001));
    const before = await page.evaluate(() => ({ time: [...document.querySelectorAll('audio')].find(a => !a.paused)?.currentTime ?? 0,
      clock: window.portraitQA.current.uTime, echo: window.portraitQA.echoes }));
    await wait(t => [...document.querySelectorAll('audio')].some(a => !a.paused && a.currentTime > t + 0.75), before.time);
    const after = await page.evaluate(() => ({ clock: window.portraitQA.current.uTime, echo: window.portraitQA.echoes }));
    assert.deepEqual(after, { clock: before.clock, echo: before.echo });
    report.reducedMotion = true;
    assert.deepEqual(report.errors, []);
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(output, 'Set CREATOR_PROOF to a private output directory');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use a local build');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_BIN,
    args: ['--enable-unsafe-swiftshader', '--mute-audio'] });
  const results = { browser: browser.version(), url: url.href, profiles: [] };
  try {
    await inspect(browser, false, results.profiles);
    await inspect(browser, true, results.profiles);
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output, 'material-phases.json'), JSON.stringify(results, null, 2));
  }
  console.log('Portrait material checks passed for desktop and mobile viewport.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
