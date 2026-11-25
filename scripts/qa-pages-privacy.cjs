/* Run against a static production build on loopback. No contact submissions. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = new URL(process.env.PAGES_QA_URL || 'http://127.0.0.1:4289').origin;
const { pathToFileURL } = require('node:url');
const path = require('node:path');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname))
  throw Error('Use a local static build.');
function sampleWave() {
  const n = 2400,
    b = Buffer.alloc(44 + n * 2),
    rate = 48000;
  b.write('RIFF');
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(2 * rate, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * i) / 120) * 1800), 44 + i * 2);
  return b;
}
async function run() {
  const { createProject } = await import(
    pathToFileURL(path.resolve(__dirname, '../frequency/audio/model.js'))
  );
  const project = createProject('blank');
  project.name = 'Sessione locale & studio';
  // Preserve the sampler's normal parameter schema when moving it into view.
  [project.tracks[0], project.tracks[15]] = [project.tracks[15], project.tracks[0]];
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_BIN,
    args: ['--enable-unsafe-swiftshader'],
  });
  try {
    const ctx = await browser.newContext({ locale: 'it', viewport: { width: 980, height: 750 } });
    const foreign = new Set(),
      seen = new Set(),
      issues = [],
      posted = [];
    await ctx.addInitScript(() => {
      window.workletInstances = [];
      if (typeof AudioWorkletNode === 'function')
        window.AudioWorkletNode = new Proxy(AudioWorkletNode, {
          construct(target, args, newTarget) {
            const node = Reflect.construct(target, args, newTarget);
            window.workletInstances.push(args[1]);
            return node;
          },
        });
    });
    ctx.on('request', (r) => {
      const u = new URL(r.url());
      if (!['http:', 'https:'].includes(u.protocol)) return;
      if (u.origin !== origin) foreign.add(u.origin);
      else seen.add(u.pathname);
      if (r.method() !== 'GET' && r.method() !== 'HEAD') posted.push(u.pathname);
    });
    ctx.on('page', (tab) =>
      tab.on('console', (msg) => {
        if (msg.text().includes('Content Security Policy') && msg.type() === 'error') issues.push(msg.text());
      }),
    );
    const page = await ctx.newPage(),
      workers = [];
    page.on('worker', (w) => workers.push(w.url()));
    const goto = (p) => page.goto(origin + p);
    const act = (k) =>
      page
        .locator('[data-action="' + k + '"]')
        .first()
        .click();
    await goto('/frequency/?lang=it');
    await page.waitForSelector('.chromatic-surface[data-render=webgl]');
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.ok(policy.includes("script-src 'self'") && !policy.includes("'unsafe-eval'"));
    await page
      .locator('#project-file')
      .setInputFiles({
        name: 'sample.vfreq',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(project)),
      });
    await page.waitForSelector('#sample-file', { state: 'attached' });
    await page
      .locator('#sample-file')
      .setInputFiles({ name: 'fixture.wav', mimeType: 'audio/wav', buffer: sampleWave() });
    await page.waitForFunction(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('visionoir-frequency-v1');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const data = await new Promise((r) => {
        const req = db.transaction('projects').objectStore('projects').get('active');
        req.onsuccess = () => r(req.result);
      });
      db.close();
      return data?.name === 'Sessione locale & studio' && data.tracks[0]?.sample?.name === 'fixture.wav';
    });
    await act('play');
    await page.waitForFunction(() => document.documentElement.dataset.play === 'on');
    await act('stop');
    assert.ok(
      await page.evaluate(() => window.workletInstances.includes('frequency-rack-v1')),
      'AudioWorklet node initialized',
    );
    const opened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Finestra proiettore' }).click();
    const popup = await opened;
    await popup.waitForSelector('.chromatic-surface[data-render=webgl]');
    await popup.close();
    await act('export');
    await page.locator('[data-field=format]').selectOption('mp3');
    await page.locator('[data-field=render-bars]').fill('1');
    await page.locator('[data-field=render-tail]').fill('0');
    const wait = page.waitForEvent('download', { timeout: 70000 });
    await act('render');
    const download = await wait;
    const location = await download.path();
    assert.ok(download.suggestedFilename().endsWith('.mp3') && fs.statSync(location).size > 1000);
    assert.ok(
      workers.some((url) => new URL(url).pathname.includes('export-worker-')),
      'MP3 worker started',
    );
    await goto('/it/');
    await page.locator('#creator-stage').scrollIntoViewIfNeeded();
    await page.waitForSelector('#creator-stage[data-render=webgl]');
    await page.locator('a#unseen-door').click();
    const game = (k) =>
      page
        .locator('[data-act="' + k + '"]')
        .first()
        .click();
    await game('start');
    await game('extras');
    await game('lab');
    await game('play');
    await page.waitForFunction(() => {
      const e = document.querySelector('#elapsed');
      return e && e.textContent.trim() !== '0:00' && e.textContent.trim() !== '00:00';
    });
    assert.ok([...seen].some((p) => p.startsWith('/unseen/audio/') && p.endsWith('.m4a')));
    for (const p of ['/support/it/', '/legal/it/']) {
      await goto(p);
      await page.waitForSelector('h1');
      assert.ok(await page.locator('meta[http-equiv="Content-Security-Policy"]').count());
    }
    assert.deepEqual([...foreign], []);
    assert.deepEqual(posted, []);
    assert.deepEqual(issues, []);
    const summary = {
      browser: browser.version(),
      requests: seen.size,
      externalOrigins: [...foreign],
      nonReadRequests: posted,
      cspViolations: issues,
      projectImport: true,
      sampleImportAndLocalPersistence: true,
      worklet: true,
      mp3WorkerBytes: fs.statSync(location).size,
      projector: true,
      creatorEmbeddedTextures: true,
      gameAudioProgress: true,
    };
    if (process.env.PAGES_QA_PROOF)
      fs.writeFileSync(process.env.PAGES_QA_PROOF, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
