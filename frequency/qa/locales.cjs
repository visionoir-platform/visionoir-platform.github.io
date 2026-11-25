const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dictDir = path.resolve(__dirname, '../locales');
const langs = fs.readdirSync(dictDir).map((v) => v.replace(/\.json$/, ''));
const bases = { 'fr-CH': 'fr', 'de-CH': 'de', 'it-CH': 'it' };
const read = (id) => JSON.parse(fs.readFileSync(path.join(dictDir, id + '.json'), 'utf8'));
const dict = (id) => Object.assign({}, bases[id] ? read(bases[id]) : {}, read(id));
async function main() {
  assert.equal(langs.length, 19);
  const keys = Object.keys(dict('it')).sort();
  const b = await chromium.launch({
    headless: true,
    executablePath: process.env.FREQUENCY_BROWSER_EXEC || undefined,
  });
  const p = await b.newPage({ viewport: { width: 1024, height: 768 } }),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const tab = (id) => p.locator(`[data-tab="${id}"]`),
    btn = (id) => p.locator(`[data-action="${id}"]`).first();
  try {
    await p.goto(
      new URL('frequency/?lang=it', process.env.FREQUENCY_URL || 'http://127.0.0.1:4187/').href,
    );
    for (const id of langs) {
      const d = dict(id);
      assert.deepEqual(Object.keys(d).sort(), keys, id);
      assert.ok(Object.values(d).every((v) => typeof v === 'string' && v.trim()));
      await btn('settings').click();
      await p.locator('[data-field="lang"]').selectOption(id);
      await p.waitForFunction((l) => document.documentElement.lang === l, id);
      assert.equal(await p.locator('dialog h2').innerText(), d.settings, id);
      assert.equal(await p.locator('html').getAttribute('dir'), id === 'ar' ? 'rtl' : 'ltr');
      await btn('close').click();
      for (const [id, key] of Object.entries({
        sequencer: 'sequencer',
        piano: 'piano',
        arrangement: 'arrangement',
        mixer: 'mixer',
        live: 'performance',
      })) {
        await tab(id).click();
        assert.equal(await p.locator('#editor h2').innerText(), d[key]);
      }
      await btn('about').click();
      assert.equal(await p.locator('dialog li').nth(1).innerText(), d.guide2);
      await btn('close').click();
      if (['it', 'de', 'ar', 'ja', 'pt-BR', 'pt-PT'].includes(id) && process.env.FREQUENCY_PROOF) {
        await tab('sequencer').click();
        await p.screenshot({ path: path.join(process.env.FREQUENCY_PROOF, 'locale-' + id + '.png') });
      }
    }
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await p.setViewportSize({ width, height: width < 700 ? 830 : 900 });
      assert.ok(
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        String(width),
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        locales: langs.length,
        keys: keys.length,
        viewsPerLocale: 5,
        widths: [360, 390, 768, 1024, 1440, 1920],
        errors,
      }),
    );
  } finally {
    await b.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
