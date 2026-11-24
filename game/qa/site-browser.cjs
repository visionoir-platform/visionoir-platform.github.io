// npm project with Playwright, or set PW_MODULE to the local installation.
// BROWSER=firefox|chromium|webkit, EXECUTABLE optional, QA_URL=local Pages preview.
const {mkdtempSync, rmSync, mkdirSync, writeFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const pw = require(process.env.PW_MODULE || 'playwright');
const name = process.env.BROWSER || 'firefox';
const root = (process.env.QA_URL || 'http://127.0.0.1:4197').replace(/\/$/,'');
const proof = process.env.PROOF || tmpdir();
const digest = value => createHash('sha256').update(value).digest('hex');
const locales='it en es ru de zh-Hans ja pt-BR pt-PT ko pl fr uk ar sw de-CH fr-CH it-CH rm-CH'.split(' ');
async function check() {
  mkdirSync(proof,{recursive:true});
  const temporary = mkdtempSync(join(tmpdir(),'visionoir-gecko-data-'));
  let browser;
  try {
    browser = await pw[name].launch({headless:true, executablePath:process.env.EXECUTABLE || undefined,
      env: name==='firefox' && process.platform==='darwin' ? {...process.env,CFFIXED_USER_HOME:temporary} : process.env});
    const page = await browser.newPage({viewport:{width:1365,height:850}});
    page.setDefaultTimeout(13000);
    const errors=[],downloads=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',req=>{if(req.url().includes('/unseen/'))downloads.push(req.url());});
    await page.goto(root+'/it/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>['fallback','webgl'].includes(document.querySelector('#logo-scene')?.dataset.renderState));
    const scene=page.locator('#logo-scene');
    const state=await scene.evaluate(n=>({...n.dataset}));
    const first=await scene.screenshot();await page.waitForTimeout(360);
    const next=await scene.screenshot();
    const hashes=[digest(first),digest(next)];
    if(state.renderState==='webgl')assert.notEqual(hashes[0],hashes[1]);
    writeFileSync(join(proof,'site-'+name+'-logo.png'),next);
    await page.mouse.move(300,300);await page.waitForSelector('canvas.metal-trail',{state:'attached'});
    await page.mouse.move(460,295,{steps:8});
    assert.equal(await page.locator('.metal-trail').getAttribute('data-active'),'true');
    assert.equal(await page.locator('.metal-trail').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
    await page.mouse.wheel(0,560);
    await page.waitForFunction(()=>scrollY>150);
    await page.waitForFunction(()=>document.querySelector('.metal-trail')?.dataset.active==='false');
    await page.locator('button[data-track=acid]').click();
    await page.waitForFunction(()=>document.body.dataset.mode==='acid');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--track-accent').trim()),'#dfff5e');
    await page.waitForFunction(()=>document.querySelector('#sound-toggle')?.getAttribute('aria-pressed')==='true');
    await page.locator('#sound-toggle').click();
    await page.waitForFunction(()=>document.querySelector('#sound-toggle')?.getAttribute('aria-pressed')==='false');
    await page.locator('.service-card-custom [data-service]').click();
    assert.equal(await page.locator('select[name=service]').inputValue(),'packX');
    assert.equal(await page.locator('a.social').getAttribute('href'),'https://www.instagram.com/visionoir_/');
    await page.locator('#motion-toggle').click();
    await page.waitForFunction(()=>document.documentElement.classList.contains('reduced-motion'));
    for(const [i,lang] of locales.entries()){
      await page.setViewportSize({width:[360,390,768,1024,1440,1920][i%6],height:845});
      await page.goto(root+'/'+lang.toLowerCase()+'/',{waitUntil:'domcontentloaded'});
      assert.equal(await page.locator('html').getAttribute('lang'),lang);
      assert.equal(await page.locator('[data-service]').count(),6);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    assert.equal(downloads.length,0);
    const result={browser:name,version:browser.version(),scene:state,framesDiffer:hashes[0]!==hashes[1],frameSHA256:hashes,locales:locales.length,
      pointer:true,scroll:true,trailFades:true,packX:true,acid:true,audioPlayPause:true,ordinaryGameRequests:downloads.length,errors};
    if(name==='chromium'){
      const mobile = await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
      const p=await mobile.newPage();await p.goto(root+'/ar/');const cdp=await mobile.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:185,y:585}]});
      await p.waitForSelector('canvas.metal-trail',{state:'attached'});
      for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:185,y:585-i*29}]});
      assert.equal(await p.locator('.metal-trail').getAttribute('data-active'),'true');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await p.waitForFunction(()=>scrollY>0&&document.querySelector('.metal-trail')?.dataset.active==='false');
      result.mobileTouchScroll=await p.evaluate(()=>scrollY);await mobile.close();
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify(result));
    writeFileSync(join(proof,'site-'+name+'.json'),JSON.stringify(result,null,2));
  } finally {
    await browser?.close();
    try{rmSync(temporary,{recursive:true,force:true,maxRetries:4,retryDelay:150});}catch(error){console.warn("Temporary test directory still in use:",error.code);}
  }
}
check().catch(error=>{console.error(error);process.exitCode=1;});
