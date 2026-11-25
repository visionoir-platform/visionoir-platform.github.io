// Intercept every simulated delivery in the browser. No messages leave the fixture.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.FREQUENCY_URL || 'http://127.0.0.1:4187/';
const target = 'https://inquiries.example.test/request';
async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.FREQUENCY_BROWSER_EXEC || undefined,
  });
  try {
    for (const deliveryMode of ['manual', 'direct', 'research']) {
      const direct = deliveryMode !== 'manual',
        researchEnabled = deliveryMode === 'research';
      const page = await browser.newPage({ locale: 'it-IT' }),
        errors = [],
        packets = [],
        businessRequests = [];
      page.on('request', (r) => {
        if (r.url().includes('example-business.invalid')) businessRequests.push(r.url());
      });
      // Use the actual prerendered page while injecting a synthetic allowlisted delivery destination.
      await page.route('**/it/', async (route) => {
        const response = await route.fetch();
        let html = await response.text();
        html = html.replace(
          /(<script[^>]+id="site-config"[^>]*>)([\s\S]*?)(<\/script>)/,
          (m, open, raw, close) => {
            const cfg = JSON.parse(raw);
            cfg.contactEndpoint = direct ? target : '';
            return open + JSON.stringify(cfg).replaceAll('<', '\\u003c') + close;
          },
        );
        if (direct) html = html.replace(/connect-src 'self'/, 'connect-src ' + target + " 'self'");
        await route.fulfill({ response, body: html });
      });
      let attempts = 0;
      await page.route(target, async (route) => {
        const req = route.request();
        assert.equal(req.method(), 'POST');
        assert.ok(!new URL(req.url()).search);
        assert.ok(req.headers()['content-type'].startsWith('text/plain'));
        const data = JSON.parse(req.postData());
        packets.push(data);
        const response =
          ++attempts === 1
            ? { ok: true, status: 'accepted', requestId: 'different' }
            : { ok: true, status: 'accepted', requestId: data.requestId };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify(response),
        });
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(new URL('it/', origin).href);
      const form = page.locator('#brief-form'),
        send = page.locator('#send-brief');
      await form.locator('button[type=submit]').click();
      assert.equal(await form.locator('[name=name]').getAttribute('aria-invalid'), 'true');
      await page.locator('[data-service=retainer]').click();
      assert.match(await page.locator('#brief-price').innerText(), /600.*al mese/);
      await page.locator('[data-service=packX]').click();
      assert.match(await page.locator('#brief-price').innerText(), /Su progetto/);
      await form.locator('[name=name]').fill('Persona Test');
      await form.locator('[name=email]').fill('qa@example.invalid');
      await form.locator('[name=message]').fill('Richiesta di collaudo interamente simulata.');
      const research = form.locator('[name=researchAllowed]'),
        company = form.locator('[name=companyUrl]');
      assert.equal(await research.isChecked(), false);
      if (researchEnabled) {
        await research.check();
        await form.locator('button[type=submit]').click();
        assert.equal(await form.locator('[name=organization]').getAttribute('aria-invalid'), 'true');
        await form.locator('[name=organization]').fill('Studio Esempio');
        await company.fill('http://example-business.invalid');
        await form.locator('button[type=submit]').click();
        assert.equal(await company.getAttribute('aria-invalid'), 'true');
        await company.fill('https://example-business.invalid');
      }
      await form.locator('button[type=submit]').click();
      assert.match(await page.locator('#brief-text').innerText(), /Pack X/i);
      assert.match(
        await page.locator('#request-privacy').getAttribute('href'),
        /\/legal\/it\/#requests$/,
      );
      if (direct) {
        await send.click();
        await page.waitForFunction(() =>
          document.querySelector('#brief-status').textContent.includes('non è stata confermata'),
        );
        assert.equal(await send.innerText(), 'Riprova l’invio');
        await send.click();
        await page.waitForFunction(
          () => document.querySelector('#brief-status').textContent === 'Richiesta ricevuta.',
        );
        assert.equal(packets.length, 2);
        assert.deepEqual(packets[0], packets[1]);
        assert.match(packets[0].requestId, /^[\da-f-]{36}$/);
        assert.equal(packets[0].privacyVersion, '2026-11-25');
        assert.equal(packets[0].researchAllowed, researchEnabled);
        assert.equal(packets[0].companyUrl, researchEnabled ? 'https://example-business.invalid' : '');
        assert.deepEqual(
          Object.keys(packets[0]).sort(),
          [
            'name',
            'email',
            'message',
            'service',
            'locale',
            'requestId',
            'privacyVersion',
            'companyUrl',
            'organization',
            'researchAllowed',
          ].sort(),
        );
        assert.equal(await send.isVisible(), false);
      } else {
        assert.equal(await send.isVisible(), false);
        assert.equal(
          await page.locator('#mail-brief').getAttribute('href'),
          'mailto:visionoir.platform@gmail.com',
        );
        assert.equal(packets.length, 0);
      }
      assert.ok(
        await page.evaluate(
          () =>
            !JSON.stringify(localStorage).includes('qa@example.invalid') &&
            !JSON.stringify(sessionStorage).includes('qa@example.invalid') &&
            !location.href.includes('qa%40'),
        ),
      );
      assert.deepEqual(errors, []);
      assert.deepEqual(businessRequests, []);
      await page.close();
    }
    console.log(
      'Inquiry: manual fallback, pricing, monthly renewal, Pack X, privacy anchor, validation, negative receipt, idempotent retry and verified acceptance passed. Synthetic delivery only.',
    );
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
