const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const which = process.argv[2] || 'chromium';
const src = process.env.FREQUENCY_URL || 'http://127.0.0.1:4198/';
const evidence = process.env.FREQUENCY_PROOF;
(async () => {
  const temporary =
    which === 'firefox' && process.platform === 'darwin'
      ? fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'frequency-edit-gecko-'))
      : undefined;
  const browser = await { chromium, webkit, firefox }[which].launch({
    env: temporary ? { ...process.env, CFFIXED_USER_HOME: temporary } : process.env,
    headless: true,
    executablePath: process.env.FREQUENCY_BROWSER_EXEC || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(8000);
  const a = (id) => page.locator('[data-action="' + id + '"]').first();
  const f = (id) => page.locator('[data-field="' + id + '"]').first();
  const cell = (pos, note) =>
    page.locator('[data-action="piano-cell"][data-pos="' + pos + '"][data-note="' + note + '"]');
  const tab = (name) => page.locator('[data-tab="' + name + '"]').click();
  const change = async (id, value) => {
    await f(id).fill(String(value));
    await f(id).press('Tab');
  };
  const screen = async (name) => {
    if (evidence) {
      fs.mkdirSync(evidence, { recursive: true });
      await page.screenshot({ path: path.join(evidence, which + '-' + name + '.png') });
    }
  };
  async function drag(from, to) {
    await from.scrollIntoViewIfNeeded();
    await to.scrollIntoViewIfNeeded();
    const a = await from.boundingBox(),
      b = await to.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 9 });
    await page.mouse.up();
  }
  try {
    await page.goto(new URL('/frequency/?lang=it', src).href);
    await a('inspect-step').waitFor();
    const existent = page.locator('[data-action="step"][aria-pressed=true]').first();
    const pos = await existent.getAttribute('data-pos'),
      ch = await existent.getAttribute('data-channel');
    await a('inspect-step').click();
    await existent.click();
    await f('note:velocity').waitFor();
    await a('close').click();
    assert.equal(
      await page
        .locator('[data-action="step"][data-channel="' + ch + '"][data-pos="' + pos + '"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    await a('inspect-step').click();
    await tab('piano');
    await f('channel').selectOption('0');
    await f('octave').selectOption('3');
    await cell(1, 37).click();
    await drag(cell(1, 37), cell(2, 40));
    assert.equal(await cell(2, 40).getAttribute('data-root'), '40');
    await f('piano-tool').selectOption('gate');
    await drag(cell(2, 40), cell(5, 40));
    assert.equal(await f('piano-gate').inputValue(), '4');
    assert.equal(await cell(5, 40).getAttribute('data-origin'), '2');
    await change('piano-velocity', 58);
    assert.equal(await f('piano-velocity').inputValue(), '58');
    await f('piano-tool').selectOption('chords');
    await cell(2, 43).click();
    assert.equal(await cell(2, 43).getAttribute('data-root'), '40');
    await f('piano-tool').selectOption('shift');
    await cell(2, 40).click();
    await a('duplicate-notes').click();
    assert.equal(await cell(3, 43).getAttribute('data-origin'), '3');
    await a('undo').click();
    assert.equal(await cell(3, 43).getAttribute('data-origin'), '2');
    await screen('piano');
    await tab('arrangement');
    const clipRows = page.locator('[data-arrange-index]');
    const originalLabels = await clipRows.locator('select option:checked').allTextContents();
    assert.notEqual(originalLabels[0], originalLabels[1]);
    await drag(page.locator('[data-grip="0"]'), page.locator('[data-grip="1"]'));
    assert.deepEqual((await clipRows.locator('select option:checked').allTextContents()).slice(0, 2), [
      originalLabels[1],
      originalLabels[0],
    ]);
    const grip = page.locator('[data-grip="0"]');
    await grip.press('Enter');
    await f('clip-position').selectOption('1');
    assert.deepEqual(
      (await clipRows.locator('select option:checked').allTextContents()).slice(0, 2),
      originalLabels.slice(0, 2),
    );
    await a('undo').click();
    await a('auto-open').press('Enter');
    await f('auto-target').selectOption('pan');
    await change('auto-step', 1);
    await change('auto-value', -70);
    await a('auto-add').click();
    await change('auto-step', 8);
    await change('auto-value', 80);
    await a('auto-add').click();
    assert.equal(await f('auto-select').locator('option').count(), 2);
    const graph = page.locator('[data-curve]'),
      box = await graph.boundingBox();
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.4);
    assert.equal(await f('auto-select').locator('option').count(), 3);
    const point = page.locator('.curve [data-point="7"]');
    const handle = await point.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5, { steps: 7 });
    await page.mouse.up();
    assert.equal(await f('auto-select').locator('option').count(), 3);
    assert.equal(await page.locator('.curve [data-point="7"]').count(), 0);
    await screen('automation');
    await f('auto-target').focus();
    await f('auto-target').press('Home');
    await f('auto-target').press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'auto-target');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'auto-open');
    await tab('live');
    await f('channel').selectOption('2');
    const mute = page.locator('.live-channel [data-action=mute]'),
      init = await mute.getAttribute('aria-pressed');
    await mute.click();
    assert.notEqual(await mute.getAttribute('aria-pressed'), init);
    const liveVolume = page.locator('.live-channel input[type=range]');
    const before = Number(await liveVolume.inputValue());
    await liveVolume.press(before > 0.5 ? 'ArrowLeft' : 'ArrowRight');
    assert.notEqual(Number(await liveVolume.inputValue()), before);
    await a('play').click();
    await page.waitForFunction(() => document.documentElement.dataset.play === 'on');
    await a('panic').click();
    await page.waitForFunction(() => document.documentElement.dataset.play === 'off');
    await tab('arrangement');
    await a('auto-open').click();
    await f('auto-track').selectOption({ index: 0 });
    await f('auto-target').selectOption('pan');
    assert.equal(await f('auto-select').locator('option').count(), 3);
    await a('close').click();
    await a('save').click();
    await page.getByText(require('../locales/it.json').saved, { exact: true }).waitFor();
    await page.reload();
    await a('inspect-step').waitFor();
    await tab('arrangement');
    await a('auto-open').click();
    await f('auto-target').selectOption('pan');
    assert.equal(await f('auto-select').locator('option').count(), 3);
    if (process.env.FREQUENCY_TOUCH === '1' && which === 'chromium') {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
      });
      const phone = await ctx.newPage(),
        input = await ctx.newCDPSession(phone);
      phone.on('pageerror', (e) => errors.push(e.message));
      await phone.goto(new URL('/frequency/?lang=ar', src).href);
      await phone.locator('[data-tab=piano]').tap();
      assert.equal(await phone.locator('html').getAttribute('dir'), 'rtl');
      await phone.locator('[data-field=channel]').selectOption('0');
      await phone.locator('[data-field=octave]').selectOption('3');
      const mobileCell = (p, n) =>
        phone.locator('[data-action=piano-cell][data-pos="' + p + '"][data-note="' + n + '"]');
      await mobileCell(1, 37).tap();
      await mobileCell(1, 37).scrollIntoViewIfNeeded();
      const start = await mobileCell(1, 37).boundingBox(),
        end = await mobileCell(2, 40).boundingBox();
      const source = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
      const target = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
      await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [source] });
      for (let n = 1; n <= 8; n++)
        await input.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              x: source.x + ((target.x - source.x) * n) / 8,
              y: source.y + ((target.y - source.y) * n) / 8,
            },
          ],
        });
      await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await mobileCell(2, 40).getAttribute('data-origin'), '2');
      assert.ok(
        await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        'responsive workspace width',
      );
      if (evidence) await phone.screenshot({ path: path.join(evidence, which + '-touch-ar.png') });
      console.log(
        '390×844 Chromium touch emulation · Arabic RTL · touch drag note and viewport overflow verified',
      );
      await ctx.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      which,
      browser.version(),
      'direct edit, chord voices, gate, velocity, duplicate/undo, cue, clip drag, automation, live fader strip and reload verified',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
