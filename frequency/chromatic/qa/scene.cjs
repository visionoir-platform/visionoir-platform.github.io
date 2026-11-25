const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const origin=process.env.CHROMATIC_ORIGIN||'http://127.0.0.1:4271',proof=process.env.CHROMATIC_PROOF;
if(!proof)throw Error('Set CHROMATIC_PROOF to a private evidence folder.');
fs.mkdirSync(proof,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_BIN,args:['--enable-unsafe-swiftshader']});
 try{
 const page=await browser.newPage({viewport:{width:920,height:740},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.text().includes('VISIONOIR shader:'))errors.push(msg.text());});
 // Use dev server to resolve the exact modules consumed by the live build.
 await page.context().route('**/__chromatic-qa__*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Chromatic QA</title></head><body><script type="module">if(new URLSearchParams(location.search).get("view")==="vj"){const m=await import("/frequency/chromatic/index.js"); await m.mountVJ(document.body)}</script></body></html>'}));
 await page.goto(origin+'/__chromatic-qa__');
 await page.evaluate(async()=>{
  await import('/frequency/chromatic/styles.css');
  const h=document.createElement('div');h.id='test-stage';document.body.append(h);document.body.style.cssText='margin:0;background:#06080b;color:white';h.style.cssText='width:920px;height:740px;position:relative;';
  const {mountCreator}=await import('/src/creator/index.js');window.input={bass:0,mid:0,high:0,level:0};window.mode='chrome';
  window.mounted=mountCreator(h,{getMode:()=>window.mode,getSignal:()=>window.input,posterURL:'/assets/logo.svg'});
 });
 await page.waitForFunction(()=>document.querySelector('#test-stage')?.dataset.render==='webgl',null,{timeout:25000}).catch(async e=>{throw Error(JSON.stringify({error:e.message,errors,state:await page.locator('#test-stage').getAttribute('data-render')}));});
 await page.locator('#test-stage').screenshot({path:path.join(proof,'portrait-rest.png')});
 await page.evaluate(()=>{window.mounted.setLook('natural');});await page.waitForTimeout(180);
 await page.locator('#test-stage').screenshot({path:path.join(proof,'portrait-natural.png')});
 await page.evaluate(()=>{window.mounted.setLook('metal');window.input={bass:.84,mid:.7,high:.74,level:.82};window.mode='aura';});await page.waitForTimeout(1100);
 await page.locator('#test-stage').screenshot({path:path.join(proof,'portrait-aura.png')});
 await page.evaluate(async()=>{
  window.mounted.dispose();const h=document.querySelector('#test-stage');h.style.cssText='position:relative;width:612px;margin:18px auto';h.innerHTML='';
  const {mountChromatic}=await import('/frequency/chromatic/index.js');window.studio=await mountChromatic(h,{locale:'it',getSignal:()=>({...window.input,bpm:144,beat:2,voices:Array.from({length:16},(_,i)=>i%3===0?.7:.15)})});
 });
 await page.waitForFunction(()=>document.querySelector('.chromatic-surface')?.dataset.render==='webgl',null,{timeout:20000});
 const names=await page.locator('.chromatic-head select option').evaluateAll(opts=>opts.map(o=>o.value));
 for(const mode of names){await page.locator('.chromatic-head select').selectOption(mode);await page.waitForTimeout(1050);await page.locator('.chromatic-surface').screenshot({path:path.join(proof,mode+'.png')});}
 await page.locator('.chromatic-rack summary').click();await page.getByRole('button',{name:'Apprendi MIDI'}).click();
 const midi=await page.evaluate(()=>{window.studio.handleCC(0,74,.28);return window.studio.getState();});assert.equal(midi.intensity,.28);assert.equal(midi.midi['0:74'],'intensity');
 await page.getByRole('button',{name:'Salva preset visivo'}).click();await page.getByRole('button',{name:'Ripristina'}).click();await page.getByRole('button',{name:'Richiama preset'}).click();
 assert.equal((await page.evaluate(()=>window.studio.getState())).intensity,.28);
 await page.getByRole('button',{name:'Congela'}).click();assert.equal((await page.evaluate(()=>window.studio.getState())).freeze,true);
 await page.getByRole('button',{name:'Congela'}).click();
 const opened=page.waitForEvent('popup');await page.getByRole('button',{name:'Finestra proiettore'}).click();const second=await opened;
 await second.waitForFunction(()=>document.querySelector('.chromatic-projector .chromatic-surface')?.dataset.render==='webgl');
 await page.locator('.chromatic-head select').selectOption('inferno');
 await second.waitForFunction(()=>document.querySelector('.chromatic-projector .chromatic-surface')?.dataset.visualMode==='inferno');
 assert.equal(await second.locator('audio,video,input,select').count(),0);
 await second.close();
 assert.equal(names.length,16);assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(proof,'render.json'),JSON.stringify({browser:browser.version(),device:'Chromium desktop with software WebGL2',names,errors,midi:true,userPreset:true,freeze:true,projectorPopup:true},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
