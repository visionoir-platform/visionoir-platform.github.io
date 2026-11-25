// Probe the rendered home on a simulated device. Only the test browser sees this instrumentation.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const url = process.env.VISIONOIR_QA_URL || 'http://127.0.0.1:4181/it/';
const args = { headless: true, executablePath: process.env.BROWSER_BIN, args: ['--mute-audio'] };

function observeLogo(disableWebGL) {
  localStorage.setItem('visionoir-silent', '1');
  if (disableWebGL) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type.includes('webgl') ? null : getContext.call(this, type, ...args);
    };
    return;
  }
  const gl = WebGL2RenderingContext.prototype;
  const getUniform = gl.getUniformLocation;
  const setMatrix = gl.uniformMatrix4fv;
  const matrices = new WeakMap();
  gl.getUniformLocation = function (program, name) {
    const location = getUniform.call(this, program, name);
    if (location && name === 'modelViewMatrix' && this.canvas.closest('#logo-scene')
        && getUniform.call(this, program, 'uSurfaceFlow')) matrices.set(location, true);
    return location;
  };
  gl.uniformMatrix4fv = function (location, transpose, data, ...rest) {
    if (matrices.has(location)) window.logoTranslationX = data[12];
    return setMatrix.call(this, location, transpose, data, ...rest);
  };
}

async function read(page) {
  return page.evaluate(() => {
    const transform = (selector, pseudo = null) =>
      getComputedStyle(document.querySelector(selector), pseudo).transform;
    const bounds = (selector) => {
      const {x, y, width, height} = document.querySelector(selector).getBoundingClientRect();
      return [x, y, width, height];
    };
    return {
      logoX: window.logoTranslationX ?? null,
      grid: transform('.intro', '::before'),
      glow: transform('.intro', '::after'),
      pack: transform('.service-card-custom', '::before'),
      instagram: transform('.social-mark'),
      poster: transform('#logo-scene .scene-fallback'),
      hitboxes: ['#logo-scene','.social','.service-card-custom .underlink'].map(bounds)
    };
  });
}

async function probe(browser, disableWebGL) {
  const page = await browser.newPage({ viewport: {width: 390, height: 844}, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(observeLogo, disableWebGL);
    const cdp = await page.context().newCDPSession(page);
    const orient = (gamma) => cdp.send('DeviceOrientation.setDeviceOrientationOverride', {alpha: 0, beta: 40, gamma});
    await orient(0);
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    const state = disableWebGL ? 'fallback' : 'webgl';
    await page.waitForSelector('#logo-scene[data-render-state="' + state + '"]', {timeout: 20000});
    await page.locator('#logo-scene').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    // Force a new reading after startup, also on virtual devices that only emit on change.
    await orient(.1);
    await page.waitForTimeout(180);
    if (!disableWebGL) await page.waitForFunction(() => Number.isFinite(window.logoTranslationX));
    const neutral = await read(page);

    async function side(angle) {
      await orient(angle);
      await page.waitForFunction(({grid, logoX, disabled}) => {
        const shifted = getComputedStyle(document.querySelector('.intro'), '::before').transform !== grid;
        return shifted && (disabled || Math.abs(window.logoTranslationX - logoX) > .035);
      }, { grid: neutral.grid, logoX: neutral.logoX, disabled: disableWebGL }, { timeout: 5000 });
      await page.waitForTimeout(400);
      return read(page);
    }
    const right = await side(32);
    const left = await side(-32);
    for (const key of ['grid','glow','pack','instagram','poster']) assert.notEqual(right[key], left[key], key);
    for (const sample of [left, right]) assert.deepEqual(sample.hitboxes, neutral.hitboxes, 'interactive areas moved');
    if (!disableWebGL) {
      assert.ok((right.logoX-neutral.logoX)*(left.logoX-neutral.logoX)<0, 'opposite rotations must move the scene in opposite directions');
      await page.locator('#immersive').click();
      await page.waitForSelector('#immersive-view #logo-scene[data-render-state="webgl"]');
      await orient(32);
      await page.waitForFunction(previous => Math.abs(window.logoTranslationX-previous)>.06, left.logoX);
      await page.locator('#exit-immersive').click();
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(() => document.documentElement.classList.contains('reduced-motion'));
    const reduced = await read(page);
    assert.equal(reduced.grid, 'none');
    assert.equal(reduced.instagram, 'none');
    assert.equal(reduced.poster, 'none');
    assert.deepEqual(errors, []);
    return {state, neutralX:neutral.logoX, rightX:right.logoX, leftX:left.logoX, stableHitboxes:true,
      immersive:!disableWebGL, reducedMotion:true, passiveOrientation:true};
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch(args);
  try {
    const webgl = await probe(browser, false);
    const fallback = await probe(browser, true);
    console.log(JSON.stringify({url, browser:browser.version(), input:'Chromium DevTools device-orientation emulation', webgl, fallback}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
