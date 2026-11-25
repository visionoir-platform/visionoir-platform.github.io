const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const base = process.env.CHROMATIC_ORIGIN || 'http://127.0.0.1:4271',
  out = process.env.CHROMATIC_PROOF;
const tests = {};
async function test(disable) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_BIN,
    args: disable ? ['--disable-webgl'] : ['--enable-unsafe-swiftshader'],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 790 },
      deviceScaleFactor: 1,
      hasTouch: true,
      reducedMotion: 'reduce',
    });
    const page = await ctx.newPage(),
      requests = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname.endsWith('.glb')) requests.push(u.pathname);
    });
    await page.route('**/__creator-proof', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><head></head><body style="margin:0;background:#101013"><main style="height:2400px"></main><div id="creator" style="height:430px;width:100%;position:relative"><img style="width:100%" src="/creator/poster.webp" alt="Flavio Giorgio Guarini"></div></body></html>',
      }),
    );
    await page.goto(base + '/__creator-proof');
    await page.evaluate(async () => {
      const api = await import('/src/creator/index.js');
      window.mode = 'chrome';
      window.input = { bass: 0.5, mid: 0.25, high: 0.1, level: 0.33 };
      window.avatar = api.mountCreator(document.querySelector('#creator'), {
        getSignal: () => window.input,
        getMode: () => window.mode,
      });
    });
    await page.waitForTimeout(100);
    assert.deepEqual(requests, []);
    await page.locator('#creator').scrollIntoViewIfNeeded();
    const expected = disable ? 'fallback' : 'webgl';
    await page.waitForFunction(
      (state) => document.querySelector('#creator').dataset.render === state,
      expected,
    );
    if (disable) {
      assert.deepEqual(requests, []);
      await page.locator('#creator').screenshot({ path: path.join(out, 'creator-fallback.png') });
    } else {
      assert.deepEqual(requests, ['/creator/creator-mobile.glb']);
      await page.locator('#creator').screenshot({ path: path.join(out, 'creator-mobile.png') });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const sample = await page.evaluate(
        () =>
          new Promise((resolve) => {
            let prior = performance.now();
            const times = [];
            const until = prior + 2200;
            function iter(t) {
              if (t > prior) times.push(t - prior);
              prior = t;
              if (t < until) requestAnimationFrame(iter);
              else {
                times.sort((a, b) => a - b);
                resolve({
                  n: times.length,
                  medianMs: times[Math.floor(times.length / 2)],
                  p90Ms: times[Math.floor(times.length * 0.9)],
                });
              }
            }
            requestAnimationFrame(iter);
          }),
      );
      tests.renderTiming = sample;
      const supported = await page.evaluate(() => {
        const webgl = document.querySelector('#creator canvas').getContext('webgl2');
        const ext = webgl?.getExtension('WEBGL_lose_context');
        if (!ext) return false;
        window.restoreContext = () => ext.restoreContext();
        ext.loseContext();
        return true;
      });
      if (supported) {
        await page.waitForFunction(
          () => document.querySelector('#creator').dataset.render === 'context-lost',
        );
        await page.evaluate(() => window.restoreContext());
        await page.waitForFunction(() => document.querySelector('#creator').dataset.render === 'webgl');
      }
      tests.contextRestored = supported;
    }
    tests[disable ? 'noWebGL' : 'mobileViewport'] = {
      w: 390,
      h: 790,
      touchEmulation: true,
      lazy: true,
      requests,
      render: expected,
    };
  } finally {
    await browser.close();
  }
}
(async () => {
  if (!out) throw Error('Missing proof folder');
  await test(false);
  await test(true);
  fs.writeFileSync(path.join(out, 'device.json'), JSON.stringify(tests, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
