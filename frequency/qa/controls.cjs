const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FREQUENCY_BROWSER_EXEC,
  });
  const origin = process.env.FREQUENCY_URL || 'http://127.0.0.1:4198';
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript(() => {
    const post = MessagePort.prototype.postMessage;
    window.__notes = [];
    MessagePort.prototype.postMessage = function (msg, ...rest) {
      if (msg?.type === 'off' || msg?.type === 'held-note')
        window.__notes.push({ type: msg.type, track: msg.track, note: msg.note, token: msg.token });
      return Reflect.apply(post, this, [msg, ...rest]);
    };
  });
  const p = await ctx.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const a = (k) => p.locator('[data-action="' + k + '"]').first(),
    f = (k) => p.locator('[data-field="' + k + '"]').first();
  const prefs = async () => {
    await a('settings').tap();
    await a('ui-preferences').tap();
  };
  const outside = () => p.locator('h1').tap();
  const notes = () => p.evaluate(() => structuredClone(window.__notes));
  try {
    await p.goto(new URL('/frequency/?lang=it', origin).href);
    await prefs();
    assert.equal(await f('bind-0').inputValue(), 'Space');
    assert.equal(await f('bind-1').inputValue(), 'Digit1');
    await f('ui-size').selectOption('150');
    assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).fontSize), '24px');
    await f('bind-0').selectOption('KeyQ');
    await f('bind-1').selectOption('KeyA');
    assert.equal(await f('bind-2').locator('option[value=KeyA]').count(), 0);
    assert.equal(await f('bind-2').locator('option[value=Digit1]').count(), 1);
    // Native dialog keyboard interactions must not start transport or play pads.
    await a('reset-keys').focus();
    await p.keyboard.press('q');
    await p.keyboard.press('a');
    assert.equal(await p.locator('html').getAttribute('data-play'), 'off');
    assert.equal((await notes()).length, 0);
    await a('close').tap();
    const dims = await p.evaluate(() => [
      document.documentElement.scrollWidth,
      innerWidth,
      document.querySelector('meta[name=viewport]').content,
    ]);
    assert.ok(dims[0] <= dims[1] + 1, 'mobile interface overflow ' + JSON.stringify(dims));
    assert.ok(!/maximum-scale|user-scalable\s*=\s*no/.test(dims[2]));
    await outside();
    await p.keyboard.press('q');
    await p.waitForFunction(() => document.documentElement.dataset.play === 'on');
    await p.keyboard.press('q');
    await p.waitForFunction(() => document.documentElement.dataset.play === 'off');
    await p.keyboard.down('a');
    await p.waitForFunction(() => window.__notes.some((m) => m.type === 'held-note'));
    // The key was acquired on the surface; releasing it while a control has focus must still end the note.
    await f('bpm').focus();
    await p.keyboard.up('a');
    await p.waitForFunction(() => window.__notes.some((m) => m.type === 'off'));
    const pair = await notes();
    assert.equal(pair.at(-2).token, pair.at(-1).token);
    assert.equal(pair.at(-1).track, 0);
    await p.keyboard.press('a');
    await p.keyboard.press('q');
    assert.equal((await notes()).length, pair.length);
    assert.equal(await p.locator('html').getAttribute('data-play'), 'off');
    await p.locator('[data-tab=live]').tap();
    await p.locator('[data-pad="3"]').press('Space');
    await p.waitForFunction(
      () => window.__notes.filter((m) => m.track === 3 && m.type === 'off').length === 1,
    );
    assert.equal(await p.locator('html').getAttribute('data-play'), 'off');
    await p.reload();
    await prefs();
    assert.equal(await f('bind-0').inputValue(), 'KeyQ');
    assert.equal(await f('ui-size').inputValue(), '150');
    await a('enable-keys').tap();
    await a('close').tap();
    await outside();
    await p.keyboard.press('q');
    assert.equal(await p.locator('html').getAttribute('data-play'), 'off');
    await prefs();
    await a('reset-keys').tap();
    assert.equal(await f('ui-size').inputValue(), '100');
    assert.equal(await f('bind-0').inputValue(), 'Space');
    await a('close').tap();
    await outside();
    await p.keyboard.press('Space');
    await p.waitForFunction(() => document.documentElement.dataset.play === 'on');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.documentElement.dataset.play === 'off');
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    assert.ok(await p.evaluate(() => visualViewport.scale >= 1.99));
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    assert.deepEqual(errors, []);
    console.log(
      'Chromium',
      browser.version(),
      'mobile touch emulation 390×844, 150% interface, browser zoom 200%, key down/up to audio worklet, modal/input exclusion, persistence, collision handling, disable & restore verified.',
    );
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
