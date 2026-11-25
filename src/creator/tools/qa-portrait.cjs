/* Use a local Italian production build. The candidate JS and styles may be in an isolated Vite output. */
const fs = require('node:fs/promises'),
  path = require('node:path'),
  http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..'),
  dist = path.join(root, 'dist'),
  compiled = process.env.CREATOR_CANDIDATE;
const proof = process.env.CREATOR_PROOF,
  label = process.env.CREATOR_LABEL || 'candidate';
const mime = {
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
async function main() {
  const source = await fs.readFile(path.join(dist, 'it', 'index.html'), 'utf8');
  let html = source;
  if (compiled) {
    const fresh = await fs.readFile(path.join(compiled, 'index.html'), 'utf8');
    for (const re of [/\/assets\/site-[\w-]+\.js/, /\/assets\/site-[\w-]+\.css/]) {
      if (fresh.match(re)) html = html.replace(re, fresh.match(re)[0]);
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const name = decodeURIComponent(url.pathname);
      if (name === '/it/') {
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
        return;
      }
      const local = name.slice(1);
      if (local.includes('..')) throw Error();
      const locations = compiled ? [compiled, path.join(root, 'public'), dist] : [dist];
      let file;
      for (const dir of locations) {
        try {
          file = await fs.readFile(path.join(dir, local));
          break;
        } catch {}
      }
      if (!file) throw Error();
      res.setHeader('Content-Type', mime[path.extname(local)] || 'application/octet-stream');
      res.end(file);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((r, j) => server.once('error', j).listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_BIN,
    args: ['--enable-unsafe-swiftshader'],
  });
  const observations = [];
  try {
    for (const [kind, width, height, hasTouch] of [
      ['desktop', 1440, 920, false],
      ['touch', 390, 844, true],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch,
        reducedMotion: 'reduce',
        deviceScaleFactor: !hasTouch && compiled ? 1.5 : 1,
      });
      const page = await context.newPage(),
        errors = [],
        requests = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await context.route('**/*', (r) => {
        if (
          r
            .request()
            .url()
            .startsWith(base + '/') &&
          ['GET', 'HEAD'].includes(r.request().method())
        )
          return r.continue();
        return r.abort();
      });
      await page.addInitScript(() => localStorage.setItem('visionoir-silent', '1'));
      page.on('request', (r) => {
        if (r.url().includes('/creator/') && r.url().endsWith('.glb'))
          requests.push(new URL(r.url()).pathname);
      });
      await page.goto(base + '/it/');
      const stage = page.locator('#creator-stage');
      await stage.scrollIntoViewIfNeeded();
      await page.waitForFunction(
        () => document.querySelector('#creator-stage').dataset.render === 'webgl',
        {},
        { timeout: 30000 },
      );
      await page.waitForTimeout(420);
      await stage.screenshot({ path: path.join(proof, label + '-' + kind + '.png') });
      async function cleanCapture(name) {
        const css = await page.addStyleTag({
          content:
            '.creator-looks,.topbar,.player{visibility:hidden!important} #creator-stage{border:0!important}',
        });
        await stage.screenshot({ path: path.join(proof, label + '-poster-' + name + '.png') });
        await css.evaluate((el) => el.remove());
      }
      if (!hasTouch) await cleanCapture('metal');
      if (!hasTouch) {
        for (const look of ['natural', 'liquid']) {
          await page.locator('[data-look="' + look + '"]').click();
          await page.waitForTimeout(390);
          await stage.screenshot({ path: path.join(proof, label + '-' + look + '.png') });
          await cleanCapture(look);
        }
      }
      if (!hasTouch && process.env.CREATOR_ACID_POSTERS) {
        await page.locator('#track-select').selectOption('acid');
        await page.waitForFunction(() => document.body.dataset.mode === 'acid');
        await stage.scrollIntoViewIfNeeded();
        for (const look of ['metal', 'natural', 'liquid']) {
          await page.locator('[data-look="' + look + '"]').click();
          await page.waitForTimeout(230);
          await cleanCapture('acid' + (look === 'metal' ? '' : '-' + look));
        }
      }
      observations.push({
        kind,
        width,
        height,
        reducedMotion: true,
        requests,
        errors,
        box: await stage.boundingBox(),
        version: browser.version(),
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
    if (process.env.CREATOR_VERIFY) await verifyRuntime(browser, base, observations);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
  await fs.writeFile(path.join(proof, label + '.json'), JSON.stringify(observations, null, 2));
  console.log(JSON.stringify(observations));
}
async function verifyRuntime(browser, base, observations) {
  for (const fallback of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 1060, height: 900 },
      reducedMotion: 'no-preference',
    });
    try {
      await context.route('**/*', (r) =>
        r
          .request()
          .url()
          .startsWith(base + '/') && ['GET', 'HEAD'].includes(r.request().method())
          ? r.continue()
          : r.abort(),
      );
      const page = await context.newPage();
      await page.addInitScript((noGPU) => {
        localStorage.setItem('visionoir-silent', '1');
        if (noGPU) {
          const orig = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (name, ...args) {
            return name.includes('webgl') ? null : orig.call(this, name, ...args);
          };
          return;
        }
        const gl = WebGL2RenderingContext.prototype,
          names = new WeakMap();
        const probe = (window.portraitProbe = { audioCount: 0, bands: [0, 0, 0, 0], clock: 0, acid: 0 });
        const get = gl.getUniformLocation;
        gl.getUniformLocation = function (program, name) {
          const location = get.call(this, program, name);
          if (location) names.set(location, name);
          return location;
        };
        const one = gl.uniform1f,
          four = gl.uniform4f;
        gl.uniform1f = function (loc, v) {
          if (names.get(loc) === 'uTime') probe.clock = v;
          if (names.get(loc) === 'uAcid') probe.acid = v;
          return one.call(this, loc, v);
        };
        gl.uniform4f = function (loc, ...values) {
          if (names.get(loc) === 'uAudio') {
            probe.audioCount++;
            probe.bands = values.map((v, i) => Math.max(v, probe.bands[i]));
          }
          return four.call(this, loc, ...values);
        };
      }, fallback);
      await page.goto(base + '/it/');
      const stage = page.locator('#creator-stage');
      await stage.scrollIntoViewIfNeeded();
      if (fallback) {
        const shots = [];
        for (const mode of ['chrome', 'acid']) {
          await page.locator('#track-select').selectOption(mode);
          for (const look of ['metal', 'natural', 'liquid']) {
            await page.locator('[data-look="' + look + '"]').click();
            const name =
              'poster' + (mode === 'acid' ? '-acid' : '') + (look === 'metal' ? '' : '-' + look) + '.webp';
            await page.waitForFunction((n) => {
              const s = document.getElementById('creator-stage'),
                p = s.querySelector('img');
              return (
                s.dataset.render === 'fallback' &&
                p.currentSrc.endsWith(n) &&
                p.complete &&
                p.naturalWidth > 0 &&
                getComputedStyle(p).visibility === 'visible'
              );
            }, name);
            shots.push({
              mode,
              look,
              file: name,
              width: await stage.locator('img').evaluate((img) => img.naturalWidth),
            });
          }
        }
        observations.push({ test: 'WebGL unavailable', posters: shots });
        continue;
      }
      await page.waitForFunction(() => document.querySelector('#creator-stage').dataset.render === 'webgl');
      await page.locator('#track-select').selectOption('acid');
      await page.locator('#sound-toggle').click();
      await stage.scrollIntoViewIfNeeded();
      await page.waitForFunction(
        () => window.portraitProbe.acid === 1 && window.portraitProbe.bands.every((v) => v > 0.001),
        null,
        { timeout: 20000 },
      );
      await stage.screenshot({ path: path.join(proof, label + '-acid.png') });
      const peak = await page.evaluate(() => ({ ...window.portraitProbe }));
      await page.locator('#sound-toggle').click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await stage.scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      const clock = await page.evaluate(() => window.portraitProbe.clock);
      await page.waitForTimeout(320);
      assert.equal(await page.evaluate(() => window.portraitProbe.clock), clock);
      const loss = await stage.locator('canvas').evaluate((c) => {
        const ext = c.getContext('webgl2').getExtension('WEBGL_lose_context');
        if (!ext) return false;
        window.restorePortrait = () => ext.restoreContext();
        ext.loseContext();
        return true;
      });
      if (loss) {
        await page.waitForFunction(
          () => document.querySelector('#creator-stage').dataset.render === 'context-lost',
        );
        assert.equal(await stage.locator('img').evaluate((i) => getComputedStyle(i).visibility), 'visible');
        await page.waitForTimeout(180);
        await page.evaluate(() => window.restorePortrait());
        await page.waitForFunction(() => document.querySelector('#creator-stage').dataset.render === 'webgl');
      }
      observations.push({
        test: 'Acid audio, reduced motion, WebGL restore',
        ...peak,
        reducedClock: clock,
        lossRestored: loss,
      });
    } finally {
      await context.close();
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
