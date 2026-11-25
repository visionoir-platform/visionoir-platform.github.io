const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function check(browser, origin, lang) {
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = action => page.locator('[data-action="' + action + '"]').first();
    await page.goto(new URL('frequency/?lang=' + lang, origin).href);
    await button('step').waitFor();
    const channel = 1, pos = 2;
    const full = page.locator('[data-action="step"][data-channel="1"][data-pos="2"]');
    const neighbor = page.locator('[data-action="step"][data-channel="0"][data-pos="2"]');
    const original = await full.getAttribute('aria-pressed');
    const unchanged = await neighbor.getAttribute('aria-pressed');
    await page.locator('[data-action="channel"][data-index="1"]').click();
    await button('about').click();
    assert.equal(await page.locator('html').getAttribute('dir'), lang === 'ar' ? 'rtl' : 'ltr');
    const steps = page.locator('dialog [data-action="guide-step"]');
    assert.equal(await steps.count(), 16);
    assert.equal(await steps.nth(pos).getAttribute('aria-pressed'), original);
    assert(await steps.nth(pos).evaluate(b => b.offsetHeight >= 44 && b.getBoundingClientRect().width >= 40));
    await steps.nth(pos).click();
    assert.notEqual(await steps.nth(pos).getAttribute('aria-pressed'), original);
    assert.equal(await steps.nth(pos).evaluate(b => b === document.activeElement), true);
    await button('guide-play').click();
    await page.waitForFunction(() => document.documentElement.dataset.play === 'on' &&
      document.querySelector('#db').textContent !== '−∞ dBFS' &&
      document.querySelector('#clock').textContent !== '001.01.01');
    const peak = await page.locator('#db').innerText();
    await button('guide-play').click();
    await page.waitForFunction(() => document.documentElement.dataset.play === 'off');
    await button('guide-save').click();
    await page.waitForFunction(() => document.querySelector('.guide-status')?.textContent);
    await button('guide-full').click();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.channel), String(channel));
    assert.notEqual(await full.getAttribute('aria-pressed'), original);
    assert.equal(await neighbor.getAttribute('aria-pressed'), unchanged);
    await button('undo').click();
    assert.equal(await full.getAttribute('aria-pressed'), original);
    await button('redo').click();
    assert.notEqual(await full.getAttribute('aria-pressed'), original);
    await page.reload();
    await full.waitFor();
    assert.notEqual(await full.getAttribute('aria-pressed'), original);
    await button('library').click();
    await button('saved').waitFor();
    assert.equal(await page.locator('[data-action="saved"]').count(), 1);
    await button('saved').click();
    await full.waitFor();
    assert.notEqual(await full.getAttribute('aria-pressed'), original);
    assert.deepEqual(errors, []);
    return { lang, channel, position: pos + 1, peak, namedCopies: 1, errors };
  } finally { await context.close(); }
}

(async () => {
  const origin = process.env.FREQUENCY_URL || 'http://127.0.0.1:4173/';
  const browser = await chromium.launch({ executablePath: process.env.FREQUENCY_BROWSER_EXEC || undefined });
  try {
    const checks = [];
    for (const lang of ['it','ar']) checks.push(await check(browser, origin, lang));
    const report = JSON.stringify({ origin, browser: browser.version(), checks }, null, 2);
    if (process.env.FREQUENCY_PROOF) fs.writeFileSync(process.env.FREQUENCY_PROOF, report + '\n');
    console.log(report);
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
