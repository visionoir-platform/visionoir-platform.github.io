// Use two real production builds on a temporary loopback origin. No personal browser data is used.
const assert = require('node:assert/strict');
const { readFile, writeFile, mkdtemp, rm, mkdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

async function readBuild(root) {
  const sw = await readFile(path.join(root, 'frequency/sw.js'), 'utf8');
  const id = sw.match(/CACHE='([^']+)'/)[1];
  const names = JSON.parse(sw.match(/ASSETS=(\[[^\n]+?\]);/)[1]);
  const files = new Map(await Promise.all(names.map(async name => [name, await readFile(path.join(root, name))])));
  files.set('/frequency/sw.js', sw);
  return { id, files };
}
// CI can exercise the next release using the exact production code and a
// second generated manifest. An explicit second build is still supported.
async function upgradedFixture(prior) {
  const root = await mkdtemp(path.join(tmpdir(),'frequency-next-'));
  try {
    for (const [name,data] of prior.files) {
      if (name === '/frequency/sw.js') continue;
      const file = path.join(root,name);
      await mkdir(path.dirname(file),{recursive:true});
      await writeFile(file,name === '/frequency/index.html' ? data.toString()+'<!-- QA release B -->' : data);
    }
    execFileSync(process.execPath,[path.resolve(__dirname,'../offline-build.mjs'),root]);
    return await readBuild(root);
  } finally { await rm(root,{recursive:true,force:true}); }
}
const types = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json'};

async function waitForState(check, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Timed out waiting for ' + label);
}

async function version(page, which) {
  return page.evaluate(async which => {
    const reg = await navigator.serviceWorker.getRegistration('/frequency/');
    const worker = which === 'controller' ? navigator.serviceWorker.controller : reg?.[which];
    if (!worker) return null;
    const channel = new MessageChannel();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {channel.port1.close(); reject(Error('Worker timed out'));}, 3000);
      channel.port1.onmessage = e => {clearTimeout(timeout); channel.port1.close(); resolve(e.data);};
      worker.postMessage('ready', [channel.port2]);
    });
  }, which);
}

(async () => {
  const prior = await readBuild(process.argv[2] || 'dist');
  const next = process.argv[3] ? await readBuild(process.argv[3]) : await upgradedFixture(prior);
  assert(prior && next && prior.id !== next.id, 'Supply two distinct production build directories');
  let build = prior;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/qa-holder') {res.writeHead(200, {'Content-Type':'text/html'});res.end('<title>QA</title>');return;}
    const name = pathname === '/frequency/' ? '/frequency/index.html' : pathname;
    const file = build.files.get(name);
    if (!file) {res.writeHead(404);res.end();return;}
    res.writeHead(200, {'Content-Type': types[path.extname(name)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(file);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({executablePath: process.env.FREQUENCY_BROWSER_EXEC});
    const context = await browser.newContext();
    const errors = [];
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    const holder = await context.newPage();
    await holder.goto(origin + '/qa-holder');
    const page = await context.newPage();
    await page.addInitScript(() => {
      const proto = AudioContext.prototype, create = proto.createAnalyser;
      proto.createAnalyser = function() {return window.qaAnalyser = create.call(this);};
    });
    await page.goto(origin + '/frequency/?lang=it');
    const action = id => page.locator('[data-action="'+id+'"]').first().click();
    await action('settings');
    await action('offline');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await action('close');
    assert.equal(await version(page, 'controller'), prior.id);
    await action('play');
    const signal = () => {
      const a = window.qaAnalyser;
      if (document.documentElement.dataset.play !== 'on' || a?.context.state !== 'running') return false;
      const samples = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(samples);
      return samples.some(x => Math.abs(x) > 0.001);
    };
    await page.waitForFunction(signal);
    const clock = await page.evaluate(() => window.qaAnalyser.context.currentTime);
    build = next;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await waitForState(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting?.state === 'installed'), 'the new worker to wait');
    assert.equal(await version(page, 'waiting'), next.id);
    assert.equal(await version(page, 'controller'), prior.id);
    await page.waitForFunction(t => window.qaAnalyser.context.currentTime > t+0.4, clock);
    await page.waitForFunction(signal);
    await page.close();
    await waitForState(() => holder.evaluate(async expected => {
      const keys = await caches.keys();
      return keys.includes(expected.next) && !keys.includes(expected.prior);
    }, {next:next.id, prior:prior.id}), 'cache activation after closing the studio');
    assert.equal(await version(holder, 'active'), next.id);
    await context.setOffline(true);
    const reopened = await context.newPage();
    await reopened.goto(origin + '/frequency/?lang=it');
    await reopened.locator('[data-action=play]').first().click();
    await reopened.waitForFunction(() => document.documentElement.dataset.play === 'on');
    assert.equal(await version(reopened, 'controller'), next.id);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(),prior:prior.id,next:next.id,
      newBuildWaited:true,oldMasterPCMContinued:true,reopenedOfflineOnNewBuild:true,errors}));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error => {console.error(error);process.exitCode=1;});
