const assert = require('node:assert/strict');
const {createServer} = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const build = path.resolve(process.env.FREQUENCY_BUILD || 'dist');
const before = process.argv.includes('--before');
const mime = {'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
let injected = false;
// Only the isolated HTTP response is instrumented. The Web Audio render thread
// raises a real processorerror on demand, without changing studio asset files.
const server = createServer(async (req,res) => {
  try {
    let name = new URL(req.url, 'http://localhost').pathname;
    if (name.endsWith('/')) name += 'index.html';
    const file = path.resolve(build, '.' + name);
    assert.ok(file.startsWith(build + path.sep));
    let bytes = await fs.readFile(file);
    if (/\/processor-[\w-]+\.js$/.test(name)) {
      const original = bytes.toString();
      bytes = original.replace(/registerProcessor\((["'])frequency-rack-v1\1,\s*(\w+)\)/,
        (_,quote,base) => 'registerProcessor("frequency-rack-v1", class extends ' + base + ' {' +
        'constructor(...args){super(...args);this.port.addEventListener("message",e=>{if(e.data.type==="qa-fault")this.broken=true});this.port.start()}' +
        'process(...args){if(this.broken)throw Error("Controlled QA processor failure");return super.process(...args)}' +
        '})');
      injected = bytes !== original;
    }
    res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream'});
    res.end(bytes);
  } catch {res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  let browser;
  try {
    browser = await chromium.launch({channel:'chrome', headless:true});
    const p = await browser.newPage({viewport:{width:1440,height:900}});
    p.setDefaultTimeout(15000);
    await p.addInitScript(()=>{
      const native = window.AudioWorkletNode;
      const q = window.recoveryQA = {nodes:[],analysers:[],streams:[],errors:0,projects:[],starts:[],connections:[]};
      window.AudioWorkletNode = class extends native {
        set onprocessorerror(handler) {
          super.onprocessorerror = handler && function(event) {
            q.errors++;
            return handler.call(this,event);
          };
        }
        get onprocessorerror() {return super.onprocessorerror;}
        constructor(...args) {
          super(...args);
          q.nodes.push(this);
          const idx = q.nodes.length - 1;
          const send = this.port.postMessage.bind(this.port);
          this.port.postMessage = (msg,...rest) => {
            if(msg.type==='project') q.projects[idx]={name:msg.project.name,bpm:msg.project.bpm,tracks:msg.project.tracks.length};
            if(msg.type==='play') q.starts[idx]=msg.options;
            return send(msg,...rest);
          };
        }
      };
      for(const [name,key] of [['createAnalyser','analysers'],['createMediaStreamDestination','streams']]){
        const orig=AudioContext.prototype[name];
        AudioContext.prototype[name]=function(...args){const result=orig.apply(this,args);q[key].push(result);return result;};
      }
      const connect=AudioNode.prototype.connect;
      AudioNode.prototype.connect=function(dest,...args){q.connections.push([this,dest]);return connect.call(this,dest,...args);};
      q.peak=()=>{
        const an=q.analysers[0]; if(!an)return 0;
        const data=new Float32Array(an.fftSize);an.getFloatTimeDomainData(data);
        return data.reduce((m,n)=>Math.max(m,Math.abs(n)),0);
      };
    });
    const btn=id=>p.locator('[data-action="'+id+'"]').first();
    await p.goto('http://127.0.0.1:'+server.address().port+'/frequency/?lang=it');
    await p.locator('[data-field=bpm]').fill('137');
    await p.locator('[data-field=bpm]').press('Tab');
    await btn('play').click();
    await p.waitForFunction(()=>recoveryQA.starts.length && recoveryQA.peak()>0.003).catch(async error => {
      console.error('initial state', await p.evaluate(() => ({nodes:recoveryQA.nodes.length, projects:recoveryQA.projects, starts:recoveryQA.starts, peak:recoveryQA.peak(), state:document.querySelector('#state')?.textContent})));throw error;
    });
    assert.ok(injected,'production AudioWorklet fixture was served');
    const beforePeak=await p.evaluate(()=>{
      const q=recoveryQA;
      q.initialSink=JSON.stringify(q.nodes[0].context.sinkId ?? 'system-default');
      return q.peak();
    });
    await p.evaluate(()=>recoveryQA.nodes[0].port.postMessage({type:'qa-fault'}));
    await p.waitForFunction(()=>recoveryQA.errors===1 && recoveryQA.peak()<0.00001).catch(async error => {
      console.error('after failure', await p.evaluate(() => ({errors:recoveryQA.errors, peak:recoveryQA.peak(), state:document.querySelector('#state')?.textContent})));throw error;
    });
    const interrupted=await p.locator('#state').innerText();
    if(before) await btn('stop').click();
    else {
      assert.match(interrupted,/interrotto/i);
      assert.equal(await btn('play').getAttribute('aria-pressed'),'false');
    }
    await btn('play').click();
    if(before){
      await p.waitForFunction(()=>document.documentElement.dataset.play==='on');
      const broken=await p.evaluate(()=>({nodes:recoveryQA.nodes.length,peak:recoveryQA.peak(),markedPlaying:document.documentElement.dataset.play}));
      assert.deepEqual(broken,{nodes:1,peak:0,markedPlaying:'on'});
      const report={browser:browser.version(), date:new Date().toISOString(), expectedFailure:broken, interrupted};
      if(process.env.FREQUENCY_PROOF)await fs.writeFile(process.env.FREQUENCY_PROOF,JSON.stringify(report,null,2));
      console.log(JSON.stringify(report));
      return;
    }
    await p.waitForFunction(()=>recoveryQA.nodes.length===2 && recoveryQA.peak()>0.003);
    await btn('play').click();
    const result=await p.evaluate(()=>{
      const q=recoveryQA,a=q.analysers[0],ctx=q.nodes[0].context;
      return {
        nodes:q.nodes.length, analysers:q.analysers.length, streamDestinations:q.streams.length,
        sameContext:q.nodes.every(n=>n.context===ctx),sameSink:q.initialSink===JSON.stringify(q.nodes[1].context.sinkId ?? 'system-default'),
        outputEdges:q.connections.filter(([src,dst])=>src===a && dst===ctx.destination).length,
        recordEdges:q.connections.filter(([src,dst])=>src===a && dst===q.streams[0]).length,
        restartEdges:q.connections.filter(([src,dst])=>src===q.nodes[1] && dst===a).length,
        projects:q.projects, starts:q.starts, peak:q.peak(), markedPlaying:document.documentElement.dataset.play
      };
    });
    assert.equal(result.nodes,2);assert.equal(result.analysers,1);assert.equal(result.streamDestinations,1);
    assert.equal(result.recordEdges,1);assert.equal(result.outputEdges,1);assert.equal(result.restartEdges,1);
    assert.ok(result.sameContext && result.sameSink);assert.equal(result.markedPlaying,'on');
    assert.deepEqual(result.projects[1],result.projects[0]);assert.equal(result.projects[1].bpm,137);
    assert.deepEqual(result.starts[1],result.starts[0]);
    const report={browser:browser.version(),date:new Date().toISOString(),beforePeak,interrupted,...result};
    if(process.env.FREQUENCY_PROOF)await fs.writeFile(process.env.FREQUENCY_PROOF,JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally {await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
