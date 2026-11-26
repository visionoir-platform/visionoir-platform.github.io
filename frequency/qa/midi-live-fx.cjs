const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.FREQUENCY_BROWSER_EXEC});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const port = {id:'surface',name:'QA controller',state:'connected'};
      const probe = window.midiProbe = {requests:[], controls:[], projects:0};
      Object.defineProperty(navigator,'requestMIDIAccess',{value:async options => {
        probe.requests.push(options);
        return {inputs:new Map([[port.id,port]])};
      }});
      probe.cc = (channel,number,value) => port.onmidimessage({
        data:new Uint8Array([0xb0 | channel,number,value]),timeStamp:performance.now(),
      });
      const send = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function(message,...rest) {
        if (message?.type === 'control') probe.controls.push([message.id,message.value]);
        if (message?.type === 'project') probe.projects++;
        return send.call(this,message,...rest);
      };
    });
    const action = id => page.locator('[data-action="' + id + '"]').first();
    const range = id => page.locator('[data-field="livefx:' + id + '"]');
    const cc = (channel,number,value) => page.evaluate(args => midiProbe.cc(...args),[channel,number,value]);
    const ids = ['dj','repeat','glitch','freeze'];
    async function connect() {
      await action('settings').click();
      await action('midi').click();
      await page.waitForFunction(() => !document.querySelector('[data-action="learn"]').disabled);
      assert.deepEqual(await page.evaluate(() => midiProbe.requests),[{sysex:false}]);
    }
    await page.goto(new URL('/frequency/?lang=en',process.argv[2]).href);
    await page.locator('[data-tab="live"]').click();
    await action('play').click();
    await page.waitForFunction(() => document.documentElement.dataset.play === 'on');
    assert.deepEqual(await page.evaluate(() => midiProbe.requests),[]);
    await connect();
    const projects = await page.evaluate(() => midiProbe.projects);
    for (const [i,id] of ids.entries()) {
      if (i) await action('settings').click();
      await action('learn').click();
      const start = await range(id).inputValue();
      const width = await range(id).evaluate(input => input.clientWidth);
      await range(id).click({position:{x:Math.floor(width*.8),y:8}});
      await cc(0,74+i,127); // author the assignment without moving the effect
      assert.equal(await range(id).inputValue(),start);
      await cc(1,74+i,127); // same CC on a different channel
      assert.equal(await range(id).inputValue(),start);
      await cc(0,74+i,127);
      assert.equal(await range(id).inputValue(),'1');
      await cc(0,74+i,id === 'dj' ? 64 : 0);
      assert.equal(await range(id).inputValue(),id === 'dj' ? '0.5' : '0');
      const messages = await page.evaluate(id => midiProbe.controls.filter(([k])=>k === 'livefx:'+id),id);
      assert.deepEqual(messages,[['livefx:'+id,1],['livefx:'+id,id === 'dj' ? .5 : 0]]);
    }
    assert.equal(await page.evaluate(() => midiProbe.projects),projects);
    await action('save').click();
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Saved'));
    await page.reload();
    await page.locator('[data-tab="live"]').click();
    assert.deepEqual(await page.evaluate(() => midiProbe.requests),[]);
    await connect();
    await action('close').click();
    for (const [i,id] of ids.entries()) {
      await cc(0,74+i,127);
      assert.equal(await range(id).inputValue(),'1');
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(),targets:ids,assignmentOnly:true,
      channelIsolation:true,reopenedMappings:4,wholeProjectResends:0,simulatedWebMIDI:true,errors}));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
