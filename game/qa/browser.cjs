/* Install Playwright and set PLAYWRIGHT_MODULE when using a shared local installation. */
const {chromium,webkit,firefox}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UNSEEN_TEST_URL||'http://127.0.0.1:4197',proof=process.env.UNSEEN_QA_DIR||'/tmp/unseen-browser-proof';
fs.mkdirSync(proof,{recursive:true});
const engineName=process.argv[2]||'chromium',engine={chromium,webkit,firefox}[engineName];
async function run(){
  const browser=await engine.launch({headless:true,...(process.env.BROWSER_BIN?{executablePath:process.env.BROWSER_BIN}:{}),timeout:18000});
  try{
    const phone=engineName!=='firefox',ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:phone,locale:'it'});
    const page=await ctx.newPage(),errors=[],missing=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push([r.status(),r.url()]);});
    const click=id=>page.locator('button[data-act="'+id+'"]').click({timeout:10000});
    await page.goto(base+'/unseen/?lang=it');
    await page.waitForURL(base+'/it/#unseen-door');
    assert.equal(await page.locator('[data-act=start]').count(),0);
    assert(!requests.some(u=>u.includes('/unseen/audio/')||u.includes('/unseen/art/')));
    requests.length=0;
    assert.equal(await page.locator('.service-grid article, [data-price]').count()>0,true);
    assert.equal(await page.locator('a#unseen-door').textContent(),'unseen.');
    assert(!requests.some(u=>u.includes('/unseen/')));
    await page.locator('a#unseen-door').click();await page.waitForSelector('[data-act=start]');
    assert(page.url().includes('/unseen/?lang=it'));assert.equal(await page.locator('html').getAttribute('lang'),'it');
    await page.screenshot({path:path.join(proof,engineName+'-title-mobile.png')});await click('start');
    await click('story');await click('hero-2');await click('launch');await click('scene-skip');await click('scene-skip');
    await page.waitForSelector('#telemetry b');let s=await page.locator('#telemetry').innerText();
    if(phone){
      const box=await page.locator('[data-input=right]').boundingBox();assert(box?.width>=30&&box?.height>=30);
      if(engineName==='chromium'){
        const cdp=await ctx.newCDPSession(page);
        const b=await page.locator('[data-input=jump]').boundingBox();
        const point=(id,r)=>({id,x:r.x+r.width/2,y:r.y+r.height/2,radiusX:3,radiusY:3});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,box)]});
        await page.waitForTimeout(200);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,box),point(2,b)]});
        assert.equal(await page.locator('.pad button.pressed').count(),2);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      }
    }
    await page.keyboard.down('d');await page.waitForTimeout(1400);await page.keyboard.up('d');assert.notEqual(await page.locator('#telemetry').innerText(),s);
    await page.screenshot({path:path.join(proof,engineName+'-game-mobile.png')});
    await click('pause');await click('options');await page.locator('#lang').selectOption('ar');await page.waitForFunction(()=>document.documentElement.dir==='rtl');
    assert.equal(await page.locator('[data-act=bind-jump]').count(),1);await click('back');await click('resume');await page.waitForSelector('#telemetry');
    await click('pause');await click('leave');await click('extras');await click('lab');await page.waitForSelector('.tracks button');
    assert.equal(await page.locator('[data-track]').count(),39);await page.locator('[data-track="7"]').click();await page.waitForFunction(()=>document.querySelector('#elapsed')?.textContent!=='0:00',{},{timeout:9500}).catch(async error=>{throw Error('music transport: '+await page.locator('#message').innerText()+' / '+await page.locator('#elapsed').innerText()+' '+JSON.stringify(errors)+' '+error);});
    await click('pause');await click('repeat');await click('sfx');assert.equal(await page.locator('[data-track]').count(),118);
    await page.locator('[data-track="9"]').click();await click('stop');await click('back');await click('back');await click('options');
    const key=await page.locator('[data-act=bind-jump]').innerText();await click('bind-jump');await page.keyboard.press('KeyZ');
    assert.notEqual(await page.locator('[data-act=bind-jump]').innerText(),key);
    await page.locator('#import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('غير'));
    const download=page.waitForEvent('download');await click('export');const d=await download;assert.equal(d.suggestedFilename(),'visionoir-unseen-save.json');
    for(const [w,h] of [[360,760],[768,1024],[1024,768],[844,390],[1440,900],[1920,1080]]){
      await page.setViewportSize({width:w,height:h});const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,bad:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1||n.getBoundingClientRect().left< -1).map(n=>[n.tagName,n.className,n.id,Math.round(n.getBoundingClientRect().width)]).slice(0,20)}));assert(overflow.width<=w+1,'overflow '+w+' '+JSON.stringify(overflow));
    }
    await page.reload();await page.waitForSelector('[data-act=start]');await page.setViewportSize({width:1440,height:900});await page.screenshot({path:path.join(proof,engineName+'-title-desktop.png')});
    for(const l of await page.locator('#lang option').evaluateAll(nodes=>nodes.map(n=>n.value))){await page.locator('#lang').selectOption(l);await page.waitForFunction(l=>document.documentElement.lang===l,l);}
    assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(missing.length,0,JSON.stringify(missing));
    console.log(JSON.stringify({engine:engineName,version:browser.version(),locales:19,scoreScreens:3,pageErrors:errors,missing}));
  }finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
