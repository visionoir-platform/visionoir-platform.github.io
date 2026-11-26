const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.FREQUENCY_BROWSER_EXEC});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const controls = new Map();
      window.probe = {controls, starts:0, resumes:0};
      const bind = MediaSession.prototype.setActionHandler;
      MediaSession.prototype.setActionHandler = function(name, handler) {
        bind.call(this, name, handler);
        controls.set(name, handler);
      };
      const Native = AudioWorkletNode;
      window.AudioWorkletNode = class extends Native {
        constructor(...args) {
          super(...args);
          if (args[1] !== 'frequency-rack-v1') return;
          probe.ctx = this.context;
          const send = this.port.postMessage.bind(this.port);
          this.port.postMessage = (msg, ...rest) => {
            if (msg.type === 'play') probe.starts++;
            if (msg.type === 'resume') probe.resumes++;
            return send(msg, ...rest);
          };
        }
      };
    });
    await page.goto(new URL('/frequency/?lang=it',process.argv[2]).href);
    const play = page.locator('[data-action="play"]').first();
    await play.waitFor();
    assert.equal(await page.evaluate(() => probe.controls.size), 0);
    await play.click();
    await page.waitForFunction(() => navigator.mediaSession.playbackState === 'playing' && document.querySelector('#clock').textContent !== '001.01.01');
    const metadata = await page.evaluate(() => {
      const {title,album,artwork} = navigator.mediaSession.metadata;
      return {title,album,cover:artwork.at(-1).src};
    });
    assert.ok(metadata.title && metadata.album === 'VISIONOIR: FREQUENCY');
    assert.ok(metadata.cover.endsWith('/assets/visionoir-original-cover-v1-512.png'));
    assert.equal((await page.request.get(metadata.cover)).status(),200);
    // Dispatch the registered OS action while retaining the browser's native metadata and player.
    await page.evaluate(() => probe.controls.get('pause')());
    await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused' && document.querySelector('#state').textContent === 'In pausa');
    await page.waitForTimeout(95); // drain the last meter packet before recording the frozen cursor
    const cursor = await page.locator('#clock').innerText();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#clock').innerText(),cursor);
    await page.evaluate(() => probe.controls.get('play')());
    await page.waitForFunction(pos => document.querySelector('#clock').textContent !== pos && navigator.mediaSession.playbackState === 'playing',cursor);
    // A suspended AudioContext is genuinely silent even when the transport was running.
    await page.evaluate(() => probe.ctx.suspend());
    await page.waitForFunction(() => document.documentElement.dataset.play === 'off' && navigator.mediaSession.playbackState === 'paused');
    await play.click();
    await page.waitForFunction(() => probe.ctx.state === 'running' && navigator.mediaSession.playbackState === 'playing' && probe.resumes === 2);
    const starts = await page.evaluate(() => probe.starts);
    assert.equal(starts,1);
    await page.evaluate(() => probe.controls.get('stop')());
    await page.waitForFunction(() => navigator.mediaSession.metadata === null && navigator.mediaSession.playbackState === 'none' && !probe.controls.get('play'));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(), cursor, starts, resumes:2, realContextSuspension:true, dispatchedMediaActions:true, physicalControls:false, ...metadata, errors}));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
