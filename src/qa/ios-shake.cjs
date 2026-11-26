const assert = require('node:assert/strict');
const { writeFile } = require('node:fs/promises');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

// Desktop WebKit runs the real page. Only permission results and accelerometer
// samples are emulated; this test cannot attest to a physical iPhone or OS sheet.
function installSensorHarness(permission) {
  let activeTap = '', motionAllowed = false;
  const requests = [], changes = [];
  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-motion-permission], #immersive, #device-tilt-enable');
    if (!event.isTrusted || !target) return;
    activeTap = target.id;
    setTimeout(() => { activeTap = ''; }, 0);
  }, true);
  window.addEventListener('visionoir:logo-negative', () => {
    changes.push(document.documentElement.classList.contains('logo-negative'));
  });
  for (const type of ['DeviceMotionEvent','DeviceOrientationEvent']) {
    if (!window[type]) Object.defineProperty(window,type,{configurable:true,value:class extends Event {}});
    Object.defineProperty(window[type],'requestPermission',{configurable:true,value:() => {
      const tap = activeTap;
      requests.push({api:type, trustedTap:tap});
      // A later task no longer has the original trusted click.
      return new Promise(resolve => setTimeout(() => {
        const result = tap ? permission : 'denied';
        if (type === 'DeviceMotionEvent') motionAllowed = result === 'granted';
        resolve(result);
      }, 45));
    }});
  }
  function emit(x, channel) {
    if (!motionAllowed) return false;
    const data = {acceleration:channel === 'linear' ? {x,y:0,z:0} : null,
      accelerationIncludingGravity:{x,y:0,z:9.81}, interval:80};
    let e;
    try { e = new DeviceMotionEvent('devicemotion', data); } catch {}
    if (!e?.accelerationIncludingGravity || e.accelerationIncludingGravity.x !== x ||
        (channel === 'linear' && e.acceleration?.x !== x)) {
      e = new Event('devicemotion');
      for (const [key,value] of Object.entries(data)) Object.defineProperty(e,key,{value});
    }
    window.dispatchEvent(e);
    return true;
  }
  window.motionProbe = {
    requests, changes, emit, granted:() => motionAllowed,
    async burst(channel, afterSensorPause) {
      // Some phones send no samples while held still between gestures.
      if (afterSensorPause) await new Promise(resolve => setTimeout(resolve,1200));
      const amplitude = channel === 'linear' ? 8.5 : 14;
      const rest = afterSensorPause ? [] : [0,0,0,0,0,0,0,0,0];
      for (const x of [...rest,amplitude,-amplitude,amplitude]) {
        emit(x,channel);
        await new Promise(resolve => setTimeout(resolve,80));
      }
    }
  };
}

async function check(browser, origin, {permission, control, channel}) {
  const context = await browser.newContext({isMobile:true, hasTouch:true, viewport:{width:393,height:852},
    deviceScaleFactor:2, locale:'it-IT', reducedMotion:'no-preference'});
  try {
    await context.addInitScript(installSensorHarness,permission);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/it/',origin).href, {waitUntil:'domcontentloaded'});
    await page.locator('html.enhanced').waitFor({state:'attached'});
    const marker = () => page.locator('html').evaluate(el => el.classList.contains('logo-negative'));
    const calls = () => page.evaluate(() => window.motionProbe.requests);
    assert.deepEqual(await calls(),[], 'Opening the site requested sensor permission');
    assert.equal(await page.evaluate(mode => window.motionProbe.emit(14,mode),channel), false);
    assert.equal(await marker(),false);
    await page.locator(control).tap();
    await page.waitForFunction(() => window.motionProbe.requests.some(c => c.api === 'DeviceMotionEvent'));
    if (permission === 'denied') {
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.motionProbe.granted()),false);
      assert.equal(await page.evaluate(mode => window.motionProbe.emit(14,mode),channel),false);
      await page.locator('#immersive').tap();
      assert.ok(await page.locator('#immersive-view').isVisible());
      await page.locator('#exit-immersive').tap();
      assert.equal(await page.locator('#immersive-view').isVisible(),false);
      assert.equal(await marker(),false);
      assert.deepEqual(await page.evaluate(() => window.motionProbe.changes),[]);
    } else {
      await page.waitForFunction(() => window.motionProbe.granted());
      const startingInImmersive = control === '#immersive';
      const views = startingInImmersive ? ['immersive','home'] : ['home','immersive'];
      for (let i=0;i<views.length;i++) {
        if (i) await page.locator(views[i] === 'immersive' ? '#immersive' : '#exit-immersive').tap();
        assert.equal(await page.locator('#immersive-view').isVisible(), views[i] === 'immersive');
        for (const negative of [true,false]) {
          const afterSensorPause = channel === 'linear' && !negative;
          await page.evaluate(({channel,afterSensorPause}) =>
            window.motionProbe.burst(channel,afterSensorPause), {channel,afterSensorPause});
          assert.equal(await marker(),negative,views[i] + ': the gesture did not change material as expected');
        }
      }
      assert.deepEqual(await page.evaluate(() => window.motionProbe.changes),[true,false,true,false]);
    }
    const requests=await calls();
    assert.ok(requests.every(c => c.trustedTap), 'Permission requested outside the triggering real tap');
    const motionCalls=requests.filter(c => c.api === 'DeviceMotionEvent');
    assert.equal(motionCalls[0].trustedTap, control === '#immersive' ? 'immersive' : 'logo-scene');
    assert.equal(motionCalls.length,1,'Reopening the visual requested permission again');
    assert.deepEqual(errors,[]);
    return {permission,control,channel,requests,changes:await page.evaluate(() => window.motionProbe.changes),errors};
  } finally { await context.close(); }
}

(async () => {
  const origin = new URL(process.argv[2] || 'http://127.0.0.1:4270').origin;
  const engine = process.env.MOTION_BROWSER_ENGINE || 'webkit';
  assert.ok(['webkit','chromium'].includes(engine),'Expected WebKit or Chromium');
  const browser = await playwright[engine].launch({executablePath:process.env.MOTION_BROWSER_BIN});
  try {
    const cases=[];
    for (const config of [
      {permission:'granted',control:'#logo-scene[data-motion-permission]',channel:'linear'},
      {permission:'granted',control:'#immersive',channel:'gravity'},
      {permission:'denied',control:'#logo-scene[data-motion-permission]',channel:'linear'},
    ]) cases.push(await check(browser, origin, config));
    const report = {origin, engine, browserVersion:browser.version(), host:process.platform, viewport:'393 × 852 CSS px',
      physicalDevice:false, permission:'emulated iOS API, trusted touch event', accelerometer:'synthetic', cases};
    const output=JSON.stringify(report,null,2)+'\n';
    if (process.env.MOTION_PROOF) await writeFile(process.env.MOTION_PROOF,output);
    console.log(output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
