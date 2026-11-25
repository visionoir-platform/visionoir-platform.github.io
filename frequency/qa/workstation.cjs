const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit,firefox}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.FREQUENCY_PROOF;
const origin=process.env.FREQUENCY_URL||'http://127.0.0.1:4187/';
const device=process.argv[2]||'chromium';
const engine={chromium,webkit,firefox}[device];
(async()=>{
 const browser=await engine.launch({headless:true,executablePath:process.env.FREQUENCY_BROWSER_EXEC||undefined});
 const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
 const p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 const btn=a=>p.locator('[data-action="'+a+'"]').first(),field=k=>p.locator('[data-field="'+k+'"]').first();
 const act=async a=>btn(a).click();
 try{
 await p.goto(new URL('frequency/?lang=it',origin).href);
 await p.waitForSelector('[data-action="step"]');
 const cells=p.locator('[data-action=step]');assert.equal(await cells.count(),128);
 if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,device+'-desktop.png')});}
 const cell=cells.nth(1);await cell.focus();await cell.press('ArrowRight');assert.equal(await p.evaluate(()=>document.activeElement.dataset.pos),'2');await cell.focus();const pressed=await cell.getAttribute('aria-pressed');await cell.click();assert.notEqual(await cell.getAttribute('aria-pressed'),pressed);
 await act('undo');assert.equal(await cell.getAttribute('aria-pressed'),pressed);
 await act('redo');assert.notEqual(await cell.getAttribute('aria-pressed'),pressed);
 await act('edit-step');await p.locator('dialog').waitFor({state:'visible'});
 if(await p.locator('[data-action=insert-note]').count())await act('insert-note');
 await field('note:note').fill('47');await field('note:note').press('Tab');await act('close');
 await act('play');await p.waitForFunction(()=>document.documentElement.dataset.play==='on'&&document.querySelector('#clock').textContent!=='001.01.01');
 await p.waitForFunction(()=>document.querySelector('#db').textContent!=='−∞ dBFS',{},{timeout:10000});
 const output=await p.locator('#db').innerText();
 await act('stop');await p.locator('[data-tab=piano]').click();const pitchCell=(pos,note)=>p.locator('.piano-cell[data-pos="'+pos+'"][data-note="'+note+'"]');await pitchCell(3,45).click();await act('transpose-down');assert.equal(await pitchCell(3,44).getAttribute('aria-pressed'),'true');const allAt4=p.locator('.piano-cell[data-pos="4"][aria-pressed="true"]');if(await allAt4.count()){await allAt4.click();await act('delete-notes');}await pitchCell(3,44).click();await act('move-next');assert.equal(await pitchCell(4,44).getAttribute('aria-pressed'),'true');await p.locator('[data-tab=arrangement]').click();
 const n=await p.locator('.clip').count();await act('add-clip');assert.equal(await p.locator('.clip').count(),n+1);const end=p.locator('.clip').last();await end.locator('[data-action=clip-up]').click();await p.locator('[data-action=clip-marker]').first().click();await field('marker').fill('QA marker');await field('marker').press('Tab');await act('close');await p.locator('[data-action=clip-source]').first().click();await field('clip-source').selectOption('-1');
 await p.locator('[data-tab=mixer]').click();await act('mute');assert.equal(await btn('mute').getAttribute('aria-pressed'),'true');await act('mute');await act('bus-mute');assert.equal(await btn('bus-mute').getAttribute('aria-pressed'),'true');await act('bus-mute');
 await p.locator('[data-tab=live]').click();await act('launch');await p.waitForFunction(()=>document.documentElement.dataset.play==='on');await act('panic');
 await act('library');await field('name').fill('QA Memory');await field('name').press('Tab');await act('save-as');await act('close');
 await p.reload();await p.locator('.panelhead small').first().waitFor();assert.match(await p.locator('.panelhead small').first().innerText(),/QA Memory/i);
 await act('export');await field('format').selectOption('vfreq');const dl=p.waitForEvent('download');await act('render');
 const native=await dl;const fp=await native.path();const session=JSON.parse(fs.readFileSync(fp));assert.equal(session.name,'QA Memory');assert.equal(session.arrangement.length,n+1);assert.equal(session.arrangement[0].marker,'QA marker');assert.equal(session.arrangement[0].trackScenes[0],-1);const rendered=[];for(const fmt of (device==='chromium'?['midi','wav','mp3','aiff','flac']:['midi','wav'])){await field('format').selectOption(fmt);if(fmt!=='midi'){await field('render-bars').fill('1');await field('render-bars').press('Tab');}const event=p.waitForEvent('download',{timeout:60000});await act('render');const f=await event;const data=fs.readFileSync(await f.path());assert.ok(data.length>80,fmt);if(fmt!=='mp3')assert.equal(data.subarray(0,4).toString(),{midi:'MThd',wav:'RIFF',flac:'fLaC',aiff:'FORM'}[fmt]);rendered.push([fmt,data.length]);}await act('close');await p.locator('#project-file').setInputFiles({name:'corrupt.vfreq',mimeType:'application/json',buffer:Buffer.from('{x')});await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('valido'));await p.locator('#project-file').setInputFiles({name:'roundtrip.vfreq',mimeType:'application/json',buffer:fs.readFileSync(fp)});await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('QA Memory'));
 await act('settings');await field('lang').selectOption('ar');await p.waitForFunction(()=>document.documentElement.lang==='ar');assert.equal(await p.locator('html').getAttribute('dir'),'rtl');await field('lang').selectOption('it');await p.waitForFunction(()=>document.documentElement.lang==='it');
 let offlineVerified=false;const offlineBtn=btn('offline');if(device==='chromium'&&await offlineBtn.isEnabled()){
  await act('offline');await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('offline'),{},{timeout:20000});await act('close');
  await p.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await p.reload();await p.waitForSelector('[data-action=play]');await act('play');await p.waitForFunction(()=>document.documentElement.dataset.play==='on');
  await act('panic');await act('settings');await field('lang').selectOption('ja');await p.waitForFunction(()=>document.documentElement.lang==='ja');await act('close');await context.setOffline(false);offlineVerified=true;
 }else await act('close');
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 if(out)await p.screenshot({path:path.join(out,device+'-mobile.png')});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({device,browser:browser.version(),output,steps:await cells.count(),save:session.name,locale:'ar',width:390,offlineVerified,rendered,errors,checks:'edit, undo/redo, note, play/stop, peak, piano, arrangement, mixer, scene launch, panic, save/reload, native export, RTL, offline'},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
