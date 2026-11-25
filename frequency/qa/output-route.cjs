// Simulated output picker and device changes exercise the production studio UI.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const root = path.resolve(process.env.FREQUENCY_BUILD || 'dist');
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'};

(async()=>{
  const server=http.createServer(async(req,res)=>{
    try {
      let key=new URL(req.url,'http://localhost').pathname;
      if(key.endsWith('/'))key+='index.html';
      const file=path.resolve(root,'.'+key);
      assert.ok(file.startsWith(root+path.sep));
      const bytes=await fs.readFile(file);
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true});
    const p=await browser.newPage({viewport:{width:1440,height:900}});
    p.setDefaultTimeout(8000);
    await p.addInitScript(()=>{
      const q=window.routeQA={select:'allowed', apply:'allowed', id:'usb-a', active:'', scans:0, calls:[], devices:[{kind:'audiooutput',deviceId:'usb-a',label:'Studio A'}]};
      const media=navigator.mediaDevices;
      Object.defineProperty(media,'selectAudioOutput',{value:async()=>{
        q.activated=navigator.userActivation.isActive;
        if(q.select==='denied')throw new DOMException('Picker denied','NotAllowedError');
        return {kind:'audiooutput',deviceId:q.id,label:q.id==='usb-a'?'Studio A':'Studio B'};
      }});
      Object.defineProperty(media,'enumerateDevices',{value:async()=>{
        q.scans++;
        if(q.scanFails)throw new DOMException('Devices redacted','NotAllowedError');
        if(q.delay)await new Promise(resolve=>{q.unblock=resolve;});
        return q.devices;
      }});
      Object.defineProperty(AudioContext.prototype,'sinkId',{get(){return q.active;}});
      Object.defineProperty(AudioContext.prototype,'setSinkId',{value:async function(id){
        q.calls.push(id);
        if(q.apply==='failed')throw new DOMException('Sink unavailable','NotFoundError');
        q.active=id; q.context=this; this.dispatchEvent(new Event('sinkchange'));
      }});
    });
    const btn=id=>p.locator('[data-action="'+id+'"]').first();
    const expectText=async value=>{await p.waitForFunction(want=>document.querySelector('[data-current-output]')?.textContent===want,value);};
    const change=async()=>p.evaluate(()=>navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
    await p.goto('http://127.0.0.1:'+server.address().port+'/frequency/?lang=it');
    await btn('settings').click();
    await btn('preflight').click();
    await expectText('Uscita di sistema');
    await change();
    assert.equal(await p.evaluate(()=>routeQA.scans),0);
    await btn('close').click();await btn('settings').click();
    await p.evaluate(()=>routeQA.select='denied');await btn('audio-output').click();
    await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('non autorizzata'));
    await expectText('Uscita di sistema');
    assert.equal(await p.evaluate(()=>routeQA.scans),0);
    await p.evaluate(()=>routeQA.select='allowed');await btn('audio-output').click();
    await expectText('Studio A');
    assert.ok(await p.evaluate(()=>routeQA.activated));
    await p.evaluate(()=>{routeQA.id='usb-b';routeQA.apply='failed';});await btn('audio-output').click();
    await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Impossibile'));
    await expectText('Studio A');
    await p.evaluate(()=>routeQA.devices=[]);
    await btn('preflight').click();await expectText('Non disponibile');
    await p.evaluate(()=>{routeQA.devices=[{kind:'audiooutput',deviceId:'usb-a',label:'Studio A'}];});
    await change();await expectText('Studio A');
    await p.evaluate(()=>routeQA.devices=[]);await change();
    await expectText('Non disponibile');
    await p.evaluate(()=>{routeQA.devices=[{kind:'audiooutput',deviceId:'usb-a',label:'Studio A'}];});
    await change();await expectText('Studio A');
    await p.evaluate(()=>routeQA.scanFails=true);await change();await expectText('Uscita selezionata non verificabile');
    await p.evaluate(()=>{routeQA.scanFails=false;routeQA.active='';routeQA.context.dispatchEvent(new Event('sinkchange'));});
    await expectText('Uscita di sistema');
    await p.evaluate(()=>{routeQA.active={type:'none'};routeQA.context.dispatchEvent(new Event('sinkchange'));});
    await expectText('Uscita silenziosa');
    const data=await p.evaluate(()=>({explicitApplyAttempts:routeQA.calls,scansAfterPermission:routeQA.scans,pickerWithActivation:routeQA.activated}));
    assert.deepEqual(data.explicitApplyAttempts,['usb-a','usb-b']);
    const report={browser:browser.version(),date:new Date().toISOString(),hardware:'simulated',initialScans:0,...data,
      checks:['initial system output','denied picker','successful selection','failed change preserves previous route','missed disconnect detected on opening preflight','disconnect while preflight open','reconnection','enumeration denied','system sink change','silent sink','no automatic routing']};
    if(process.env.FREQUENCY_PROOF)await fs.writeFile(process.env.FREQUENCY_PROOF,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
