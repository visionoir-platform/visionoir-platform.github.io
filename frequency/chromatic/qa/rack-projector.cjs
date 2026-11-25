// New regressions only: two portable memories, complete scene cues and a same-turn route change + hit.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const origin = process.env.CHROMATIC_ORIGIN || 'http://127.0.0.1:4270';

(async () => {
  const browser = await chromium.launch({executablePath: process.env.BROWSER_BIN, args:['--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext({viewport:{width:860,height:680},deviceScaleFactor:2,reducedMotion:'reduce'});
    context.setDefaultTimeout(9000);
    await context.addInitScript(() => {
      window.rackProof = {frames:0,hit:null,peak:0,impact:0};
      const slots = new WeakSet();
      const gl = WebGL2RenderingContext.prototype;
      const locate = gl.getUniformLocation, update = gl.uniform1fv;
      gl.getUniformLocation = function(program,name) {
        const loc = locate.call(this,program,name);
        if (loc && /^uVoices(?:\[0\])?$/.test(name)) slots.add(loc);
        return loc;
      };
      gl.uniform1fv = function(loc,values,...args) {
        if (slots.has(loc) && window.rackProof.hit) {
          window.rackProof.peak = Math.max(window.rackProof.peak,values[15]);
          window.rackProof.impact = Math.max(window.rackProof.impact,values[0]);
        }
        return update.call(this,loc,values,...args);
      };
      window.addEventListener('message', e => {
        if (e.origin!==location.origin || e.source!==window.opener) return;
        if (e.data?.type==='visionoir.visual.frame') window.rackProof.frames++;
        if (e.data?.type==='visionoir.visual.hit') window.rackProof.hit=e.data.state?.mapping?.[0];
      });
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(new URL('/frequency/?lang=it',origin).href);
    const choose = (name) => page.getByLabel(name,{exact:true});
    const button = (name) => page.getByRole('button',{name,exact:true});
    const scene=page.locator('[data-field=scene]').first();
    await page.locator('.chromatic-rack summary').click();
    const slot=choose('Memoria preset'), mode=choose('Scena visiva');
    const warp=page.getByRole('slider',{name:'Deformazione',exact:true});
    async function store(sceneNumber, memory, functionId, percent) {
      await scene.selectOption(String(sceneNumber));
      await mode.selectOption(functionId);
      await choose('Controllo').selectOption('warp');
      await warp.evaluate((range,value)=>{range.value=String(value);range.dispatchEvent(new Event('input',{bubbles:true}));},percent);
      await slot.selectOption(String(memory));
      await button('Memorizza cambio').click();
      await button('Salva preset visivo').click();
    }
    await store(0,0,'inferno',27);
    await store(1,1,'spectral-echo',83);
    await scene.selectOption('0');
    assert.equal(await mode.inputValue(),'inferno');
    assert.equal(await warp.inputValue(),'27');
    // Exercise a stopped transport and reduced motion, even with the visual surface scrolled away.
    await scene.selectOption('1');
    assert.equal(await mode.inputValue(),'spectral-echo');
    assert.equal(await warp.inputValue(),'83');
    await page.locator('[data-action=library]').first().click();
    const fileReady = page.waitForEvent('download');
    await page.locator('[data-action=backup]').click();
    const file = await fileReady;
    const serialized = await fs.readFile(await file.path());
    const saved = JSON.parse(serialized).visual;
    assert.deepEqual(saved.presetBank.slots.slice(0,2).map(v=>v.warp),[0.27,0.83]);
    assert.deepEqual(saved.automation.map(v=>v.look.warp),[0.27,0.83]);
    await page.evaluate(()=>localStorage.removeItem('visionoir.frequency.chromatic.user-preset.v1'));
    await page.locator('#project-file').setInputFiles({name:'visual.vfreq',mimeType:'application/json',buffer:serialized});
    await page.waitForFunction(()=>!document.querySelector('#panel').open);
    await slot.selectOption('0');
    await button('Richiama preset').click();
    assert.equal(await warp.inputValue(),'27');
    await slot.selectOption('1');
    await button('Richiama preset').click();
    assert.equal(await warp.inputValue(),'83');
    const opened=page.waitForEvent('popup');
    await button('Finestra proiettore').click();
    const output=await opened;
    output.on('pageerror',e=>errors.push(e.message));
    await output.bringToFront();
    await output.waitForFunction(()=>window.rackProof?.frames>0,null,{timeout:15000}).catch(async()=>{
      const details=await output.evaluate(()=>({stage:document.querySelector('.chromatic-surface')?.dataset.render,
        hidden:document.hidden,opener:!!window.opener,monitor:window.rackProof}));
      throw Error(JSON.stringify({phase:'projector-ready',details,errors}));
    });
    await choose('Qualità').selectOption('low');
    const ratio=()=>{const c=document.querySelector('.chromatic-surface canvas');return c.width/c.getBoundingClientRect().width;};
    await output.waitForFunction(()=>{const c=document.querySelector('.chromatic-surface canvas');return c && c.width/c.getBoundingClientRect().width < .9;});
    const low = await output.evaluate(ratio);
    await choose('Qualità').selectOption('high');
    await output.waitForFunction(()=>{const c=document.querySelector('.chromatic-surface canvas');return c.width/c.getBoundingClientRect().width>1.6;});
    const high = await output.evaluate(ratio);
    const routing=choose('Risposta visiva');
    await routing.evaluate(select => {
      select.value='scatter';
      select.dispatchEvent(new Event('change',{bubbles:true}));
      [...document.querySelectorAll('.chromatic-bar button')].find(b=>b.textContent==='Impulso').click();
    });
    await output.waitForFunction(()=>window.rackProof.hit==='scatter' && window.rackProof.peak>.05,null,{timeout:6000});
    const data = await output.evaluate(()=>window.rackProof);
    assert.equal(data.impact,0);
    assert.deepEqual(errors,[]);
    const report = {browser:browser.version(),renderer:'WebGL2 Chromium software',reducedMotion:true,
      projectMemoryWarpPercent:[27,83],sceneCueWarpPercent:[27,83],projectorPixelRatio:{low,high},
      simultaneousRemapAndHit:data,errors};
    if(process.env.CHROMATIC_PROOF) await fs.writeFile(process.env.CHROMATIC_PROOF,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
