const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

function sourceWav() {
  const rate = 16000,
    out = Buffer.alloc(44 + 2 * rate);
  out.write('RIFF');
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(rate * 2, 40);
  for (let i = 0; i < rate; i++)
    out.writeInt16LE(Math.round(9000 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + 2 * i);
  return out;
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_BIN });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const action = (name) => page.locator('[data-action="' + name + '"]');
    const field = (name) => page.locator('[data-field="' + name + '"]');
    await page.goto(
      new URL('/frequency/?lang=it', process.env.FREQUENCY_URL || 'http://127.0.0.1:4194/').href,
    );
    await page.locator('[data-tab="arrangement"]').click();
    await action('region-add').click();
    await page
      .locator('[data-region-file]')
      .setInputFiles({ name: 'Sessione.wav', mimeType: 'audio/wav', buffer: sourceWav() });
    await field('region-in').waitFor();
    await field('region-in').fill('0.125');
    await field('region-out').fill('0.75');
    await field('region-position').fill('3');
    await action('region-save').click();
    assert.match(await action('region-edit').textContent(), /3.*Sessione.wav/);
    await action('region-edit').click();
    await field('region-part').selectOption('1');
    await field('region-position').fill('2');
    await action('region-save').click();
    await action('region-edit').click();
    assert.equal(await field('region-in').inputValue(), '0.125');
    assert.equal(await field('region-out').inputValue(), '0.75');
    assert.equal(await field('region-part').inputValue(), '1');
    await page.locator('dialog [data-action="close"]').click();
    await action('play-song').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#clock')?.textContent &&
        !document.querySelector('#clock').textContent.startsWith('001.01.01'),
    );
    await action('stop').first().click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.locator('[data-tab="arrangement"]').click();
    await action('region-edit').click();
    assert.equal(await field('region-position').inputValue(), '2');
    await action('region-delete').click();
    assert.equal(await action('region-edit').count(), 0);
    await action('undo').first().click();
    assert.equal(await action('region-edit').count(), 1);
    await action('redo').first().click();
    assert.equal(await action('region-edit').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      'Chromium 390 px: file picker, mono WAV decode, placement, trim, move between parts, playback, reload and removal passed.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
