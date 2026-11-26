const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');

(async () => {
  const browser = await chromium.launch({executablePath:process.env.FREQUENCY_BROWSER_EXEC});
  try {
    const page = await browser.newPage({hasTouch:true, viewport:{width:1280,height:800}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.transportCommands = [];
      const Worklet = AudioWorkletNode;
      window.AudioWorkletNode = class extends Worklet {
        constructor(...args) {
          super(...args);
          if (args[1] !== 'frequency-rack-v1') return;
          const send = this.port.postMessage.bind(this.port);
          this.port.postMessage = (message, ...rest) => {
            if (message.type === 'play' || message.type === 'stop') transportCommands.push(message.type);
            return send(message, ...rest);
          };
        }
      };
    });
    await page.goto(new URL('/frequency/?lang=en',process.argv[2]).href);
    const transport = page.locator('#transport');
    const loop = transport.getByRole('button',{name:'Loop · Arrangement'});
    const undo = transport.getByRole('button',{name:'Undo'});
    const redo = transport.getByRole('button',{name:'Redo'});
    const region = transport.getByRole('group',{name:'Arrangement · Loop region'});
    const first = region.getByRole('spinbutton',{name:'Start'});
    const last = region.getByRole('spinbutton',{name:'End'});
    await loop.waitFor();
    assert.ok(await undo.isDisabled() && await redo.isDisabled());
    for (const view of ['sequencer','piano','mixer','live','arrangement']) {
      const tab = page.locator('[data-tab="' + view + '"]');
      await tab.click();
      await page.locator('#editor').getByRole('heading',{level:2,name:await tab.textContent(),exact:true}).waitFor();
      for (const id of ['play','stop','record','save','export','loop','undo','redo'])
        assert.equal(await transport.locator('[data-action="' + id + '"]').count(),1);
      for (const id of ['loop','undo','redo'])
        assert.equal(await page.locator('[data-action="' + id + '"]').count(),1);
    }
    const bars = await page.locator('[data-field^="clip-bars:"]').evaluateAll(nodes =>
      nodes.reduce((total,input) => total + Number(input.value),0));
    assert.equal(await first.inputValue(),'1');
    assert.equal(await last.inputValue(),String(bars));
    assert.equal(await last.getAttribute('max'),String(bars));
    const initialClock = await page.locator('#clock').innerText();
    await transport.locator('[data-action="play"]').click();
    await page.waitForFunction(old => document.querySelector('#clock').textContent !== old, initialClock);
    const projectName = await page.evaluate(() => navigator.mediaSession.metadata.title);
    await page.locator('[data-tab="mixer"]').click();
    await loop.press('Space');
    assert.equal(await loop.getAttribute('aria-pressed'),'true');
    await first.fill('2'); await first.press('Tab');
    await last.fill('4'); await last.press('Tab');
    assert.equal(await first.getAttribute('max'),'4');
    assert.equal(await last.getAttribute('min'),'2');
    await first.fill('8'); await first.press('Tab');
    assert.equal(await first.inputValue(),'2');
    await undo.click(); assert.equal(await last.inputValue(),String(bars));
    assert.ok(await redo.isEnabled());
    await redo.press('Enter'); assert.equal(await last.inputValue(),'4');
    assert.ok(await redo.isDisabled());
    await undo.click();
    await last.fill('5'); await last.press('Tab');
    assert.ok(await redo.isDisabled());
    assert.deepEqual(await page.evaluate(() => transportCommands),['play']);
    assert.equal(await page.evaluate(() => navigator.mediaSession.metadata.title),projectName);
    assert.equal(await page.locator('html').getAttribute('data-play'),'on');
    await transport.locator('[data-action="stop"]').click();
    await transport.locator('[data-action="save"]').click();
    await page.waitForFunction(() => document.getElementById('notice').textContent.includes('Saved'));
    await page.reload();
    assert.equal(await first.inputValue(),'2');
    assert.equal(await last.inputValue(),'5');
    assert.equal(await loop.getAttribute('aria-pressed'),'true');
    await page.locator('[data-tab="live"]').click();
    const surface = page.locator('.live-faders');
    const liveMeasurements = [];
    const controls = transport.locator('.editbar button,.editbar input');
    for (const width of [320,390,768,1280]) {
      await page.setViewportSize({width,height:800});
      const boxes = await controls.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
      for (const box of boxes) assert.ok(box.left >= 0 && box.right <= width && box.width > 0);
      for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i+1))
        assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const measured = await surface.evaluate(node => {
        const inputs = [...node.querySelectorAll('input[type="range"]')];
        const boxes = inputs.map(input => input.getBoundingClientRect());
        return {
          count:inputs.length,
          labelled:inputs.every(input => input.labels.length === 1 && input.labels[0].control === input),
          minHeight:Math.min(...boxes.map(box => box.height)),
          minWidth:Math.min(...boxes.map(box => box.width)),
          fxColumns:getComputedStyle(node.querySelector('.knobs')).gridTemplateColumns.split(' ').length,
          insideViewport:boxes.every(box => box.left >= 0 && box.right <= innerWidth),
        };
      });
      assert.equal(measured.count,7);
      assert.ok(measured.labelled && measured.insideViewport);
      assert.ok(measured.minHeight >= 44 && measured.minWidth >= 44);
      if (width <= 500) assert.equal(measured.fxColumns,2);
      liveMeasurements.push({width,...measured});
    }
    await page.setViewportSize({width:390,height:800});
    const dj = surface.getByRole('slider',{name:/^DJ filter$/i});
    const djWidth = await dj.evaluate(input => input.clientWidth);
    await dj.tap({position:{x:Math.floor(djWidth*.8),y:4}});
    const touched = Number(await dj.inputValue());
    assert.ok(touched > .65 && touched < .95, 'touch near the upper edge of the range');
    await dj.press('ArrowLeft');
    assert.equal(Number(await dj.inputValue()),Math.round((touched-.01)*100)/100);
    await page.locator('[data-tab="mixer"]').click();
    await page.locator('[data-tab="live"]').click();
    assert.equal(Number(await dj.inputValue()),Math.round((touched-.01)*100)/100);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:browser.version(),views:5,widths:[320,390,768,1280],bars,
      savedLoop:[2,5],playingEdits:true,historyBranch:true,liveMeasurements,touched,errors}));
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
