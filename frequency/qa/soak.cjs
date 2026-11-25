// Exercise the shipped browser transport and sample its native Web Audio analyser on the Mac.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { performance } = require('node:perf_hooks');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const build = path.resolve(process.env.FREQUENCY_BUILD || 'dist');
const report = path.resolve(process.env.FREQUENCY_SOAK_REPORT || 'frequency-soak.jsonl');
const duration = Number(process.env.FREQUENCY_SOAK_MINUTES ?? 240) * 60000;
if (!Number.isFinite(duration) || duration < 10000) throw Error('FREQUENCY_SOAK_MINUTES');
const sw = fs.readFileSync(path.join(build, 'frequency/sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/ASSETS=(\[[^\n]+?\]);/)[1]);
const files = new Map(assets.map((name) => [name, fs.readFileSync(path.join(build, name))]));
const buildId = sw.match(/CACHE='([^']+)'/)[1];
const log = (type, more = {}) => {
  const line = JSON.stringify({ at: new Date().toISOString(), type, ...more });
  fs.appendFileSync(report, line + '\n');
  console.log(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, '', { flag: 'wx' });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const key = url.pathname === '/frequency/' ? '/frequency/index.html' : url.pathname;
    const file = files.get(key);
    if (!file) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
        '.webmanifest': 'application/manifest+json',
      }[path.extname(key)] || 'application/octet-stream',
    );
    res.end(file);
  });
  await new Promise((r, j) => server.once('error', j).listen(0, '127.0.0.1', r));
  let b, fatal;
  try {
    b = await chromium.launch({
      headless: true,
      executablePath: process.env.FREQUENCY_BROWSER_EXEC || undefined,
      args: ['--mute-audio'],
    });
    const p = await b.newPage({ viewport: { width: 900, height: 680 }, reducedMotion: 'reduce' });
    p.on('pageerror', (e) => {
      log('page-error', { message: e.message });
      fatal = e.message;
    });
    p.on('crash', () => {
      fatal = 'Browser page crashed';
      log('crash');
    });
    await p.addInitScript(() => {
      const orig = AudioContext.prototype.createAnalyser;
      AudioContext.prototype.createAnalyser = function (...args) {
        const an = orig.apply(this, args);
        window.frequencySoakAnalyser = an;
        return an;
      };
    });
    await p.goto('http://127.0.0.1:' + server.address().port + '/frequency/?lang=it');
    await p.locator('[data-action=settings]').click();
    await p.locator('[data-field="master:volume"]').first().fill('0.25');
    await p.locator('[data-action=close]').first().click();
    await p.locator('[data-tab=live]').click();
    await p.locator('[data-action=launch][data-index="3"]').click();
    await p.waitForFunction(
      () => document.documentElement.dataset.play === 'on' && window.frequencySoakAnalyser,
    );
    // Scope drawing pauses outside the viewport. Start the trial only when the master produces PCM.
    await p.waitForFunction(() => {
      const analyser = window.frequencySoakAnalyser;
      if (!analyser || analyser.context.state !== 'running') return false;
      const probe = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(probe);
      return probe.some(value => Math.abs(value) > 0.0001);
    }, undefined, {polling: 150});
    const diagnostics = await p.evaluate(() => {
      const a = window.frequencySoakAnalyser,
        c = a.context,
        samples = new Float32Array(a.fftSize),
        firstCtx = c.currentTime,
        start = performance.now();
      const history = {
        polls: 0,
        active: 0,
        maxRenderLagMs: 0,
        longestObservedSilenceMs: 0,
        timeWithoutSignal: 0,
        lastPoll: start,
        nonRunning: 0,
        clipFrames: 0,
        uiChanges: 0,
        clock: '',
        peak: 0,
      };
      c.addEventListener('statechange', () => {
        if (c.state !== 'running') history.nonRunning++;
      });
      function sample() {
        const now = performance.now(),
          gap = now - history.lastPoll;
        history.lastPoll = now;
        history.maxRenderLagMs = Math.max(history.maxRenderLagMs, gap);
        a.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const x of samples) {
          energy += x * x;
          history.peak = Math.max(history.peak, Math.abs(x));
          if (Math.abs(x) >= 1) history.clipFrames++;
        }
        history.polls++;
        if (Math.sqrt(energy / samples.length) > 0.0001) {
          history.active++;
          history.timeWithoutSignal = 0;
        } else {
          history.timeWithoutSignal += gap;
          history.longestObservedSilenceMs = Math.max(
            history.longestObservedSilenceMs,
            history.timeWithoutSignal,
          );
        }
        const clock = document.querySelector('#clock').textContent;
        if (clock !== history.clock) history.uiChanges++;
        history.clock = clock;
      }
      setInterval(sample, 300);
      window.frequencySoakRead = () => ({
        ...history,
        audioElapsed: c.currentTime - firstCtx,
        pageElapsed: (performance.now() - start) / 1000,
        audioState: c.state,
      });
      return {
        sampleRate: c.sampleRate,
        baseLatency: c.baseLatency,
        outputLatency: c.outputLatency,
        rate: document.querySelector('[data-field=bpm]').value,
      };
    });
    const started = performance.now();
    let nextLog = started + 120000,
      nextScene = started + 1800000,
      progress;
    log('start', {
      pid: process.pid,
      browser: b.version(),
      platform: process.platform,
      buildId,
      requestedMinutes: duration / 60000,
      diagnostics,
      scope: 'Local browser DSP; audible speaker output and hardware dropouts unmeasured',
    });
    while (performance.now() - started < duration) {
      await sleep(Math.min(15000, Math.max(10, duration - (performance.now() - started))));
      if (fatal) throw Error(fatal);
      if (!b.isConnected()) throw Error('Browser disconnected');
      const now = performance.now();
      if (now >= nextLog || now - started >= duration) {
        progress = await p.evaluate(() => window.frequencySoakRead());
        log('sample', { wallSeconds: (now - started) / 1000, ...progress });
        nextLog = now + 120000;
      }
      if (now >= nextScene) {
        const scene = [6, 1, 3, 5][(Math.round((now - started) / 1800000) - 1) % 4];
        await p.locator(`[data-action=launch][data-index="${scene}"]`).click();
        log('scene-queued', { scene });
        nextScene += 1800000;
      }
    }
    const measured = await p.evaluate(() => window.frequencySoakRead());
    const pass =
      measured.audioElapsed >= (duration / 1000) * 0.99 &&
      measured.audioState === 'running' &&
      !measured.nonRunning &&
      measured.active >= measured.polls * 0.95 &&
      measured.longestObservedSilenceMs < 3000 &&
      measured.maxRenderLagMs < 5000 &&
      measured.clipFrames === 0;
    await p.locator('[data-action=panic]').click();
    log('end', { passed: pass, wallSeconds: (performance.now() - started) / 1000, ...measured });
    if (!pass) process.exitCode = 1;
  } finally {
    await b?.close();
    server.close();
  }
}
run().catch((e) => {
  log('failure', { message: String(e) });
  process.exitCode = 1;
});
